import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {BENCHMARK_MAP,createBenchmarkProtocol,createBenchmarkRunner,inspectBenchmarkInstallation} from '../src/free/benchmark-runner.mjs';
import {createBenchmarks} from '../src/free/benchmarks.mjs';
import {createBenchmarkFpsCap,parseBenchmarkFpsCap} from '../src/free/benchmark-fps-cap.mjs';

// Development fixtures; these numbers do not represent a user benchmark.
const header=[
  `10/14 10:00:00 Loading map "de_dust2" (addon '${BENCHMARK_MAP.workshopId}')`,
  '10/14 10:00:01 execing maps/fpsheavenbenchmark.cfg',
  '10/14 10:00:02 Created physics for benchmark_mainmap',
  '10/14 10:00:03 ChangeGameUIState: CSGO_GAME_UI_STATE_LOADINGSCREEN -> CSGO_GAME_UI_STATE_INGAME',
  '10/14 10:00:04 [VProf] VProfLite started.',
].join('\n')+'\n';
const report='10/14 10:02:05 [VProf] Summary of 50000 frames and 120 1-second intervals\n10/14 10:02:05 [VProf] FPS: Avg=416.7, P1=180.5\n';
const full=header+report;

test('boosted process preparation arriving after VProf is invalidated without late native writes',async t=>{
  let actions=0;
  const f=await fixture(t,{onGameStart:async()=>{actions++;}});
  await f.runner.start({type:'boosted',processPolicy:{prioritizeGame:true}});
  f.setRunning(true);await f.append(header);
  const state=await f.runner.poll();
  assert.equal(state.status,'failed');assert.equal(state.error.code,'BENCHMARK_LATE_PREPARATION');
  assert.equal(actions,0);assert.equal(f.saved.length,0);assert.equal(f.cleanups.length,1);
});

test('prepared measurement polls reuse installation and never repeat process preparation',async t=>{
  let installations=0,actions=0;
  const f=await fixture(t);
  const runner=createBenchmarkRunner({...f.options,resolveInstallation:async()=>{installations++;return f.installation;},onGameStart:async()=>{actions++;}});t.after(()=>runner.dispose());
  await runner.start({type:'boosted',processPolicy:{cpuDistribution:true}});
  f.setRunning(true);await runner.poll();assert.equal(actions,1);
  await f.append(header);for(let i=0;i<30;i++){f.advance(1000);await runner.poll();await runner.inspect();}
  assert.equal(actions,1);assert.equal(installations,1);assert.equal(f.saved.length,0);
  await f.append(report);assert.equal((await runner.poll()).status,'completed');
  assert.equal(actions,1);assert.equal(installations,1);
});

test('study inspection reuses closed-game inventory during a game session and refresh requires a closed game',async t=>{
  let resolutions=0;const f=await fixture(t);const runner=createBenchmarkRunner({...f.options,resolveInstallation:async()=>{resolutions++;return f.installation;}});t.after(()=>runner.dispose());
  await runner.inspect();assert.equal(resolutions,1);f.setRunning(true);
  for(let i=0;i<30;i++)await runner.inspect();assert.equal(resolutions,1);
  await assert.rejects(runner.inspect({refresh:true}),/Feche o CS2/);assert.equal(resolutions,1);
  f.setRunning(false);await runner.inspect({refresh:true});assert.equal(resolutions,2);
});

test('a VProf start before map readiness or without final newline still prevents late writes',async t=>{
  for(const marker of ['[VProf] VProfLite started.\n','[VProf] VProfLite started.']){
    let actions=0;const f=await fixture(t,{onGameStart:async()=>{actions++;}});
    await f.runner.start({type:'boosted',processPolicy:{backgroundApps:['chrome']}});
    f.setRunning(true);await f.append(marker);
    assert.equal((await f.runner.poll()).error.code,'BENCHMARK_LATE_PREPARATION');assert.equal(actions,0);
  }
});

