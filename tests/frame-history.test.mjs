import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {summarizeBenchmarkRuns,compareBenchmarkRuns,createBenchmarks} from '../src/free/benchmarks.mjs';
import {summarizeFrameSeries} from '../src/free/frame-series.mjs';

const balanced='381b4222-f694-41f0-9685-ff5bb260df2e',high='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const frameSummary=()=>summarizeFrameSeries({version:'2.3.1',presentRuntime:'D3D11',timingSource:'MsBetweenPresents',timingDefinition:'present-interval',quality:{hagsEnabled:false,vulkan:false,notes:[]},frames:Array.from({length:200},(_,index)=>({t:index*4,msBetweenPresents:4,msCPUBusy:1,msGPUBusy:2,presentRuntime:'D3D11',presentMode:'Hardware: Independent Flip',allowsTearing:true})),dropped:0,invalidRows:0});
const row=(source,context={})=>({id:source,sourceName:source+'.log',sourceSHA256:source,importedAt:'2026-10-19T12:00:00Z',averageFps:200,onePercentLow:100,frameTimeMs:5,durationSeconds:120,context:{version:1,type:'baseline',powerPlan:balanced,powerReason:'benchmark-keep-current',...context}});
const store=createBenchmarks('unused-fixture');
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-frame-history-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,api:createBenchmarks(path.join(directory,'history'))};}

