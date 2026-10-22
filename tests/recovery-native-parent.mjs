// Development only: uses the copied source and an owned chrome.exe fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {runtime,directory,mode,fixturePid}=JSON.parse(process.argv[2]);
const app=path.join(runtime,'resources','app');
const {startRecoveryGuard}=await import(pathToFileURL(path.join(app,'recovery-guard.mjs')));
const {spawn}=await import('node:child_process');
const guard=await startRecoveryGuard({directory,workerPath:path.join(app,'native','csboost-recovery.exe'),spawnImpl:(file,args,options)=>{const child=spawn(file,args,{...options,stdio:['pipe','pipe','pipe']});child.stderr.on('data',value=>process.stderr.write(value));child.stdout.on('data',value=>process.stderr.write('Native: '+value));return child;}});
if(mode==='clean'){guard.disarm();process.send({ready:true,clean:true});setTimeout(()=>process.exit(0),50);}
else if(mode==='wait'){process.send({ready:true,recoveryExists:await fs.stat(path.join(directory,'crash-recovery.json')).then(()=>true,()=>false)});process.on('message',()=>{guard.disarm();setTimeout(()=>process.exit(0),50);});}
else{
  const {createCpuAffinity}=await import(pathToFileURL(path.join(app,'cpu-affinity.mjs')));
  const {createProcessTuning,runProcessOperation}=await import(pathToFileURL(path.join(app,'process-tuning.mjs')));
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const execute=promisify(execFile);
  const before=JSON.parse((await execute(path.join(app,'native','csboost-cpu.exe'),['get',String(fixturePid)],{windowsHide:true})).stdout);
  if(before.status!=='ok')throw Error('Owned fixture unavailable');
  // Inventory never includes any existing user process; native sets keep its identity check.
  const rows=[{pid:fixturePid,name:'chrome',path:before.path,startedAt:before.startedAt,priority:'Normal'}];
  const processes=request=>request.action==='list'?Promise.resolve(rows):runProcessOperation(request);
  const system={refreshSteam:async()=>({cs2Installed:true,gamePath:path.join(directory,'fixture-game')})};
  const priority=createProcessTuning({directory:path.join(directory,'process-backups'),system,processes});
  const affinity=createCpuAffinity({directory:path.join(directory,'affinity-backups'),system,processes,workerPath:path.join(app,'native','csboost-cpu.exe')});
  const priorityReport=await priority.apply({backgroundApps:['chrome']});
  const affinityReport=await affinity.apply({backgroundApps:['chrome']});
  if(priorityReport.applied!==1||affinityReport.applied!==1)throw Error('Owned changes not confirmed');
  await fs.writeFile(path.join(directory,'game-session.json'),JSON.stringify({preset:'balanced',status:'running',powerChanged:false,observedGame:true,startTime:Date.now(),startedAt:new Date().toISOString(),processPolicy:{backgroundApps:['chrome'],cpuDistribution:true}}));
  process.send({ready:true,before,priority:priorityReport.applied,affinity:affinityReport.applied});
  setInterval(()=>{},1000);
}