async function fixture(t,overrides={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-benchmark-fixture-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const gamePath=path.join(root,'steam','steamapps','common','Counter-Strike Global Offensive');
  const cfgPath=path.join(gamePath,'game','csgo','cfg'),logPath=path.join(gamePath,'game','csgo','console.log');
  const mapPath=path.join(root,'steam','steamapps','workshop','content','730',BENCHMARK_MAP.workshopId);
  const directory=path.join(root,'own-data'),launches=[],cleanups=[],saved=[],prepared=[];
  await fs.mkdir(cfgPath,{recursive:true});await fs.mkdir(mapPath,{recursive:true});await fs.writeFile(path.join(mapPath,'de_dust2.vpk'),'development-fixture');
  await fs.writeFile(path.join(cfgPath,'autoexec.cfg'),'user-owned config\n');
  const installation={cs2Installed:true,gamePath,cfgPath,steamPath:path.join(root,'steam')};
  let clock=100000,running=false,focus=true,prepareResult={test:true};
  const options={directory,resolveInstallation:async()=>installation,isGameRunning:async()=>running,launch:async value=>{launches.push(value);},
    prepare:async value=>{prepared.push(value);return prepareResult;},cleanup:async value=>{cleanups.push(value);},saveResult:async value=>{saved.push(value);return {id:'saved-fixture'};},
    now:()=>clock,isGameFocused:async()=>focus,setIntervalImpl:()=>({unref(){}}),clearIntervalImpl:()=>{},...overrides};
  const runner=createBenchmarkRunner(options);t.after(()=>runner.dispose());
  return {root,runner,options,installation,gamePath,cfgPath,logPath,mapPath,directory,launches,cleanups,saved,prepared,setRunning:value=>{running=value;},setFocus:value=>{focus=value;},advance:delta=>{clock+=delta;},setPrepareResult:value=>{prepareResult=value;},
    async append(text){await fs.appendFile(logPath,text);},async overwrite(text){await fs.writeFile(logPath,text);}};
}

test('map detector requires actual local VPK presence and leaves all files unchanged',async t=>{
  const f=await fixture(t);const installed=await inspectBenchmarkInstallation(f.installation);
  assert.equal(installed.map.installed,true);assert.equal(installed.map.verification,'local-vpk-presence');
  await fs.unlink(path.join(f.mapPath,'de_dust2.vpk'));
  assert.equal((await f.runner.inspect()).map.installed,false);
  assert.equal(await fs.readFile(path.join(f.cfgPath,'autoexec.cfg'),'utf8'),'user-owned config\n');
});

test('missing map or running game rejects before writing config and launching Steam',async t=>{
  const f=await fixture(t);f.setRunning(true);
  await assert.rejects(f.runner.start({type:'baseline'}),/Feche o CS2/);
  f.setRunning(false);await fs.unlink(path.join(f.mapPath,'de_dust2.vpk'));
  await assert.rejects(f.runner.start({type:'baseline'}),/aguarde o download/);
  assert.equal(f.launches.length,0);await assert.rejects(fs.stat(path.join(f.cfgPath,BENCHMARK_MAP.configName)),{code:'ENOENT'});
});

test('watchdog recovery cancels the interrupted benchmark and restores owned cfg while the game stays running',async t=>{
  const f=await fixture(t);const previous='// previous own benchmark cfg\n';await fs.writeFile(path.join(f.cfgPath,BENCHMARK_MAP.configName),previous);
  await f.runner.start({type:'baseline'});f.setRunning(true);f.runner.dispose();
  const recovered=createBenchmarkRunner(f.options);t.after(()=>recovered.dispose());
  const state=await recovered.recover({restoreImmediately:true});assert.equal(state.status,'cancelled');assert.equal(f.cleanups.length,1);assert.equal(f.saved.length,0);assert.equal(f.launches.length,1);
  assert.equal(await fs.readFile(path.join(f.cfgPath,BENCHMARK_MAP.configName),'utf8'),previous);
  await assert.rejects(fs.stat(path.join(f.directory,'active-benchmark.json')),{code:'ENOENT'});
});

test('protocol requires map, workshop identity, map benchmark marker, VProf start and real report',()=>{
  const p=createBenchmarkProtocol();for(const line of full.trim().split('\n'))p.consume(line);
  const result=p.snapshot();assert.equal(result.status,'valid');assert.equal(result.result.averageFps,416.7);assert.equal(result.result.onePercentLow,180.5);
  assert.equal(result.result.durationSeconds,120);assert.equal(result.result.frames,50000);
  const bare=createBenchmarkProtocol();bare.consume(report.trim().split('\n').at(-1));assert.equal(bare.snapshot().reason,'BENCHMARK_UNVERIFIED_REPORT');
});

test('wrong workshop, wrong map, incomplete report, and invalid FPS are rejected',()=>{
  for(const [text,reason]of [
    [full.replaceAll(BENCHMARK_MAP.workshopId,'1234567890'),'BENCHMARK_UNVERIFIED_REPORT'],
    [full.replaceAll('de_dust2','de_mirage'),'BENCHMARK_UNVERIFIED_REPORT'],
    [full.replaceAll('10:02:05','10:00:30'),'BENCHMARK_INCOMPLETE'],
    [full.replace('Avg=416.7, P1=180.5','Avg=0, P1=0'),'BENCHMARK_REPORT_INVALID'],
  ]){const p=createBenchmarkProtocol();for(const line of text.trim().split('\n'))p.consume(line);assert.equal(p.snapshot().status,'invalid');assert.equal(p.snapshot().reason,reason);}
});

test('protocol fallback needs both mounted addon and maps/de_dust2.cfg, summary gives duration when timestamps absent',()=>{
  const p=createBenchmarkProtocol();for(const line of [
    `Mounting addon '${BENCHMARK_MAP.workshopId}'`,'execing maps/de_dust2.cfg','execing maps/fpsheavenbenchmark.cfg',
    '[VProf] VProfLite started.','[VProf] Summary of 50000 frames and 120 1-second intervals','[VProf] FPS: Avg=416.7, P1=180.5',
  ])p.consume(line);
  assert.equal(p.snapshot().status,'valid');assert.equal(p.snapshot().result.elapsedSeconds,120);
});

test('a timer alone cannot produce a successful measurement',async t=>{
  const f=await fixture(t,{runTimeoutMs:1000});await f.runner.start({type:'baseline'});f.setRunning(true);await f.runner.poll();f.advance(1001);
  const state=await f.runner.poll();assert.equal(state.status,'failed');assert.equal(state.error.code,'BENCHMARK_TIMEOUT');assert.equal(f.saved.length,0);assert.equal(f.cleanups.length,1);
});

test('old complete console.log is ignored and launch arguments are fixed',async t=>{
  const f=await fixture(t);await f.overwrite(full);
  const started=await f.runner.start({type:'baseline'});f.setRunning(true);await f.runner.poll();
  assert.equal(f.saved.length,0);assert.deepEqual(f.launches[0].args,['-novid','-condebug','+fps_max','0','+exec','csboost-benchmark.cfg']);
  assert.equal(started.logCapture.initialOffset,Buffer.byteLength(full));
  await f.append(full);const state=await f.runner.poll();assert.equal(state.status,'completed');assert.equal(f.saved.length,1);
  const captured=await fs.readFile(f.saved[0].logPath,'utf8');assert.equal(captured,full);assert.equal(state.result.averageFps,416.7);
  assert.equal(f.saved[0].metadata.runType,'baseline');assert.equal(state.savedResult.id,'saved-fixture');
});

test('captured real lines import through production benchmark history without reading old FPS',async t=>{
  const f=await fixture(t);const history=createBenchmarks(path.join(f.root,'history'));
  const runner=createBenchmarkRunner({...f.options,saveResult:({logPath})=>history.importFile(logPath)});t.after(()=>runner.dispose());
  await f.overwrite('[VProf] FPS: Avg=999, P1=900\n');await runner.start({type:'boosted',preset:'performance'});f.setRunning(true);await f.append(full);
  const state=await runner.poll();assert.equal(state.status,'completed');const records=await history.list();assert.equal(records.length,1);assert.equal(records[0].averageFps,416.7);assert.equal(records[0].sourceSHA256,state.result.sourceSHA256);
});

test('partial lines and multibyte characters are read incrementally',async t=>{
  const f=await fixture(t);await f.overwrite('old incomplete line');await f.runner.start({type:'baseline'});f.setRunning(true);
  await f.append(' [VProf] FPS: Avg=999, P1=900\n'+header+'10/14 10:02:05 [VProf] Summary of 50000 frames and 120 1-second intervals\n10/14 10:02:05 [VProf] FPS: Avg=416.');
  assert.equal((await f.runner.poll()).status,'measuring');assert.equal(f.saved.length,0);
  await f.append('7, P1=180.5\n');assert.equal((await f.runner.poll()).status,'completed');
});

test('truncated log resets protocol and cannot combine old map/start with a new naked report',async t=>{
  const f=await fixture(t);await f.runner.start({type:'baseline'});f.setRunning(true);await f.append(header);await f.runner.poll();
  await f.overwrite(report);const state=await f.runner.poll();assert.equal(state.status,'failed');assert.equal(state.error.code,'BENCHMARK_UNVERIFIED_REPORT');assert.equal(f.saved.length,0);
});

test('replacement larger than old offset is detected by boundary anchor and accepts only complete new protocol',async t=>{
  const f=await fixture(t);await f.overwrite('a'.repeat(200)+'\n');await f.runner.start({type:'baseline'});f.setRunning(true);
  await f.overwrite(full);const state=await f.runner.poll();assert.equal(state.status,'completed');assert.equal(state.logCapture.rotated,true);assert.equal(state.logCapture.fromOffset,0);
  assert.equal(await fs.readFile(f.saved[0].logPath,'utf8'),full);
});

test('file replacement between polls clears previous map evidence',async t=>{
  const f=await fixture(t);await f.runner.start({type:'baseline'});f.setRunning(true);await f.append(header);await f.runner.poll();
  await fs.rename(f.logPath,f.logPath+'.previous');await f.overwrite(report);
  const state=await f.runner.poll();assert.equal(state.status,'failed');assert.equal(f.saved.length,0);
});

test('PresentMon starts only after the live VProf phase and saves its summary beside VProf',async t=>{
  const f=await fixture(t),events=[];let active=false;
  const summary={status:'available',frameCount:200,medianMs:4,p95Ms:4,p99Ms:5,onePercentLowFps:250};
  const frameCapture={isActive:()=>active,prepare:async({id})=>{events.push(['prepare',id]);return {status:'prepared'};},start:async({id})=>{events.push(['start',id]);active=true;return {status:'capturing'};},stop:async({id,reason})=>{events.push(['stop',id,reason]);active=false;return summary;}};
  const runner=createBenchmarkRunner({...f.options,frameCapture,saveResult:async value=>{events.push(['save',value.id]);f.saved.push(value);return {id:'saved-fixture'};}});t.after(()=>runner.dispose());
  const started=await runner.start({type:'baseline'});assert.deepEqual(events.map(event=>event[0]),['prepare']);assert.equal(events[0][1],started.id);
  f.setRunning(true);await f.append(header);const measuring=await runner.poll();assert.equal(measuring.status,'measuring');assert.deepEqual(events.map(event=>event[0]),['prepare','start']);assert.equal(events[1][1],started.id);
  await f.append(report);const completed=await runner.poll();assert.equal(completed.status,'completed');assert.deepEqual(events.map(event=>event[0]),['prepare','start','stop','save']);assert.deepEqual(events[2],['stop',started.id,'completed']);assert.equal(f.saved[0].metadata.frametimes.medianMs,4);assert.equal(f.saved[0].metadata.result,undefined);
});

test('PresentMon startup failure keeps the VProf result usable and records capture as unavailable',async t=>{
  const f=await fixture(t),events=[];let active=false;
  const frameCapture={isActive:()=>active,prepare:async()=>({status:'prepared'}),start:async()=>{events.push('start');throw Error('permission denied');},stop:async({reason})=>{events.push('stop:'+reason);return {status:'unavailable',reason:'permission denied'};}};
  const runner=createBenchmarkRunner({...f.options,frameCapture,saveResult:async value=>{f.saved.push(value);return {id:'saved-fixture'};}});t.after(()=>runner.dispose());
  await runner.start({type:'baseline'});f.setRunning(true);await f.append(header);const measuring=await runner.poll();assert.equal(measuring.status,'measuring');assert.ok(measuring.warnings.some(note=>note.includes('VProf continua')));
  await f.append(report);const completed=await runner.poll();assert.equal(completed.status,'completed');assert.deepEqual(events,['start','stop:completed']);assert.equal(f.saved[0].metadata.frametimes.status,'unavailable');assert.equal(f.saved[0].metadata.frametimes.reason,'permission denied');
});

test('config is restored exactly and user autoexec/console.log are never deleted',async t=>{
  const f=await fixture(t);const config=path.join(f.cfgPath,BENCHMARK_MAP.configName);await fs.writeFile(config,'existing custom benchmark file\r\n');await f.overwrite('existing log\n');
  await f.runner.start({type:'baseline'});assert.match(await fs.readFile(config,'utf8'),/map_workshop 3240880604 de_dust2/);
  const state=await f.runner.cancel();assert.equal(state.status,'cancelled');assert.equal(await fs.readFile(config,'utf8'),'existing custom benchmark file\r\n');
  assert.equal(await fs.readFile(f.logPath,'utf8'),'existing log\n');assert.equal(await fs.readFile(path.join(f.cfgPath,'autoexec.cfg'),'utf8'),'user-owned config\n');assert.equal(f.saved.length,0);
});

test('external config edits are preserved and reported as pending recovery',async t=>{
  const f=await fixture(t);await f.runner.start({type:'baseline'});const config=path.join(f.cfgPath,BENCHMARK_MAP.configName);await fs.writeFile(config,'external edit\n');
  const state=await f.runner.cancel();assert.equal(state.status,'recovery-required');assert.match(state.cleanupError,/alterado externamente/);assert.equal(await fs.readFile(config,'utf8'),'external edit\n');
  await assert.rejects(f.runner.start({type:'baseline'}),/restauração pendente/);
});

test('boosted requires real prepare adapter, persists preparation before launch, cleans exact metadata',async t=>{
  const f=await fixture(t);f.setPrepareResult({originalPowerGuid:'fixture-guid',processPolicy:{prioritizeGame:true}});
  const runner=createBenchmarkRunner({...f.options,launch:async()=>{
    const journal=JSON.parse(await fs.readFile(path.join(f.directory,'active-benchmark.json'),'utf8'));assert.equal(journal.preparationAttempted,true);assert.equal(journal.preparation.originalPowerGuid,'fixture-guid');
  }});t.after(()=>runner.dispose());await runner.start({type:'boosted',preset:'competitive'});await runner.cancel();
  assert.equal(f.cleanups[0].prepared.originalPowerGuid,'fixture-guid');assert.equal(f.cleanups[0].preset,'competitive');
  const noPrepare=createBenchmarkRunner({...f.options,prepare:undefined});await assert.rejects(noPrepare.start({type:'boosted'}),/adaptador real/);
});

test('prepare failure and launch failure both clean up and restore own config',async t=>{
  for(const field of ['prepare','launch']){
    const f=await fixture(t,{[field]:async()=>{throw new Error(field+' fixture failure');}});
    await assert.rejects(f.runner.start({type:'boosted'}),new RegExp(field+' fixture failure'));
    assert.equal(f.cleanups.length,1);assert.equal((await f.runner.getState()).status,'failed');await assert.rejects(fs.stat(path.join(f.cfgPath,BENCHMARK_MAP.configName)),{code:'ENOENT'});
  }
});

test('cancellation during prepare waits for its metadata and restores without launching',async t=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});
  let entered;const preparing=new Promise(resolve=>{entered=resolve;});
  const f=await fixture(t,{prepare:async()=>{entered();await waiting;return {changed:true};}});
  const started=f.runner.start({type:'boosted'});
  await preparing;
  await f.runner.cancel();release();await assert.rejects(started,/cancelado/);assert.equal(f.launches.length,0);assert.equal(f.cleanups[0].prepared.changed,true);
});