test('one run carries ETW statistics and actual power alongside unchanged VProf output',()=>{
  const frames=frameSummary(),result=summarizeBenchmarkRuns([row('before',{frametimes:frames})]);assert.equal(result.averageFps,200);assert.equal(result.onePercentLow,100);assert.equal(result.frametimes.medianMs,4);assert.equal(result.frametimes.onePercentLowFps,250);assert.equal(result.frametimes.cpuBusyRatio,.25);assert.equal(result.powerPlan,balanced);assert.equal(result.powerReason,'benchmark-keep-current');assert.equal(frames.gpuBusyRatio,.5);
});
test('multiple summaries remain unavailable instead of averaging incompatible distributions',()=>{
  const first=row('first',{frametimes:frameSummary()}),second=row('second',{frametimes:{...frameSummary(),medianMs:200}}),result=summarizeBenchmarkRuns([first,second]);assert.equal(result.runs,2);assert.equal(result.frametimes.status,'unavailable');assert.match(result.frametimes.reason,/cada execução individual/);assert.equal(result.frametimes.medianMs,undefined);assert.equal(result.powerPlan,balanced);assert.equal(summarizeBenchmarkRuns([first,row('other',{powerPlan:high})]).powerPlan,'unknown');
});
test('comparison warns when actual plans or collection status/enabled differ',()=>{
  const before=row('before',{frametimes:{...frameSummary(),enabled:true}}),after=row('after',{powerPlan:high,frametimes:{status:'unavailable',enabled:false,reason:'disabled'}});const result=compareBenchmarkRuns([before],[after]);assert.ok(result.warnings.some(note=>note.includes('planos de energia efetivamente')));assert.ok(result.warnings.some(note=>note.includes('ativação ou disponibilidade diferente')));assert.equal(result.before.frametimes.status,'available');assert.equal(result.after.frametimes.status,'unavailable');assert.equal(compareBenchmarkRuns([row('unknown',{powerPlan:'unknown'})],[row('known')]).warnings.some(note=>note.includes('planos de energia efetivamente')),false);
});
test('absent capture versus unavailable capture is disclosed and matching legacy absence is not fabricated',()=>{
  const result=compareBenchmarkRuns([row('none')],[row('denied',{frametimes:{status:'unavailable',reason:'permission denied'}})]);assert.ok(result.warnings.some(note=>note.includes('coleta detalhada')));const legacy=compareBenchmarkRuns([row('old1')],[row('old2')]);assert.equal(legacy.before.frametimes.status,'unavailable');assert.equal(legacy.warnings.some(note=>note.includes('coleta detalhada')),false);
});
test('VProf and ETW divergence threshold is configurable without replacing either measurement',()=>{
  const frames=frameSummary(),before=row('before',{frametimes:frames}),after=row('after',{frametimes:frames});const result=compareBenchmarkRuns([before],[after]);assert.equal(result.before.averageFps,200);assert.equal(result.before.frametimes.meanFps,250);assert.ok(result.warnings.some(note=>note.includes('Fontes diferentes; definições diferentes')));assert.equal(result.frameDivergenceThreshold,.1);const tolerant=compareBenchmarkRuns([before],[after],{frameDivergenceThreshold:.3});assert.equal(tolerant.warnings.some(note=>note.includes('limiar de conferência')),false);assert.equal(compareBenchmarkRuns([before],[after],{frameDivergenceThreshold:'unknown'}).frameDivergenceThreshold,.1);
});
test('HTML exports keep missing frametimes and power as unavailable rather than zero',()=>{
  const html=store.renderHtml(row('legacy',{powerPlan:'unknown',powerReason:'unknown'}));for(const label of ['Intervalo mediano','P95 do intervalo','P99 do intervalo','1% low · ETW','Picos de intervalo','Razão CPU / intervalo'])assert.ok(html.includes('<dt>'+label+'</dt><dd>Indisponível</dd>'));assert.match(html,/Plano efetivamente usado: Indisponível/);assert.match(html,/P1 · VProf/);assert.match(html,/Indício, uma execução por lado/);
});
test('HTML exports show real distributions, independent definitions and escaped ETW text',()=>{
  const frames=frameSummary();frames.predominantPresentMode='<script>alert(1)</script>';frames.quality.notes=['<img onerror="bad">'];const html=store.renderHtml(row('rich',{frametimes:frames}));assert.match(html,/<dt>Intervalo mediano<\/dt><dd>4\.00 ms/);assert.match(html,/<dt>1% low · ETW<\/dt><dd>250\.00 FPS/);assert.match(html,/<dt>Picos de intervalo<\/dt><dd>0<\/dd>/);assert.match(html,/ceil\(N × 0,01\)/);assert.match(html,/diferente do P1 VProf/);assert.match(html,/Equilibrado/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img /);
});
test('comparison HTML carries ETW values for both sides and neutral observed differences',()=>{
  const frames=frameSummary(),result=compareBenchmarkRuns([row('before',{frametimes:frames})],[{...row('after',{frametimes:{...frames,p99Ms:8}}),averageFps:220}]),html=store.renderComparisonHtml(result);assert.match(html,/Diferença observada/);assert.equal((html.match(/Quadros · PresentMon ETW/g)||[]).length,2);assert.match(html,/<dt>P99 do intervalo<\/dt><dd>4\.00 ms/);assert.match(html,/<dt>P99 do intervalo<\/dt><dd>8\.00 ms/);assert.match(html,/Fontes diferentes; definições diferentes/);
});
test('old summaries cannot expose busy ratios without confirmed quality',()=>{
  for(const quality of [{hagsEnabled:true,vulkan:false},{hagsEnabled:'unknown',vulkan:false},{hagsEnabled:false,vulkan:'unknown'}]){const frames={...frameSummary(),quality,bottleneck:{class:'gpu-bound',confidence:'high',reasons:['fabricated']}};const result=summarizeBenchmarkRuns([row('quality',{frametimes:frames})]);assert.equal(result.frametimes.cpuBusyRatio,'unknown');assert.equal(result.frametimes.gpuBusyRatio,'unknown');assert.equal(result.frametimes.bottleneck.class,'unknown');assert.equal(result.frametimes.bottleneck.confidence,'low');assert.match(store.renderHtml(row('quality',{frametimes:frames})),/<dt>Razão GPU \/ intervalo<\/dt><dd>Indisponível<\/dd>/);assert.match(store.renderHtml(row('quality',{frametimes:frames})),/HAGS ativo ou não confirmado|API gráfica não confirmada/);assert.equal(frames.gpuBusyRatio,.5);}
});
test('history JSON and CSV persist ETW separately with unavailable cells and formula protection',async t=>{
  const {directory,api}=await fixture(t),source=path.join(directory,'before.log');await fs.writeFile(source,'[VProf] FPS: Avg=200, P1=100');const frames=frameSummary();frames.predominantPresentMode='=FORMULA()';frames.p99Ms='unknown';const report=await api.importFile(source,{context:row('source',{frametimes:frames}).context});assert.equal((await api.read(report.id)).context.frametimes.onePercentLowFps,250);const json=JSON.parse(await api.exportHistory('json'));assert.equal(json.reports[0].averageFps,200);assert.equal(json.reports[0].context.frametimes.p99Ms,'unknown');const csv=await api.exportHistory('csv');assert.match(csv,/"P1 \(VProf\)"/);assert.match(csv,/"ETW P99 \(ms\)"/);assert.match(csv,/"200";"100"/);assert.ok(csv.includes('"\'=FORMULA()"'));assert.match(csv,/"Indisponível"/);assert.ok(csv.includes('"'+balanced+'"'));
});
test('diagnóstico de gargalo passa ao histórico e HTML com escape de razões',async t=>{
  const {directory,api}=await fixture(t),source=path.join(directory,'diagnosis.log');await fs.writeFile(source,'[VProf] FPS: Avg=200, P1=100');const frames=frameSummary();frames.bottleneck={class:'cpu-bound',confidence:'medium',reasons:['<script>alert(1)</script> CPU ocupado']};const report=await api.importFile(source,{context:row('diagnosis',{frametimes:frames}).context});const saved=await api.read(report.id);assert.equal(saved.context.frametimes.bottleneck.class,'cpu-bound');const html=api.renderHtml(saved);assert.match(html,/Indício de limite pela CPU/);assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);const csv=await api.exportHistory('csv');assert.match(csv,/<script>alert/);assert.match(csv,/ETW confiança qualitativa/);
});
