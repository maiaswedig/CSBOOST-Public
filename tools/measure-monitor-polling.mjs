// Native boundaries are counted, never executed. All journals/game files are fixtures.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createWatcher} from '../src/free/watcher.mjs';
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
let clock=100000,running=false,counts={},powerPreference={control:0,state:0};
const bump=name=>{counts[name]=(counts[name]||0)+1;};
let totalChildren=0;
const workerPath=path.resolve('vendor/native/csboost-watcher.exe');
const watcher=createWatcher({workerPath,spawnImpl:()=>{
  totalChildren++;bump('monitorStarts');const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
  child.stdin=new Writable({write(bytes,_encoding,callback){const req=JSON.parse(bytes);bump('monitorRequests');let result;
    switch(req.op){
      case 'snapshot':result={running};break;case 'focused':result={focused:true};break;case 'steamActiveUser':result=1;break;
      case 'list':bump('processLists');result=structuredClone(rows);break;
      case 'sample':bump('cpuSamples');result={supported:true,logicalProcessors:12,totalMs:clock*12,idleMs:clock*2,gameFocused:true,externalGovernor:false,rows:rows.map(row=>({...row,cpuMs:clock*3}))};break;
      case 'getPower':result={status:'ok',...powerPreference};break;
      case 'setPower':assert.equal(powerPreference.control,req.expectedControl);powerPreference={control:req.control,state:req.state};result={status:'changed'};break;
      case 'topology':result={supported:true,groups:1,systemMask:'ff',cores:[{group:0,mask:'3',efficiencyClass:0},{group:0,mask:'c',efficiencyClass:0},{group:0,mask:'30',efficiencyClass:0},{group:0,mask:'c0',efficiencyClass:0}]};break;
      case 'getAffinity':result={status:'ok',...rows[0],systemMask:'ff'};break;
      case 'setPriority':assert.equal(rows[0].priority,req.expected);rows[0].priority=req.priority;result={status:'changed'};break;
      case 'setAffinity':assert.equal(rows[0].mask,req.expected);rows[0].mask=req.mask;result={status:'changed'};break;
      default:throw Error('Unexpected monitor request');
    }
    queueMicrotask(()=>child.stdout.write(JSON.stringify({id:req.id,ok:true,result})+'\n'));callback();
  }});queueMicrotask(()=>child.stdout.write('{"ready":true,"version":1}\n'));return child;
}});
// Production detectSteam performs one reg.exe query; this adapter counts the
// refresh calls separately so inferred registry launches are not misreported
// as intercepted real child-process calls.
const system=createSystem({dataDirectory:path.join(root,'system'),detect:async()=>{bump('refreshSteam');return installation;},
  checkGameRunning:()=>watcher.isGameRunning(),
  run:async()=>{throw Error('No short-lived native process may run in this monitor audit');},
  spawnImpl:()=>{throw Error('Native spawning is forbidden in this audit');}});
const rows=[{pid:42,name:'cs2',path:executable,startedAt:'2026-10-16T00:00:00.000Z',priority:'Normal',mask:'ff',memoryMB:100}];
const processes=watcher.processOperation,runWorker=watcher.cpuOperation;
function summary(label,ticks){const intercepted=(counts.tasklist||0)+(counts.processPowershell||0)+(counts.affinityWorker||0);return {label,windowSeconds:60,ticks,...counts,interceptedNativeBoundaries:intercepted,inferredRegistryFromRefresh:counts.refreshSteam||0,estimatedProductionChildLaunches:intercepted+(counts.refreshSteam||0)};}
try{
  await watcher.start({executablePath:executable});
  for(const [label,policy] of [['session-no-policy',{}],['session-priority',{prioritizeGame:true}],['session-priority-affinity',{prioritizeGame:true,cpuDistribution:true}],['session-automatic',{automatic:true}]]){
    const directory=path.join(root,label);
    const processTuning=createProcessTuning({directory,system,processes,now:()=>clock});
    const cpuAffinity=createCpuAffinity({directory,system,processes,runWorker});
    const sessions=createGameSessions({directory,system:{...system,launchCS2:async()=>{}},isGameRunning:system.isGameRunning,processTuning,cpuAffinity,now:()=>clock,pollMs:2147483647});
    running=false;await sessions.start({preset:'balanced',processPolicy:policy});running=true;await sessions.poll();counts={};
    for(let i=0;i<40;i++){clock+=1500;await sessions.poll();}
    results.push(summary(label,40));sessions.dispose();await sessions.stop();
  }
  const cpuAffinity=createCpuAffinity({directory:path.join(root,'benchmark-affinity'),system,processes,runWorker});
  const runner=createBenchmarkRunner({directory:path.join(root,'benchmark'),resolveInstallation:system.refreshSteam,isGameRunning:system.isGameRunning,isGameFocused:watcher.isGameFocused,launch:async()=>{},now:()=>clock,setIntervalImpl:()=>({unref(){}}),clearIntervalImpl:()=>{}});
  running=false;await runner.start({type:'baseline'});running=true;
  await fs.writeFile(path.join(gamePath,'game','csgo','console.log'),`10/16 10:00:00 Loading map "de_dust2" (addon '${BENCHMARK_MAP.workshopId}')\n10/16 10:00:01 execing maps/fpsheavenbenchmark.cfg\n10/16 10:00:02 ChangeGameUIState: CSGO_GAME_UI_STATE_LOADINGSCREEN -> CSGO_GAME_UI_STATE_INGAME\n10/16 10:00:03 [VProf] VProfLite started.\n`);
  await runner.poll();assert.equal((await runner.getState()).status,'measuring');counts={};
  for(let i=0;i<60;i++){clock+=1000;await runner.poll();await runner.inspect();await watcher.readActiveUser();await watcher.readActiveUser();assert.equal((await runner.getState()).status,'measuring');}
  results.push(summary('benchmark-measuring',60));await runner.cancel();runner.dispose();
  assert.equal(totalChildren,1);for(const result of results)assert.equal(result.estimatedProductionChildLaunches,0);
  const report={mode:'persistent-monitor-with-mocked-child',realNativeProcessesLaunched:0,monitorProcessesAtStartup:totalChildren,realGameLaunched:false,personalFilesModified:false,fixtureSecondsPerCase:60,notes:['Virtual time and fixture process list; this measures call frequency, not CPU/frametime cost.','Real watcher JSONL serialization and production sessions/process/CPU/benchmark modules are exercised with a mocked child.','Steady-state session policies have no new eligible PID; native setters and teardown execute against fixture process state only.','The measuring window includes active-run inventory and ActiveUser IPC reads. Startup, preparation, completion and recovery are outside the window.','This is not an OS-wide trace of a running game or every Electron process.'],results};
  console.log(JSON.stringify(report,null,2));
}finally{
  await watcher.stop();
  const resolved=path.resolve(root),parent=path.resolve(os.tmpdir());
  if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('csboost-polling-audit-'))throw Error('Unsafe fixture cleanup path');
  await fs.rm(resolved,{recursive:true,force:true});
}