test('recover uses persisted preparation metadata and leaves interrupted game for user to close',async t=>{
  const f=await fixture(t);f.setPrepareResult({changedPower:true});await f.runner.start({type:'boosted'});f.runner.dispose();
  const replacement=createBenchmarkRunner(f.options);t.after(()=>replacement.dispose());f.setRunning(true);
  const pending=await replacement.recover();assert.equal(pending.status,'recovery-required');assert.equal(f.cleanups.length,0);
  f.setRunning(false);const restored=await replacement.cancel();assert.equal(restored.status,'cancelled');assert.equal(f.cleanups[0].prepared.changedPower,true);
});

test('recover after crash restores configuration when game is closed and creates no result',async t=>{
  const f=await fixture(t);const target=path.join(f.cfgPath,BENCHMARK_MAP.configName);await fs.writeFile(target,'prior file');await f.runner.start({type:'boosted'});f.runner.dispose();
  const replacement=createBenchmarkRunner(f.options);t.after(()=>replacement.dispose());const state=await replacement.recover();assert.equal(state.status,'cancelled');assert.equal(state.error.code,'BENCHMARK_INTERRUPTED');assert.equal(await fs.readFile(target,'utf8'),'prior file');assert.equal(f.saved.length,0);
});

test('game exit before report and focus loss do not save measurements',async t=>{
  const f=await fixture(t);await f.runner.start({type:'baseline'});f.setRunning(true);await f.append(header);await f.runner.poll();f.setRunning(false);
  const exited=await f.runner.poll();assert.equal(exited.status,'failed');assert.equal(exited.error.code,'BENCHMARK_NO_REPORT');assert.equal(f.saved.length,0);
  const g=await fixture(t);await g.runner.start({type:'baseline'});g.setRunning(true);g.setFocus(false);await g.append(header);
  const unfocused=await g.runner.poll();assert.equal(unfocused.status,'failed');assert.equal(unfocused.error.code,'BENCHMARK_FOCUS_LOST');assert.equal(g.saved.length,0);
});

