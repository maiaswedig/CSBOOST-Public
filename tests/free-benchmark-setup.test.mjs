import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createBenchmarkSetup,BENCHMARK_SETUP_CHECKS} from '../src/free/benchmark-setup.mjs';
import {createBenchmarks} from '../src/free/benchmarks.mjs';

const prepared={quietWorkload:true,sameScenario:true,foreground:true};
async function markHistoricalGuided(f){const file=path.join(f.directory,'benchmark-setup.json'),state=JSON.parse(await fs.readFile(file,'utf8'));state.guided=true;await fs.writeFile(file,JSON.stringify(state));return file;}
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-setup-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const directory=path.join(root,'own-setup'),historyDirectory=path.join(root,'history'),benchmarks=createBenchmarks(historyDirectory),launches=[],cancels=[];
  let current=null,active=false,running=false,bootId='boot-A',sequence=0,launchFailure=null;
  const installation={map:{installed:true},fpsLimit:{available:true,current:'400',pending:false}};
  const runner={inspect:async()=>structuredClone(installation),getState:async()=>structuredClone(current),isActive:()=>active,
    start:async request=>{launches.push(request);if(launchFailure)throw launchFailure;active=true;current={id:crypto.randomUUID(),status:'waiting-for-game',type:request.type,preset:request.preset};return structuredClone(current);},
    cancel:async()=>{cancels.push(current?.id);current={...current,status:running?'waiting-for-game-close':'cancelled'};active=running;return structuredClone(current);},
  };
  async function record({average=400,p1=160,runId=crypto.randomUUID(),interrupted=false,duration=120,context=true}={}){
    const file=path.join(root,'fixture-'+(++sequence)+'.log');await fs.writeFile(file,`// Development fixture ${sequence}\n[VProf] Summary of 48000 frames and ${duration} 1-second intervals\n[VProf] FPS: Avg=${average}, P1=${p1}\n`);
    return benchmarks.importFile(file,{...(context?{context:{version:1,runId,type:'baseline',collectorInterrupted:interrupted}}:{})});
  }
  const options={directory,benchmarks,runner,isGameRunning:async()=>running,getBootId:async()=>bootId,now:()=>new Date(1760000000000+sequence*1000).toISOString()};
  const setup=createBenchmarkSetup(options);
  return {root,directory,historyDirectory,setup,options,benchmarks,runner,installation,launches,cancels,record,
    setBoot:value=>{bootId=value;},setRunning:value=>{running=value;},setCurrent:(value,isActive=false)=>{current=value;active=isActive;},failLaunch:value=>{launchFailure=value;},
    async finish({waiting=false,...values}={}){const result=await record({...values,runId:current.id});current={...current,status:waiting?'waiting-for-game-close':'completed',savedResult:result,result};active=waiting;running=waiting;installation.fpsLimit.pending=waiting;return result;},
    close(){running=false;active=false;installation.fpsLimit.pending=false;if(current)current.status=current.status==='waiting-for-game-close'?'completed':current.status;},
  };
}

