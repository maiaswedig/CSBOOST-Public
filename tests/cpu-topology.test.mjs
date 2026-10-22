import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createCpuTopology,describeCpuTopology} from '../src/free/cpu-topology.mjs';

const execute=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=({name='AMD Ryzen 7 5800X 8-Core Processor',vendor='AuthenticAMD',count=16,split=false,sizes=[32*1024**2,32*1024**2],hybrid=false}={})=>({schemaVersion:1,source:'GetSystemCpuSetInformation/RelationCache',cpuName:name,cpuVendor:vendor,processorGroups:1,activeLogicalProcessors:count,cpuSetsStatus:'available',cacheStatus:'available',gameMode:'enabled',queryDurationMs:1.25,warnings:[],cpuSets:Array.from({length:count},(_,i)=>({id:256+i,group:0,logicalProcessorIndex:i,coreIndex:Math.floor(i/2),lastLevelCacheIndex:split&&i>=count/2?1:0,numaNodeIndex:0,efficiencyClass:hybrid&&i<count/2?1:0,parked:split&&i>=count/2,allocated:false,allocatedToTargetProcess:false,realTime:false})),caches:split?[{level:3,sizeBytes:sizes[0],cacheType:0,groups:[{group:0,mask:((1n<<BigInt(count/2))-1n).toString(16)}]},{level:3,sizeBytes:sizes[1],cacheType:0,groups:[{group:0,mask:(((1n<<BigInt(count/2))-1n)<<BigInt(count/2)).toString(16)}]}]:[{level:3,sizeBytes:sizes[0],cacheType:0,groups:[{group:0,mask:((1n<<BigInt(count))-1n).toString(16)}]}]});