test('cleanup failure retains durable recovery journal and retries instead of reporting complete restoration',async t=>{
  let fail=true;const f=await fixture(t,{cleanup:async()=>{if(fail)throw new Error('fixture recovery denied');}});await f.runner.start({type:'baseline'});
  assert.equal((await f.runner.cancel()).status,'recovery-required');await fs.stat(path.join(f.directory,'active-benchmark.json'));fail=false;
  assert.equal((await f.runner.cancel()).status,'cancelled');await assert.rejects(fs.stat(path.join(f.directory,'active-benchmark.json')),{code:'ENOENT'});
});

test('concurrent starts are rejected while first prepare is active',async t=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=await fixture(t,{prepare:async()=>waiting});const pending=f.runner.start({type:'baseline'});
  await assert.rejects(f.runner.start({type:'baseline'}),/benchmark ativo/);release({fixture:true});await pending;await f.runner.cancel();
});

test('explicit process policy is validated, persisted and passed to each native adapter',async t=>{
  const f=await fixture(t),observed=[];
  const runner=createBenchmarkRunner({...f.options,onGameStart:async value=>{observed.push(value);return {fixture:true};}});t.after(()=>runner.dispose());
  await assert.rejects(runner.start({type:'boosted',processPolicy:{backgroundApps:['cmd.exe; whoami']}}),/Política/);
  await assert.rejects(runner.start({type:'boosted',processPolicy:{cpuDistribution:'true'}}),/Política/);
  assert.equal(f.prepared.length,0);assert.equal(f.launches.length,0);
  const processPolicy={prioritizeGame:true,backgroundApps:['chrome','Discord'],backgroundMemoryPriorityApps:['Spotify'],cpuDistribution:true};
  const started=await runner.start({type:'boosted',processPolicy});assert.deepEqual(started.processPolicy,processPolicy);assert.deepEqual(f.prepared[0].processPolicy,processPolicy);
  const journal=JSON.parse(await fs.readFile(path.join(f.directory,'active-benchmark.json'),'utf8'));assert.deepEqual(journal.processPolicy,processPolicy);
  f.setRunning(true);await runner.poll();assert.deepEqual(observed[0].processPolicy,processPolicy);await runner.cancel();assert.deepEqual(f.cleanups[0].processPolicy,processPolicy);
});