test('historical guided baseline is retained while advancing directly to adjustments in single-run mode',async t=>{
  const f=await fixture(t),row=await f.record();await f.setup.create({targetRuns:3});await f.setup.selectResults({group:'baseline',ids:[row.id]});await markHistoricalGuided(f);
  const state=await f.setup.getState();assert.equal(state.targetRuns,1);assert.equal(state.previousTargetRuns,3);assert.equal(state.stage,'adjustments');assert.deepEqual(state.baselineIds,[row.id]);assert.equal(state.baselineSummary.averageFps,row.averageFps);assert.equal((await f.benchmarks.list()).length,1);assert.deepEqual(f.launches,[]);
  await f.setup.markAdjustments({});await f.setup.confirmPreparation(prepared);const after=await f.record({average:450});await f.setup.selectResults({group:'optimized',ids:[after.id]});const final=await f.setup.compare();assert.equal(final.comparison.before.runs,1);assert.equal(final.comparison.after.runs,1);assert.equal(final.status,'completed');
});
test('single-run compatibility migration waits for game and cap restoration; never truncates a multi-result study',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:3});await markHistoricalGuided(f);f.setRunning(true);assert.equal((await f.setup.getState()).targetRuns,3);f.setRunning(false);f.installation.fpsLimit.pending=true;assert.equal((await f.setup.getState()).targetRuns,3);f.installation.fpsLimit.pending=false;assert.equal((await f.setup.getState()).targetRuns,1);
  const multi=await fixture(t),rows=[await multi.record(),await multi.record({average:410})];await multi.setup.create({targetRuns:3});await multi.setup.selectResults({group:'baseline',ids:rows.map(row=>row.id)});await markHistoricalGuided(multi);assert.equal((await multi.setup.getState()).targetRuns,3);assert.deepEqual((await multi.setup.getState()).baselineIds,rows.map(row=>row.id));
  await assert.rejects(createBenchmarkSetup({...multi.options,directory:path.join(multi.root,'invalid-new')}).create({guided:true,targetRuns:3}),{code:'BENCHMARK_SETUP_INVALID'});
});
test('retired one-click study continues through the standard manual workflow without losing measurements',async t=>{
  const f=await fixture(t),before=await f.record();
  await f.setup.create({targetRuns:1,optimizedMode:'current',oneClick:{profile:'full',selectedIds:['windows-fso']}});
  await f.setup.selectResults({group:'baseline',ids:[before.id]});
  const reopened=createBenchmarkSetup(f.options);
  await reopened.markAdjustments({note:'Compatibilidade selecionada em Desempenho',rebootRequired:false});
  const state=await reopened.getState();assert.equal(state.adjustments.source,'user-reported; no settings were applied by this assistant');assert.equal(state.adjustments.boostReceipt,undefined);assert.deepEqual(state.baselineIds,[before.id]);
  const after=await f.record({average:420});await reopened.selectResults({group:'optimized',ids:[after.id]});
  const result=await reopened.compare();assert.equal(result.status,'completed');assert.equal(result.comparison.before.runs,1);assert.equal(result.comparison.after.runs,1);assert.deepEqual(f.launches,[]);
});
test('persistent setup starts with actual checks, no fabricated measurements or automatic launch',async t=>{
  const f=await fixture(t);assert.equal(await f.setup.getState(),null);
  const state=await f.setup.create();assert.equal(state.targetRuns,1);assert.equal(state.stage,'preparation');assert.deepEqual(state.baselineIds,[]);assert.equal(state.comparison,null);assert.equal(state.canStartBaseline,false);assert.equal(state.checklist.filter(row=>!row.automatic).length,BENCHMARK_SETUP_CHECKS.length);
  const reopened=createBenchmarkSetup(f.options);assert.equal((await reopened.getState()).id,state.id);assert.equal(f.launches.length,0);
  await assert.rejects(f.setup.create(),{code:'BENCHMARK_SETUP_EXISTS'});
});

test('manual preparation and automatic game/map/cap/recovery checks gate each explicit launch',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});
  await assert.rejects(f.setup.startRun({group:'baseline'}),{code:'BENCHMARK_SETUP_NOT_READY'});
  await assert.rejects(f.setup.confirmPreparation({...prepared,arbitrary:'command'}),{code:'BENCHMARK_SETUP_INVALID'});
  await f.setup.confirmPreparation(prepared);assert.equal((await f.setup.getState()).canStartBaseline,true);
  for(const kind of ['map','cap','game','recovery']){
    f.installation.map.installed=kind!=='map';f.installation.fpsLimit.available=kind!=='cap';f.setRunning(kind==='game');f.setCurrent(kind==='recovery'?{id:crypto.randomUUID(),status:'measuring'}:null,kind==='recovery');
    await assert.rejects(f.setup.startRun({group:'baseline'}),{code:'BENCHMARK_SETUP_NOT_READY'});
  }
  assert.equal(f.launches.length,0);
});

