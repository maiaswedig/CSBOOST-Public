import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createFpsFlow} from '../src/free/fps-flow.mjs';
import {createBoostPlan} from '../src/free/boost-plan.mjs';
import {createBenchmarks} from '../src/free/benchmarks.mjs';
import {createBenchmarkSetup} from '../src/free/benchmark-setup.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-fps-flow-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const env={id:'76561198000000001',running:false,session:null,video:'before',windows:0,backups:{},writes:[],videoPresets:[],boot:'boot-a',launches:0};
  const optimizations={inspect:async(_id,options)=>({sourceSHA256:env.video,changes:env.video==='before'?[{label:'MSAA',before:'4',after:options.preset==='competitive'?'2':'0'}]:[],active:env.backups.video}),apply:async(_id,options)=>{env.writes.push('video');env.videoPresets.push(options.preset);env.video='after';env.backups.video={ownerToken:options.ownerToken};return {changed:true};},restore:async()=>{env.writes.push('restore-video');env.video='before';delete env.backups.video;}};
  const windowsTuning={inspect:async()=>({sourceSHA256:String(env.windows),active:env.backups.windows,items:[{id:'gameMode',needed:env.windows===0,before:{exists:false},after:{exists:true},description:'Game Mode fixture'}]}),apply:async options=>{env.writes.push('windows');env.windows=1;env.backups.windows={ownerToken:options.ownerToken};return {changed:true};},restore:async()=>{env.writes.push('restore-windows');env.windows=0;delete env.backups.windows;}};
  const system={isGameRunning:async()=>env.running,getSystemInfo:async()=>({platform:'win32'}),getPowerPlans:async()=>({activeGuid:'381b4222-f694-41f0-9685-ff5bb260df2e',restoreGuid:null,plans:[]})};
  const boostPlan=createBoostPlan({directory:path.join(root,'boost'),system,optimizations,windowsTuning,nvidia:{inspect:async()=>({supported:false})},getSteamId:async()=>env.id,getPowerContext:async()=>({onBattery:false})});
  const benchmarks=createBenchmarks(path.join(root,'history'));let current=null;
  const runner={inspect:async()=>({map:{installed:true},fpsLimit:{available:true,pending:false}}),getState:async()=>current,isActive:()=>!!current,start:async request=>{env.launches++;current={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'waiting-for-game',...request};return current;}};
  const setupOptions={directory:path.join(root,'study'),benchmarks,runner,isGameRunning:system.isGameRunning,getBoostState:boostPlan.inspect,getBootId:async()=>env.boot};
  const benchmarkSetup=createBenchmarkSetup(setupOptions),deps={benchmarkSetup,boostPlan,getSteamId:async()=>env.id,isGameRunning:system.isGameRunning,sessions:{getState:async()=>env.session}};
  const flow=createFpsFlow(deps);
  async function baseline(preset='performance'){
    await flow.create({preset});const ids=[];
    for(let i=0;i<1;i++){const file=path.join(root,`before-${i}.log`);await fs.writeFile(file,`// independent development fixture ${i}\n[VProf] Summary of 24000 frames and 120 1-second intervals\n[VProf] FPS: Avg=${200+i}, P1=100\n`);ids.push((await benchmarks.importFile(file)).id);}
    await benchmarkSetup.selectResults({group:'baseline',ids});return (await flow.getState()).study.id;
  }
  return {env,root,flow,deps,boostPlan,benchmarkSetup,setupOptions,baseline};
}
test('guided flow creates exactly one run per group, never launches or applies during setup, and rejects legacy conflicts',async t=>{
  const f=await fixture(t);const created=await f.flow.create({preset:'competitive'});assert.equal(created.study.targetRuns,1);assert.equal(created.study.guided,true);assert.equal(created.study.preset,'competitive');assert.deepEqual(f.env.writes,[]);assert.equal(f.env.launches,0);await assert.rejects(f.flow.create(),/assistente/);await assert.rejects(f.flow.preview({studyId:created.study.id}),/medição Antes/);
});
test('balanced preserves video even when offered explicitly; competitive uses its own graphics preset',async t=>{
  for(const preset of ['balanced','competitive']){
    const f=await fixture(t),studyId=await f.baseline(preset);const plan=await f.flow.preview({studyId});
    if(preset==='balanced'){assert.equal(plan.selectedIds.includes('video'),false);assert.equal(plan.items.find(row=>row.id==='video').selectable,false);const offered=await f.flow.preview({studyId,selection:['video','windows-gameMode']});assert.deepEqual(offered.selectedIds,['windows-gameMode']);}
    await f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:false});assert.deepEqual(f.env.videoPresets,preset==='competitive'?['competitive']:[]);
  }
});
test('applied Boost receipt is durable, account-owned, and blocks After when restored',async t=>{
  const f=await fixture(t),studyId=await f.baseline(),plan=await f.flow.preview({studyId,selection:['windows-gameMode']});
  const result=await f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:false});assert.equal(result.study.adjustments.source,'csboost-owned-boost');assert.equal(result.study.adjustments.boostReceipt.ownerToken,result.boost.ownerToken);assert.equal(result.study.adjustments.confirmed,true);
  const reopened=createBenchmarkSetup(f.setupOptions);assert.equal((await reopened.getState()).adjustments.boostReceipt.ownerToken,result.boost.ownerToken);
  await reopened.confirmPreparation({quietWorkload:true,sameScenario:true,foreground:true});assert.equal((await reopened.getState()).canStartOptimized,true);
  await f.boostPlan.restore();assert.equal((await reopened.getState()).canStartOptimized,false);await assert.rejects(reopened.startRun({group:'optimized'}));assert.equal(f.env.launches,0);
});
test('metadata failure after native application recovers by recording without applying twice',async t=>{
  const f=await fixture(t),studyId=await f.baseline();const interrupted=createFpsFlow({...f.deps,benchmarkSetup:{...f.benchmarkSetup,recordBoost:async()=>{throw Error('fixture disk failure');}}});
  const plan=await interrupted.preview({studyId,selection:['windows-gameMode']});await assert.rejects(interrupted.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:false}),/disk failure/);
  assert.equal((await f.boostPlan.inspect()).status,'active');assert.equal((await f.flow.getState()).study.adjustments.confirmed,false);
  await f.flow.record({studyId,rebootRequired:false});await f.flow.record({studyId,rebootRequired:false});assert.deepEqual(f.env.writes,['windows']);assert.equal((await f.flow.getState()).study.adjustments.confirmed,true);
});
test('stale preview, study, active game, invalid preset and foreign active Boost cannot apply or attach',async t=>{
  const f=await fixture(t),studyId=await f.baseline(),plan=await f.flow.preview({studyId,selection:['windows-gameMode']});
  await assert.rejects(f.flow.preview({studyId:'stale'}),/mudou/);f.env.video='external';await assert.rejects(f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:false}),/mudou/);assert.deepEqual(f.env.writes,[]);
  f.env.video='before';await f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:false});f.env.id='76561198000000002';await assert.rejects(f.flow.record({studyId}),/desta conta/);
  f.env.running=true;await assert.rejects(f.flow.record({studyId}),/Feche/);await assert.rejects(f.flow.create({preset:'unknown'}),/inválido/);assert.deepEqual(f.env.writes,['windows']);
});
test('optional reboot persists and requires a different boot before resuming',async t=>{
  const f=await fixture(t),studyId=await f.baseline(),plan=await f.flow.preview({studyId,selection:['windows-gameMode']});await f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired:true});
  assert.equal((await createFpsFlow(f.deps).getState()).study.adjustments.rebootPending,true);await assert.rejects(f.benchmarkSetup.resume(),/mesma inicialização/);f.env.boot='boot-b';await f.benchmarkSetup.resume();assert.equal((await f.flow.getState()).study.adjustments.rebootPending,false);assert.equal(f.env.launches,0);
});
test('automatic return is rejected before any native write unless reboot and a supported opt-in are present',async t=>{
  const f=await fixture(t),studyId=await f.baseline(),plan=await f.flow.preview({studyId});for(const rebootRequired of [false,true])await assert.rejects(f.flow.apply({studyId,selectedIds:plan.selectedIds,previewFingerprint:plan.previewFingerprint,rebootRequired,autoResume:true}),/abertura automática/);assert.deepEqual(f.env.writes,[]);
});