test('history capture stops at the accepted report, ignoring later unrelated FPS in the same read',async t=>{
  const f=await fixture(t);const history=createBenchmarks(path.join(f.root,'history'));
  const runner=createBenchmarkRunner({...f.options,saveResult:({logPath})=>history.importFile(logPath)});t.after(()=>runner.dispose());
  await runner.start({type:'baseline'});f.setRunning(true);await f.append(full+'[VProf] FPS: Avg=999, P1=900\n');
  const state=await runner.poll();assert.equal(state.status,'completed');assert.equal((await history.list())[0].averageFps,416.7);
  assert.equal(state.logCapture.bytes,Buffer.byteLength(full));assert.equal(await fs.readFile(path.join(f.directory,state.id+'.log'),'utf8'),full);
});

test('split UTF-8 bytes preserve exact source hash and do not corrupt protocol boundaries',async t=>{
  const f=await fixture(t);await f.runner.start({type:'baseline'});f.setRunning(true);
  const text=Buffer.from('informação\n'+header),split=text.indexOf(Buffer.from('ç'))+1;
  await f.append(text.subarray(0,split));await f.runner.poll();await f.append(Buffer.concat([text.subarray(split),Buffer.from(report)]));
  const state=await f.runner.poll();assert.equal(state.status,'completed');assert.equal(await fs.readFile(f.saved[0].logPath,'utf8'),'informação\n'+full);
});