test('owned result is associated once, but next step waits for FPS-cap cleanup and natural game close',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);
  const started=await f.setup.startRun({group:'baseline',processPolicy:{prioritizeGame:true,backgroundApps:['chrome']}});assert.equal(started.pendingRun.id,started.activeRun.id);assert.deepEqual(f.launches[0].processPolicy,{prioritizeGame:false,backgroundApps:[]});
  const real=await f.finish({waiting:true});for(let i=0;i<3;i++){const state=await f.setup.getState();assert.deepEqual(state.baselineIds,[real.id]);assert.equal(state.stage,'baseline');assert.equal(state.canStartOptimized,false);}
  await assert.rejects(f.setup.markAdjustments({note:'Ajuste manual'}),{code:'BENCHMARK_SETUP_BUSY'});
  f.close();const ready=await f.setup.getState();assert.equal(ready.stage,'adjustments');assert.equal(ready.pendingRun,null);assert.equal(ready.lastRun.status,'completed');assert.equal(f.launches.length,1);
});

test('explicit existing baseline survives restart and deferred firmware adjustment verifies actual boot change',async t=>{
  const f=await fixture(t),before=await f.record();await f.setup.create({targetRuns:1,preset:'performance'});await f.setup.selectResults({group:'baseline',ids:[before.id]});
  const waiting=await f.setup.markAdjustments({note:'PBO/CO informado manualmente',rebootRequired:true});assert.equal(waiting.stage,'awaiting-reboot');assert.equal(waiting.adjustments.source,'user-reported; no settings were applied by this assistant');
  const reopened=createBenchmarkSetup(f.options);assert.equal((await reopened.getState()).stage,'awaiting-reboot');assert.equal(f.launches.length,0);
  await assert.rejects(reopened.resume(),{code:'BENCHMARK_SETUP_REBOOT_NOT_OBSERVED'});await assert.rejects(reopened.resume({confirmManualRestart:true}),{code:'BENCHMARK_SETUP_REBOOT_NOT_OBSERVED'});
  f.setBoot('boot-B');const resumed=await reopened.resume();assert.equal(resumed.stage,'optimized');assert.equal(resumed.adjustments.rebootVerification,'boot-change-observed');assert.equal(resumed.canStartOptimized,false);assert.equal(f.launches.length,0);
  await reopened.confirmPreparation(prepared);await reopened.startRun({group:'optimized',processPolicy:{prioritizeGame:true,backgroundApps:['chrome']}});assert.equal(f.launches[0].type,'boosted');assert.equal(f.launches[0].preset,'performance');assert.equal(f.launches[0].tuningNote,'PBO/CO informado manualmente');
});

test('unavailable boot telemetry requires explicit user report and produces visible warning',async t=>{
  const f=await fixture(t);f.setBoot(null);const before=await f.record();await f.setup.create({targetRuns:1});await f.setup.selectResults({group:'baseline',ids:[before.id]});await f.setup.markAdjustments({rebootRequired:true});
  await assert.rejects(f.setup.resume(),{code:'BENCHMARK_SETUP_REBOOT_UNKNOWN'});const state=await f.setup.resume({confirmManualRestart:true});assert.equal(state.adjustments.rebootVerification,'user-reported');assert.ok(state.warnings.some(text=>/Reinicialização informada/.test(text)));assert.equal(f.launches.length,0);
});

test('current-config mode measures user adjustments without silently adding app boosting',async t=>{
  const f=await fixture(t),before=await f.record();await f.setup.create({targetRuns:1,optimizedMode:'current'});await f.setup.selectResults({group:'baseline',ids:[before.id]});await f.setup.markAdjustments({note:'Somente ajuste do usuário'});await f.setup.confirmPreparation(prepared);await f.setup.startRun({group:'optimized',processPolicy:{prioritizeGame:true,backgroundApps:['chrome'],cpuDistribution:true}});
  assert.equal(f.launches[0].type,'baseline');assert.deepEqual(f.launches[0].processPolicy,{prioritizeGame:false,backgroundApps:[]});
});

test('recovery associates only exact owned runner UUID from real history without launching again',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);await f.setup.startRun({group:'baseline'});const result=await f.finish();f.setCurrent(null);
  const reopened=createBenchmarkSetup(f.options);const recovered=await reopened.getState();assert.deepEqual(recovered.baselineIds,[result.id]);assert.equal(recovered.lastRun.status,'recovered-from-history');assert.equal(recovered.stage,'adjustments');assert.equal(f.launches.length,1);
});

