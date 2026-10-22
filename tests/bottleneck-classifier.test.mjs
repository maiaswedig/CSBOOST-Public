import test from 'node:test';
import assert from 'node:assert/strict';
import {BOTTLENECK_THRESHOLDS,classifyBottleneck} from '../src/free/bottleneck-classifier.mjs';

const frame=(overrides={})=>({t:0,msBetweenPresents:5,msCPUBusy:1,msGPUBusy:1,msGPUWait:.2,syncInterval:0,presentRuntime:'D3D11',...overrides});
const series=(overrides={},count=240)=>({status:'available',presentRuntime:'D3D11',timingDefinition:'present-interval',quality:{hagsEnabled:false,vulkan:false},frames:Array.from({length:count},(_,index)=>frame({t:index*5,...overrides})),truncated:false});

test('classifica GPU-bound por ocupação consistente da GPU e baixa espera',()=>{
  const result=classifyBottleneck(series({msBetweenPresents:5,msCPUBusy:1,msGPUBusy:4.7,msGPUWait:.15}));
  assert.equal(result.class,'gpu-bound');assert.ok(['medium','high'].includes(result.confidence));assert.ok(result.reasons.some(value=>value.includes('MsGPUBusy')));
});

test('classifica CPU-bound com folga observada de GPU sem alegar thread saturada',()=>{
  const result=classifyBottleneck(series({msBetweenPresents:5,msCPUBusy:4.6,msGPUBusy:1.2,msGPUWait:.2}));
  assert.equal(result.class,'cpu-bound');assert.ok(result.reasons.some(value=>value.includes('não separa saturação de uma thread')));
});

test('classifica cap-limited somente com intervalo estável, CPU/GPU ociosas e explicação de SyncInterval',()=>{
  const result=classifyBottleneck(series({msBetweenPresents:1000/60,msCPUBusy:1.5,msGPUBusy:.8,msGPUWait:.2,syncInterval:1}));
  assert.equal(result.class,'cap-limited');assert.equal(result.context.vsync,true);assert.ok(result.reasons.some(value=>value.includes('SyncInterval solicitado')));
});

test('telemetria de limitador só classifica térmico/potência sob contrato validado e amostra mínima',()=>{
  const input=series();
  const valid=classifyBottleneck(input,{thermalPower:{status:'available',providerValidated:true,source:'fixture-provider',limitActive:true,limitType:'thermal',samples:12}});
  assert.equal(valid.class,'thermal-or-power');assert.notEqual(valid.confidence,'high');assert.ok(valid.reasons.some(value=>value.includes('limitação térmica')));
  for(const telemetry of [
    {status:'available',providerValidated:false,source:'fixture-provider',limitActive:true,limitType:'thermal',samples:12},
    {status:'available',providerValidated:true,source:'fixture-provider',limitActive:true,limitType:'power',samples:2},
  ])assert.equal(classifyBottleneck(input,{thermalPower:telemetry}).class,'unknown');
});

test('não infere limitação térmica de frequência baixa ou de telemetria ausente',()=>{
  const input=series();input.cpuFrequencyMHz=400;input.gpuFrequencyMHz=300;
  const result=classifyBottleneck(input,{isLaptop:true});assert.equal(result.class,'unknown');assert.ok(result.reasons.some(value=>value.includes('não há telemetria validada')));
});

test('HAGS ativo ou desconhecido impede classificação CPU/GPU/cap e confiança alta',()=>{
  for(const hagsEnabled of [true,'unknown']){
    const input=series({msBetweenPresents:1000/60,msCPUBusy:1,msGPUBusy:.5,msGPUWait:.1,syncInterval:1});
    const result=classifyBottleneck(input,{hagsEnabled});assert.equal(result.class,'unknown');assert.notEqual(result.confidence,'high');assert.ok(result.reasons.some(value=>value.includes('HAGS')));
  }
});

test('Vulkan, runtime Other e runtime desconhecido não liberam classificação CPU/GPU',()=>{
  for(const input of [{...series({msCPUBusy:4.8,msGPUBusy:1}),presentRuntime:'Other'},{...series(),quality:{hagsEnabled:false,vulkan:true}},{...series(),presentRuntime:'Other',frames:Array.from({length:240},()=>frame({presentRuntime:'Other'}))},{...series(),presentRuntime:'unknown'}]){
    const result=classifyBottleneck(input);assert.equal(result.class,'unknown');assert.notEqual(result.confidence,'high');
  }
});

test('séries curtas, incompletas ou sem tempos ocupados permanecem desconhecidas',()=>{
  assert.equal(classifyBottleneck(series({},30)).class,'unknown');
  const absent=series();absent.status='unavailable';assert.equal(classifyBottleneck(absent).class,'unknown');
  const missing=series({msCPUBusy:'unknown',msGPUBusy:'unknown'});assert.equal(classifyBottleneck(missing).class,'unknown');
  const wrongDefinition=series();wrongDefinition.timingDefinition='cpu-frame-interval';assert.equal(classifyBottleneck(wrongDefinition).class,'unknown');
});

test('contradição de métricas e contexto de VSync não são convertidos em diagnóstico',()=>{
  const impossible=series({msBetweenPresents:5,msCPUBusy:20,msGPUBusy:20,msGPUWait:1});
  assert.equal(classifyBottleneck(impossible).class,'unknown');
  const conflict=series({msBetweenPresents:1000/60,msCPUBusy:1,msGPUBusy:.5,msGPUWait:.1,syncInterval:0});
  const result=classifyBottleneck(conflict,{vsync:true});assert.equal(result.class,'unknown');assert.ok(result.reasons.some(value=>value.includes('contradiz')));
});

test('limiar efetivo só explica cap quando coincide com intervalo fixo; cap persistido não é tratado como ativo',()=>{
  const capped=series({msBetweenPresents:10,msCPUBusy:1,msGPUBusy:.5,msGPUWait:.1,syncInterval:0});
  const effective=classifyBottleneck(capped,{fpsCap:{value:100,effective:true,source:'live-game-query'}});
  assert.equal(effective.class,'cap-limited');assert.equal(effective.context.fpsCap,100);
  const persisted=classifyBottleneck(capped,{fpsCap:{persistedValue:100,effective:false,source:'saved-config-before-benchmark'}});
  assert.equal(persisted.class,'unknown');assert.equal(persisted.context.fpsCap,'unknown');assert.equal(persisted.context.persistedFpsCap,100);
});

test('limiares ficam disponíveis, limitados e documentados como experimentais',()=>{
  const result=classifyBottleneck(series(),{}, {minFrames:999999,consistentShare:.2});
  assert.equal(result.methodology.thresholds.minFrames,BOTTLENECK_THRESHOLDS.minFrames);
  assert.equal(result.methodology.thresholds.consistentShare,BOTTLENECK_THRESHOLDS.consistentShare);
  assert.match(result.methodology.calibration,/não são padrão da indústria/);
});