async function withFpsCap(t,f){
  const target=path.join(f.installation.steamPath,'userdata','1','730','local','cfg','cs2_machine_convars.vcfg');
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'"config" { "convars" { "fps_max" "400" "unchanged" "yes" } }\n');
  const fpsCap=createBenchmarkFpsCap({directory:f.directory,system:{refreshSteam:f.options.resolveInstallation,isGameRunning:f.options.isGameRunning},getSteamId:async()=>'76561197960265729',readActiveAccount:async()=>'1'});
  const options={...f.options,fpsCap};const runner=createBenchmarkRunner(options);t.after(()=>runner.dispose());return {runner,target,options};
}

test('saved benchmark waits for close, restores only its FPS cap and never imports twice after cancel',async t=>{
  const f=await fixture(t),{runner,target}=await withFpsCap(t,f);
  const started=await runner.start({type:'baseline',tuningNote:'PBO Auto; CO desligado'});assert.equal(started.fpsLimit.previous,'400');assert.equal(f.prepared[0].tuningNote,'PBO Auto; CO desligado');
  f.setRunning(true);await fs.writeFile(target,'"config" { "convars" { "fps_max" "0" "unchanged" "updated by game" } }\n');await f.append(full);
  const measured=await runner.poll();assert.equal(measured.status,'waiting-for-game-close');assert.equal(measured.pendingStatus,'completed');assert.equal(measured.result.averageFps,416.7);assert.equal(measured.savedResult.id,'saved-fixture');assert.equal(runner.isActive(),true);assert.equal(f.cleanups.length,1);assert.equal(f.saved.length,1);assert.equal(f.saved[0].id,started.id);assert.equal(f.saved[0].metadata.tuningNote,'PBO Auto; CO desligado');
  await assert.rejects(fs.stat(path.join(f.cfgPath,BENCHMARK_MAP.configName)),{code:'ENOENT'});
  await fs.writeFile(path.join(f.cfgPath,BENCHMARK_MAP.configName),'// user creates a new file after cleanup\n');
  assert.equal((await runner.cancel()).pendingStatus,'completed');f.setRunning(false);
  const restored=await runner.poll();assert.equal(restored.status,'completed');assert.equal(restored.error,null);assert.equal(restored.result.averageFps,416.7);assert.equal(f.saved.length,1);assert.equal(f.cleanups.length,1);assert.equal(parseBenchmarkFpsCap(await fs.readFile(target,'utf8')).value,'400');assert.match(await fs.readFile(target,'utf8'),/updated by game/);assert.equal(runner.isActive(),false);
  assert.equal(await fs.readFile(path.join(f.cfgPath,BENCHMARK_MAP.configName),'utf8'),'// user creates a new file after cleanup\n');
  assert.match(restored.instructions,/restaurados/);assert.ok(!restored.instructions.includes('Feche o CS2'));assert.equal(restored.progress,1);
});