test('interrupted collector is rejected by default and can only be selected with explicit visible qualification',async t=>{
  const f=await fixture(t),interrupted=await f.record({interrupted:true});await f.setup.create({targetRuns:1});
  await assert.rejects(f.setup.selectResults({group:'baseline',ids:[interrupted.id]}),{code:'BENCHMARK_SETUP_INTERRUPTED_RESULT'});assert.deepEqual((await f.setup.getState()).baselineIds,[]);
  const selected=await f.setup.selectResults({group:'baseline',ids:[interrupted.id],allowInterrupted:true});assert.deepEqual(selected.allowInterruptedIds,[interrupted.id]);assert.ok(selected.warnings.some(text=>/foco contínuo/.test(text)));
});

test('owned interrupted result does not advance silently after collector recovery',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);await f.setup.startRun({group:'baseline'});await f.finish({interrupted:true});f.setCurrent(null);
  const state=await createBenchmarkSetup(f.options).getState();assert.deepEqual(state.baselineIds,[]);assert.equal(state.lastError.code,'BENCHMARK_SETUP_INTERRUPTED_RESULT');assert.equal(state.canStartBaseline,true);assert.equal(f.launches.length,1);
});

test('unidentified dispatch interruption cannot adopt unrelated measurements or relaunch a game',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);await f.setup.startRun({group:'baseline'});
  const file=path.join(f.directory,'benchmark-setup.json'),state=JSON.parse(await fs.readFile(file));state.pendingRun.id=null;await fs.writeFile(file,JSON.stringify(state));
  const unrelated=await f.record();f.setCurrent({id:crypto.randomUUID(),status:'completed',savedResult:unrelated});
  const recovered=await createBenchmarkSetup(f.options).getState();assert.deepEqual(recovered.baselineIds,[]);assert.equal(recovered.lastError.code,'BENCHMARK_SETUP_RUN_INTERRUPTED');assert.equal(f.launches.length,1);
});

test('repeated or duplicate source cannot count twice, cross groups or partially corrupt selection',async t=>{
  const f=await fixture(t),first=await f.record();await f.setup.create({targetRuns:1});await f.setup.selectResults({group:'baseline',ids:[first.id]});await f.setup.markAdjustments({});
  await assert.rejects(f.setup.selectResults({group:'optimized',ids:[first.id]}),{code:'BENCHMARK_SETUP_DUPLICATE_SOURCE'});assert.deepEqual((await f.setup.getState()).optimizedIds,[]);
  const duplicate=await f.record();const file=path.join(f.historyDirectory,duplicate.id+'.json'),data=JSON.parse(await fs.readFile(file));data.sourceSHA256=first.sourceSHA256.toUpperCase();await fs.writeFile(file,JSON.stringify(data));
  await assert.rejects(f.setup.selectResults({group:'optimized',ids:[duplicate.id]}),{code:'BENCHMARK_SETUP_DUPLICATE_SOURCE'});
});

test('partial VProf history, changed selected history and locked baseline cannot become claimed comparison',async t=>{
  const f=await fixture(t),short=await f.record({duration:30}),before=await f.record();await f.setup.create({targetRuns:1});await assert.rejects(f.setup.selectResults({group:'baseline',ids:[short.id]}),{code:'BENCHMARK_SETUP_RESULT_INVALID'});
  await f.setup.selectResults({group:'baseline',ids:[before.id]});await f.setup.markAdjustments({});await assert.rejects(f.setup.selectResults({group:'baseline',ids:[]}),{code:'BENCHMARK_SETUP_BASELINE_LOCKED'});
  const file=path.join(f.historyDirectory,before.id+'.json'),data=JSON.parse(await fs.readFile(file));data.averageFps+=20;await fs.writeFile(file,JSON.stringify(data));
  const state=await f.setup.getState();assert.match(state.selectionProblem,/alterado no histórico/);assert.equal(state.canStartOptimized,false);await assert.rejects(f.setup.compare(),{code:'BENCHMARK_SETUP_SOURCE_CHANGED'});
});

