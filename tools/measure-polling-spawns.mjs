// Native boundaries are counted, never executed. All journals/game files are fixtures.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSystem} from '../src/free/system.mjs';
import {createProcessTuning} from '../src/free/process-tuning.mjs';
import {createCpuAffinity} from '../src/free/cpu-affinity.mjs';
import {createGameSessions} from '../src/free/sessions.mjs';
import {createBenchmarkRunner,BENCHMARK_MAP} from '../src/free/benchmark-runner.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-polling-audit-'));
const results=[];
const gamePath=path.join(root,'steam','steamapps','common','Counter-Strike Global Offensive');
const cfgPath=path.join(gamePath,'game','csgo','cfg');
const executable=path.join(gamePath,'game','bin','win64','cs2.exe');
await fs.mkdir(cfgPath,{recursive:true});
const workshop=path.join(root,'steam','steamapps','workshop','content','730',BENCHMARK_MAP.workshopId);
await fs.mkdir(workshop,{recursive:true});
await fs.writeFile(path.join(workshop,'fixture.vpk'),'fixture');
const installation={installed:true,cs2Installed:true,gamePath,cfgPath,steamPath:path.join(root,'steam')};
let clock=100000,running=false,counts={};
const bump=name=>{counts[name]=(counts[name]||0)+1;};
// Production detectSteam performs one reg.exe query; this adapter counts the
// refresh calls separately so inferred registry launches are not misreported
// as intercepted real child-process calls.
const system=createSystem({dataDirectory:path.join(root,'system'),detect:async()=>{bump('refreshSteam');return installation;},
  run:async(file)=>{assert.equal(path.basename(file),'tasklist.exe');bump('tasklist');return running?'"cs2.exe","42","Console","1","100 K"':'';},
  spawnImpl:()=>{throw Error('Native spawning is forbidden in this audit');}});
const rows=[{pid:42,name:'cs2',path:executable,startedAt:'2026-10-16T00:00:00.000Z',priority:'Normal',memoryMB:100}];
const processes=async request=>{bump('processPowershell');if(request.action==='list')return structuredClone(rows);return {status:'changed'};};
const runWorker=async args=>{bump('affinityWorker');switch(args[0]){
  case 'topology':return {supported:true,groups:1,systemMask:'ff',cores:[{group:0,mask:'3',efficiencyClass:0},{group:0,mask:'c',efficiencyClass:0},{group:0,mask:'30',efficiencyClass:0},{group:0,mask:'c0',efficiencyClass:0}]};
  case 'get':return {status:'ok',mask:'ff',systemMask:'ff',startedAt:rows[0].startedAt,path:executable};
  case 'set':return {status:'changed'};
  case 'focused':return {focused:true};
  default:throw Error('Unexpected worker request');
}};
function summary(label,ticks){const intercepted=(counts.tasklist||0)+(counts.processPowershell||0)+(counts.affinityWorker||0);return {label,windowSeconds:60,ticks,...counts,interceptedNativeBoundaries:intercepted,inferredRegistryFromRefresh:counts.refreshSteam||0,estimatedProductionChildLaunches:intercepted+(counts.refreshSteam||0)};}
try{
  for(const [label,policy] of [['session-no-policy',{}],['session-priority',{prioritizeGame:true}],['session-priority-affinity',{prioritizeGame:true,cpuDistribution:true}]]){
    const directory=path.join(root,label);
    const processTuning=createProcessTuning({directory,system,processes});
    const cpuAffinity=createCpuAffinity({directory,system,processes,runWorker});
    const sessions=createGameSessions({directory,system:{...system,launchCS2:async()=>{}},isGameRunning:system.isGameRunning,processTuning,cpuAffinity,now:()=>clock,pollMs:2147483647});
    running=false;await sessions.start({preset:'balanced',processPolicy:policy});running=true;await sessions.poll();counts={};
    for(let i=0;i<40;i++){clock+=1500;await sessions.poll();}
    results.push(summary(label,40));sessions.dispose();await sessions.stop();
  }
  const cpuAffinity=createCpuAffinity({directory:path.join(root,'benchmark-affinity'),system,processes,runWorker});
  const runner=createBenchmarkRunner({directory:path.join(root,'benchmark'),resolveInstallation:system.refreshSteam,isGameRunning:system.isGameRunning,isGameFocused:cpuAffinity.isGameFocused,launch:async()=>{},now:()=>clock,setIntervalImpl:()=>({unref(){}}),clearIntervalImpl:()=>{}});
  running=false;await runner.start({type:'baseline'});running=true;
  await fs.writeFile(path.join(gamePath,'game','csgo','console.log'),`10/16 10:00:00 Loading map "de_dust2" (addon '${BENCHMARK_MAP.workshopId}')\n10/16 10:00:01 execing maps/fpsheavenbenchmark.cfg\n10/16 10:00:02 ChangeGameUIState: CSGO_GAME_UI_STATE_LOADINGSCREEN -> CSGO_GAME_UI_STATE_INGAME\n10/16 10:00:03 [VProf] VProfLite started.\n`);
  await runner.poll();assert.equal((await runner.getState()).status,'measuring');counts={};
  for(let i=0;i<60;i++){clock+=1000;await runner.poll();assert.equal((await runner.getState()).status,'measuring');}
  results.push(summary('benchmark-measuring',60));await runner.cancel();runner.dispose();
  const report={mode:'injected-native-boundaries',realNativeProcessesLaunched:0,realGameLaunched:false,personalFilesModified:false,fixtureSecondsPerCase:60,notes:['Virtual time and fixture process list; this measures call frequency, not CPU/frametime cost.','Tasklist and worker boundaries execute real orchestration with run/runWorker adapters.','processPowershell is inferred from each processes adapter call, matching production runProcessOperation; refreshSteam is counted separately and implies one production reg.exe per call.','Startup, first process application, teardown, watchdog and renderer IPC are outside the steady-state window.'],results};
  console.log(JSON.stringify(report,null,2));
}finally{
  const resolved=path.resolve(root),parent=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('csboost-polling-audit-'))throw Error('Unsafe fixture cleanup path');
  await fs.rm(resolved,{recursive:true,force:true});
}