test('watchdog retains pending successful result and normal startup monitors deferred FPS restoration',async t=>{
  const f=await fixture(t),{runner,target,options}=await withFpsCap(t,f);await runner.start({type:'boosted'});f.setRunning(true);await fs.writeFile(target,'"config" { "convars" { "fps_max" "0" } }');await f.append(full);
  assert.equal((await runner.poll()).status,'waiting-for-game-close');runner.dispose();
  const watchdog=createBenchmarkRunner(options);t.after(()=>watchdog.dispose());const pending=await watchdog.recover({restoreImmediately:true});assert.equal(pending.status,'recovery-required');assert.equal(pending.pendingStatus,'completed');assert.equal(pending.savedResult.id,'saved-fixture');assert.match(pending.cleanupError,/Feche o CS2/);watchdog.dispose();
  const reopened=createBenchmarkRunner(options);t.after(()=>reopened.dispose());assert.equal((await reopened.recover()).status,'waiting-for-game-close');f.setRunning(false);
  const state=await reopened.poll();assert.equal(state.status,'completed');assert.equal(state.result.averageFps,416.7);assert.equal(f.saved.length,1);assert.equal(f.cleanups.length,1);assert.equal(parseBenchmarkFpsCap(await fs.readFile(target,'utf8')).value,'400');
});