test('three real fixture records per group produce median comparison, retain decreases and persist result',async t=>{
  const f=await fixture(t);const before=await Promise.all([f.record({average:400,p1:180}),f.record({average:410,p1:185}),f.record({average:390,p1:175})]);const after=await Promise.all([f.record({average:440,p1:150}),f.record({average:450,p1:155}),f.record({average:430,p1:145})]);
  await f.setup.create({targetRuns:3});await f.setup.selectResults({group:'baseline',ids:before.map(row=>row.id)});await f.setup.markAdjustments({note:'Desempenho medido em fixtures, não no PC'});await f.setup.selectResults({group:'optimized',ids:after.map(row=>row.id)});
  const compared=await f.setup.compare();assert.equal(compared.status,'completed');assert.equal(compared.comparison.before.averageFps,400);assert.equal(compared.comparison.after.averageFps,440);assert.ok(Math.abs(compared.comparison.averageFps.percent-10)<1e-8);assert.ok(compared.comparison.onePercentLow.percent<0);assert.ok(compared.comparison.warnings.some(text=>/P1 diminuiu/.test(text)));
  const reopened=await createBenchmarkSetup(f.options).getState();assert.deepEqual(reopened.comparison,compared.comparison);assert.equal(f.launches.length,0);
});

test('failed launch is persisted without automatic retries and explicit repeated clicks launch at most once',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);f.failLaunch(new Error('fixture Steam unavailable'));await assert.rejects(f.setup.startRun({group:'baseline'}),/Steam unavailable/);assert.equal((await f.setup.getState()).lastError.message,'fixture Steam unavailable');assert.equal((await f.setup.getState()).pendingRun,null);
  f.failLaunch(null);const results=await Promise.allSettled([f.setup.startRun({group:'baseline'}),f.setup.startRun({group:'baseline'})]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(f.launches.length,2);
});

test('cancellation preserves owned pending cap restoration and cannot cancel an unrelated runner',async t=>{
  const f=await fixture(t);await f.setup.create({targetRuns:1});await f.setup.confirmPreparation(prepared);await f.setup.startRun({group:'baseline'});await f.finish({waiting:true});let cancelled=await f.setup.cancel();assert.equal(cancelled.status,'active');assert.equal(cancelled.cancelRequested,true);assert.ok(cancelled.pendingRun);assert.equal(f.cancels.length,1);
  f.close();cancelled=await f.setup.getState();assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.baselineIds.length,1);
  await f.setup.create({targetRuns:1});f.setCurrent({id:crypto.randomUUID(),status:'measuring'},true);await f.setup.cancel();assert.equal(f.cancels.length,1);
});

test('malformed journal and invalid options do not launch, restart, alter or remove benchmark history',async t=>{
  const f=await fixture(t);for(const options of [{targetRuns:0},{targetRuns:11},{preset:'arbitrary'},{optimizedMode:'shell'}])await assert.rejects(f.setup.create(options),{code:'BENCHMARK_SETUP_INVALID'});
  await f.setup.create({targetRuns:1});await assert.rejects(f.setup.markAdjustments({note:'x\ncommand'}),{code:'BENCHMARK_SETUP_INVALID'});const file=path.join(f.directory,'benchmark-setup.json');await fs.writeFile(file,'{"version":1}');await assert.rejects(createBenchmarkSetup(f.options).getState(),{code:'BENCHMARK_SETUP_JOURNAL_INVALID'});assert.equal(f.launches.length,0);assert.equal(f.cancels.length,0);
});

test('unsupported wizard preset is neither persisted nor dispatched and cannot enter through recovery',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'benchmark-setup.json');
  await assert.rejects(f.setup.create({preset:'unknown'}),{code:'BENCHMARK_SETUP_INVALID'});await assert.rejects(fs.stat(file),{code:'ENOENT'});assert.equal(f.launches.length,0);
  await f.setup.create({preset:'balanced'});const journal=JSON.parse(await fs.readFile(file));journal.preset='unknown';await fs.writeFile(file,JSON.stringify(journal));
  await assert.rejects(f.setup.getState(),{code:'BENCHMARK_SETUP_JOURNAL_INVALID'});await assert.rejects(f.setup.startRun({group:'baseline'}),{code:'BENCHMARK_SETUP_JOURNAL_INVALID'});assert.equal(f.launches.length,0);
});
