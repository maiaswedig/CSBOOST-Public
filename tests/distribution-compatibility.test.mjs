import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedPlatform,createCompatibility} from '../src/free/compatibility.mjs';
import {createOptimizationEngine} from '../src/free/engine.mjs';
import {planCpuDistribution} from '../src/free/cpu-affinity.mjs';
import {createController} from '../src/free/controller.mjs';

for(const cpu of ['AMD Ryzen 5 5600X','Intel Core i7-13700K'])for(const gpu of ['NVIDIA GeForce RTX 3060','AMD Radeon RX 7600','Intel Arc A770','Intel UHD, NVIDIA GeForce RTX 4050'])test(`runtime capability matrix: ${cpu} / ${gpu}`,async()=>{
  const system={getSystemInfo:async()=>({platform:'win32',cpu,gpu,logicalCores:16,ramGB:16}),refreshSteam:async()=>({installed:true,cs2Installed:true,steamPath:'C:\\PRIVATE\\Steam',gamePath:'D:\\PRIVATE\\CS2'})};
  const engine=createOptimizationEngine({system,optimizations:{inspect:async()=>({changes:[{}]})},windowsTuning:{inspect:async()=>({items:[]})},processTuning:{inspect:async()=>({available:[]})},cpuAffinity:{inspect:async()=>({supported:true,reason:'Fixture topology'})},nvidia:{inspect:async()=>({supported:/NVIDIA/.test(gpu)})},amdTuning:{inspect:async()=>({canApply:false,hardware:{pboCandidate:cpu.startsWith('AMD')},reason:'Assisted only'})},memoryTuning:{snapshot:async()=>({available:true})}});
  const report=await createCompatibility({system,engine,version:'test',environment:{platform:'win32',arch:'x64',release:'10.0.22631'},checkData:async()=>true,watcher:{status:()=>({running:true})},recoveryGuard:{getState:()=>({available:true})}}).inspect('76561198000000001');
  assert.equal(report.ready,true);assert.equal(report.hardware.cpuVendor,cpu.startsWith('AMD')?'AMD':'Intel');
  assert.equal(report.features.find(row=>row.name==='Perfis de driver NVIDIA').mode,/NVIDIA/.test(gpu)?'available':'unavailable');
  assert.equal(report.features.find(row=>row.name==='PBO/Curve Optimizer AMD').mode,'unavailable');
  assert.equal(report.features.find(row=>row.name==='Memória XMP/EXPO').mode,'assisted');
  assert.equal(report.physicalCrossVendorValidation,false);
  assert.doesNotMatch(JSON.stringify(report),/76561198000000001|PRIVATE|steamPath|gamePath/);
});
test('unsupported OS/architecture, missing Steam and permission failures are not marked ready',async()=>{
  for(const env of [{platform:'win32',arch:'ia32',release:'10.0'}, {platform:'win32',arch:'arm64',release:'10.0'}, {platform:'win32',arch:'x64',release:'6.1'}, {platform:'linux',arch:'x64',release:'6.1'}])assert.equal(supportedPlatform(env),false);
  const report=await createCompatibility({system:{getSystemInfo:async()=>{throw Error('C:\\PRIVATE\\secret');},refreshSteam:async()=>({installed:false,cs2Installed:false})},engine:{inspect:async()=>{throw Error('token-secret');}},environment:{platform:'win32',arch:'x64',release:'10.0',secret:'private'},checkData:async()=>false,version:'test'}).inspect('76561198000000001');
  assert.equal(report.ready,false);assert.equal(report.checks.find(c=>c.id==='data').ok,false);assert.equal(report.checks.find(c=>c.id==='watcher').ok,null);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE|token-secret|76561198000000001|private/);
});
test('Intel hybrid topology preserves whole cores and does not force P-core-only affinity',()=>{
  const topology={supported:true,groups:1,systemMask:'ff',cores:[{group:0,mask:'3',efficiencyClass:1},{group:0,mask:'c',efficiencyClass:1},{group:0,mask:'10',efficiencyClass:0},{group:0,mask:'20',efficiencyClass:0},{group:0,mask:'40',efficiencyClass:0},{group:0,mask:'80',efficiencyClass:0}]};
  const plan=planCpuDistribution(topology);assert.equal(plan.supported,true);assert.equal(plan.backgroundMask,'80');assert.equal(plan.gameMask,'7f');assert.equal(planCpuDistribution({...topology,groups:2}).supported,false);
});
test('compatibility diagnostics remain serialized and blocked during an active benchmark',async()=>{
  let calls=0;const controller=createController({auth:{getSession:async()=>({steamId:'76561198000000001'})},benchmarkRunner:{isActive:()=>true},compatibility:{inspect:async()=>calls++}});
  await assert.rejects(()=>controller.getCompatibility(),/benchmark/);await assert.rejects(()=>controller.exportCompatibility(),/benchmark/);assert.equal(calls,0);
});