test('cancelled and failed benchmark outcomes survive deferred cap restoration without inventing results',async t=>{
  for(const mode of ['cancel','failure']){
    const f=await fixture(t),{runner,target}=await withFpsCap(t,f);await runner.start({type:'baseline'});f.setRunning(true);await fs.writeFile(target,'"config" { "convars" { "fps_max" "0" } }');
    let pending;if(mode==='cancel'){await runner.poll();pending=await runner.cancel();}else{f.setFocus(false);await f.append(header);pending=await runner.poll();}
    assert.equal(pending.status,'waiting-for-game-close');assert.equal(pending.pendingStatus,mode==='cancel'?'cancelled':'failed');assert.equal(f.saved.length,0);
    f.setRunning(false);const state=await runner.poll();assert.equal(state.status,mode==='cancel'?'cancelled':'failed');assert.equal(state.error.code,mode==='cancel'?'BENCHMARK_CANCELLED':'BENCHMARK_FOCUS_LOST');assert.equal(state.result,undefined);assert.equal(parseBenchmarkFpsCap(await fs.readFile(target,'utf8')).value,'400');
  }
});

test('cap preview failure preserves map detection and prevents silent cap restore when adapter is missing',async t=>{
  const f=await fixture(t);const broken=createBenchmarkRunner({...f.options,fpsCap:{inspect:async()=>{throw new Error('fixture account mismatch');}}});t.after(()=>broken.dispose());
  const inspected=await broken.inspect();assert.equal(inspected.map.installed,true);assert.equal(inspected.fpsLimit.available,false);assert.equal(inspected.fpsLimit.canCapture,false);assert.match(inspected.fpsLimit.reason,/account mismatch/);
  const {runner,options}=await withFpsCap(t,f);await runner.start({type:'baseline'});runner.dispose();
  const unavailable=createBenchmarkRunner({...options,fpsCap:undefined});t.after(()=>unavailable.dispose());const state=await unavailable.recover();assert.equal(state.status,'recovery-required');assert.match(state.cleanupError,/adaptador.*indisponível/);await fs.stat(path.join(f.directory,'active-benchmark.json'));
});

test('tuning notes reject arbitrary controls and persist validated manual labels before native preparation',async t=>{
  const f=await fixture(t);
  for(const tuningNote of ['x\ncommand','x\0command','x'.repeat(301),{},42])await assert.rejects(f.runner.start({type:'baseline',tuningNote}),/Anotação/);
  assert.equal(f.prepared.length,0);assert.equal(f.launches.length,0);const state=await f.runner.start({type:'baseline',tuningNote:'  PBO padrão, CO -5 (manual)  '});assert.equal(state.tuningNote,'PBO padrão, CO -5 (manual)');assert.equal(f.prepared[0].id,state.id);assert.equal(f.prepared[0].tuningNote,state.tuningNote);await f.runner.cancel();
});

test('short VProf summary cannot be accepted through longer wall timestamps',()=>{
  for(const text of [full.replace('120 1-second intervals','30 1-second intervals'),full.replace('50000 frames','0 frames')]){
    const protocol=createBenchmarkProtocol();for(const line of text.trim().split('\n'))protocol.consume(line);assert.equal(protocol.snapshot().reason,'BENCHMARK_INCOMPLETE');
  }
});