test('Ryzen convencional: um domínio completo e tamanho L3 exato, sem inferir controle',()=>{
  const result=describeCpuTopology(fixture());assert.equal(result.supported,true);assert.equal(result.x3d,'no');assert.equal(result.domains[0].l3Bytes,33554432);assert.equal(result.domains[0].l3Match,'exact');assert.equal(result.domains[0].physicalCores,8);assert.equal(result.automationEligible,false);assert.equal(result.readOnly,true);assert.equal(result.polling.gameSessionSampling,false);
});
test('X3D de um CCD: nome positivo independe de inferência de tamanho',()=>{
  const result=describeCpuTopology(fixture({name:'AMD Ryzen 7 5800X3D 8-Core Processor',sizes:[96*1024**2]}));assert.equal(result.x3d,'yes');assert.equal(result.x3dEvidence,'cpu-name-x3d');assert.equal(result.domains[0].role,'unknown');
});
test('nome Ryzen HX3D móvel explícito também é evidência positiva',()=>{
  const result=describeCpuTopology(fixture({name:'AMD Ryzen 9 9955HX3D 16-Core Processor',split:true,sizes:[96*1024**2,32*1024**2]}));assert.equal(result.x3d,'yes');assert.equal(result.x3dEvidence,'cpu-name-x3d');
});
test('X3D dois CCDs: domínios por group/cache index; Parked observado não é execução CS2',()=>{
  const result=describeCpuTopology(fixture({name:'AMD Ryzen 9 7950X3D 16-Core Processor',count:32,split:true,sizes:[96*1024**2,32*1024**2]}));assert.equal(result.x3d,'yes');assert.equal(result.cacheAsymmetry,'yes');assert.deepEqual(result.domains.map(item=>item.parked),['no','yes']);assert.deepEqual(result.domains.map(item=>item.l3Bytes),[100663296,33554432]);assert.equal(result.health.frequencyDomainParked,'unknown');assert.equal(result.health.cs2RunningOnCacheDomain,'unknown');assert.equal(result.physicalValidation.dualCcdX3d,'not-validated');
});
test('L3 assimétrico genérico não comprova X3D',()=>{
  const result=describeCpuTopology(fixture({name:'AMD Ryzen 9 7950X 16-Core Processor',split:true,sizes:[96*1024**2,32*1024**2]}));assert.equal(result.cacheAsymmetry,'yes');assert.equal(result.x3d,'unknown');assert.ok(result.warnings.some(item=>item.includes('não provam')));
});
test('Intel híbrido preserva classes numéricas sem escolher P/E cores',()=>{
  const result=describeCpuTopology(fixture({name:'12th Gen Intel(R) Core(TM) i9-12900K',vendor:'GenuineIntel',hybrid:true}));assert.equal(result.x3d,'no');assert.equal(result.heterogeneousClasses,'yes');assert.deepEqual(result.efficiencyClasses,[0,1]);assert.equal(result.domains[0].role,'unknown');assert.equal(result.physicalValidation.intelHybrid,'not-validated');
});
test('Intel convencional não é X3D, sem concluir que só uma classe prova arquitetura homogênea',()=>{
  const result=describeCpuTopology(fixture({name:'Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz',vendor:'GenuineIntel'}));assert.equal(result.x3d,'no');assert.equal(result.heterogeneousClasses,'no');assert.equal(result.health.vCacheOptimizer,'unknown');assert.equal(result.health.xboxGameBar,'unknown');
});
test('VM/CPU sem nome ou API deixa triestado desconhecido',()=>{
  const raw=fixture({name:null,vendor:null});raw.cpuSetsStatus='unknown';raw.cpuSets=[];raw.caches=[];raw.cacheStatus='unknown';const result=describeCpuTopology(raw);assert.equal(result.supported,false);assert.equal(result.x3d,'unknown');assert.equal(result.cacheAsymmetry,'unknown');assert.deepEqual(result.domains,[]);
});
test('inventário incompleto nunca transforma nome convencional em no',()=>{
  const raw=fixture();raw.cpuSets.pop();const result=describeCpuTopology(raw);assert.equal(result.supported,false);assert.equal(result.x3d,'unknown');assert.equal(result.reason,'topology-incomplete');
});
test('nome X3D positivo pode ser mantido sem topologia completa',()=>{
  const raw=fixture({name:'AMD Ryzen 7 9800X3D 8-Core Processor'});raw.cpuSetsStatus='unknown';raw.cpuSets=[];const result=describeCpuTopology(raw);assert.equal(result.supported,false);assert.equal(result.x3d,'yes');
});
test('multigrupo e mais de 64 lógicos recusam diagnóstico aplicável',()=>{
  for(const change of [{processorGroups:2},{activeLogicalProcessors:128}]){const result=describeCpuTopology({...fixture(),...change});assert.equal(result.supported,false);assert.equal(result.reason,'unsupported-processor-groups');assert.deepEqual(result.domains,[]);}
  const raw=fixture();raw.cpuSets[8].group=1;assert.equal(describeCpuTopology(raw).reason,'unsupported-processor-groups');
});
test('casamento L3 exige máscara completa, grupo exato e candidato único',()=>{
  for(const mutate of [raw=>raw.caches[0].groups[0].mask='ff',raw=>raw.caches[0].groups[0].mask='1ffff',raw=>raw.caches[0].groups[0].group=1,raw=>raw.caches.push(structuredClone(raw.caches[0])),raw=>raw.cacheStatus='unknown']){const raw=fixture();mutate(raw);const result=describeCpuTopology(raw);assert.equal(result.domains[0].l3Bytes,null);assert.equal(result.domains[0].l3Match,'unknown');assert.equal(result.x3d,'unknown');}
});
test('flags de CPU Sets mantidas, sem confundir alocação com execução de jogo',()=>{
  const raw=fixture();Object.assign(raw.cpuSets[0],{parked:true,allocated:true,allocatedToTargetProcess:true,realTime:true});const result=describeCpuTopology(raw);assert.equal(result.domains[0].parked,'partial');assert.equal(result.domains[0].parkedLogicalProcessors,1);assert.equal(result.domains[0].cpuSets[0].realTime,true);assert.equal(result.health.cs2RunningOnCacheDomain,'unknown');
});
test('adapter lê sob demanda e expõe amostragem da sessão sem setters; falhas viram unknown',async()=>{
  const requests=[],api=createCpuTopology({runWorker:async request=>{requests.push(request);return fixture();},now:()=> '2026-10-19T18:00:00.000Z'});assert.deepEqual(Object.keys(api),['inspect','startSessionSampling','stopSessionSampling','sessionSampling']);const result=await api.inspect();assert.equal(result.capturedAt,'2026-10-19T18:00:00.000Z');assert.deepEqual(result.polling,{enabled:false,mode:'on-demand',gameSessionSampling:false,intervalMs:null});assert.deepEqual(requests,[{operation:'read'}]);
  const failed=await createCpuTopology({runWorker:async()=>{throw Error('Access denied');}}).inspect();assert.equal(failed.supported,false);assert.equal(failed.x3d,'unknown');assert.equal(failed.queryDurationMs,null);
});
test('amostragem de sessão registra Parked por domínio, mantém estados desconhecidos e para sob demanda',async()=>{
  const requests=[],api=createCpuTopology({runWorker:async request=>{requests.push(request);return fixture({name:'AMD Ryzen 9 7950X3D 16-Core Processor',count:32,split:true,sizes:[96*1024**2,32*1024**2]});}});
  assert.throws(()=>api.startSessionSampling({intervalMs:999}),/inválido/);api.startSessionSampling({intervalMs:10000});
  for(let attempt=0;attempt<20&&api.sessionSampling().samples===0;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  const sample=api.sessionSampling();assert.equal(sample.enabled,true);assert.equal(sample.intervalMs,10000);assert.equal(sample.samples,1);assert.equal(sample.frequencyDomainParked,'partial');assert.deepEqual(sample.domains.map(domain=>domain.parked),['no','yes']);
  const view=await api.inspect();assert.equal(view.polling.gameSessionSampling,true);assert.equal(view.health.frequencyDomainParked,'partial');assert.equal(view.health.cs2RunningOnCacheDomain,'unknown');assert.equal(view.sessionSampling.samples,1);
  await api.stopSessionSampling();assert.equal(api.sessionSampling().enabled,false);assert.equal(api.sessionSampling().frequencyDomainParked,'partial');assert.equal(requests.length,2);
});
test('falha durante amostragem registra unknown e não fabrica domínio estacionado',async()=>{
  const api=createCpuTopology({runWorker:async()=>{throw Error('worker indisponível');}});api.startSessionSampling({intervalMs:10000});
  for(let attempt=0;attempt<20&&api.sessionSampling().samples===0;attempt++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(api.sessionSampling().samples,1);assert.equal(api.sessionSampling().frequencyDomainParked,'unknown');assert.match(api.sessionSampling().lastError,/não foi possível ler a topologia/i);await api.stopSessionSampling();
});
test('dados malformados ou duplicados são recusados sem criar falso zero',async()=>{
  for(const mutate of [raw=>raw.cpuSets.push({...raw.cpuSets[0]}),raw=>raw.cpuSets[0].parked=0,raw=>raw.caches[0].groups[0].mask='0',raw=>raw.caches[0].sizeBytes=0,raw=>raw.cpuSets[0].logicalProcessorIndex=64]){const raw=fixture();mutate(raw);assert.throws(()=>describeCpuTopology(raw));const result=await createCpuTopology({runWorker:async()=>raw}).inspect();assert.equal(result.x3d,'unknown');assert.deepEqual(result.domains,[]);}
});
test('worker de leitura não importa setters/controle nem scripts',async()=>{
  const source=await fs.readFile(path.join(root,'src/free/native/TopologyWorker.cs'),'utf8');assert.doesNotMatch(source,/extern\s+\w+\s+(?:SetProcess|SetThread|SetSystem|SetService|RegSet|CreateService|ControlService)/);assert.doesNotMatch(source,/(?:\.SetValue\(|Process\.Start\(|OpenSubKey\([^\n]*,true\))/);assert.match(source,/args\[0\]!="--read"/);assert.match(source,/GetSystemCpuSetInformation/);assert.match(source,/GetLogicalProcessorInformationEx/);assert.match(source,/Version\.Build>=22000/);
});
test('parsers C# reais: Size variável, tipos desconhecidos, limites e layout de cache', {skip:process.platform!=='win32'},async()=>{
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');await fs.access(compiler);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-topology-fixture-')),target=path.join(directory,'topology-fixture.exe');
  const compiled=await execute(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Core.dll','/main:TopologyParserFixtures','/out:'+target,path.join(root,'src/free/native/TopologyWorker.cs'),path.join(root,'tests/fixtures/TopologyParserFixtures.cs')],{windowsHide:true,timeout:30000});assert.equal(compiled.stderr,'');const {stdout}=await execute(target,[],{windowsHide:true,timeout:5000});assert.match(stdout,/Topology parser fixtures: 20 passed/);
});
