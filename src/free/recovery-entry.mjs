import fs from 'node:fs/promises';
import path from 'node:path';
import {createSystem} from './system.mjs';
import {createProcessTuning} from './process-tuning.mjs';
import {createCpuAffinity} from './cpu-affinity.mjs';
import {createGameSessions} from './sessions.mjs';
import {createBenchmarkAdapter} from './benchmark-adapter.mjs';
import {createBenchmarkRunner} from './benchmark-runner.mjs';
import {recoverTemporaryState} from './recovery.mjs';
import {createBenchmarkFpsCap} from './benchmark-fps-cap.mjs';
import {createWatcher} from './watcher.mjs';
import {createFrameCapture} from './frame-capture.mjs';
import {createSessionSummaryStore} from './session-summary-store.mjs';
import {fileURLToPath} from 'node:url';

let watcher;
try{
  if(process.argv.length!==4||process.argv[2]!=='--data')throw new Error('Invalid recovery invocation');
  const directory=Buffer.from(process.argv[3],'base64').toString('utf8');
  if(!path.isAbsolute(directory))throw new Error('Invalid recovery directory');
  const stat=await fs.lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||path.normalize(await fs.realpath(directory)).toLowerCase()!==path.normalize(directory).toLowerCase())throw new Error('Invalid recovery directory');
  for(const name of ['affinity-backups','process-backups','benchmark-runs']){try{const child=await fs.lstat(path.join(directory,name));if(!child.isDirectory()||child.isSymbolicLink())throw new Error('Invalid recovery subdirectory');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const system=createSystem({dataDirectory:directory});
  let processOperations;
  try{watcher=createWatcher({workerPath:path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-watcher.exe')});const installation=await system.refreshSteam();await watcher.start({gamePath:installation.cs2Installed?installation.gamePath:undefined});processOperations=watcher.processOperation;}catch{await watcher?.stop();watcher=null;}
  const processTuning=createProcessTuning({directory:path.join(directory,'process-backups'),system,processes:processOperations});
  const cpuAffinity=createCpuAffinity({directory:path.join(directory,'affinity-backups'),system});
  const benchmarkAdapter=createBenchmarkAdapter({directory:path.join(directory,'benchmark-runs'),system,processTuning,cpuAffinity});
  const fpsCap=createBenchmarkFpsCap({directory:path.join(directory,'benchmark-runs'),system});
  const frameCapture=createFrameCapture({directory:path.join(directory,'frame-capture')});
  const benchmarkRunner=createBenchmarkRunner({directory:path.join(directory,'benchmark-runs'),resolveInstallation:()=>system.refreshSteam(),isGameRunning:()=>system.isGameRunning(),launch:async()=>{throw new Error('Recovery cannot launch a game');},cleanup:benchmarkAdapter.cleanup,fpsCap,frameCapture});
  const sessionSummaryStore=createSessionSummaryStore({directory:path.join(directory,'session-summaries')});
  const sessions=createGameSessions({directory,system,processTuning,cpuAffinity,frameCapture,sessionSummaryStore,isGameRunning:()=>system.isGameRunning()});
  const report=await recoverTemporaryState({directory,sessions,benchmarkRunner,benchmarkAdapter,processTuning,cpuAffinity,frameCapture});
  process.exitCode=report.ok?0:2;
}catch{process.exitCode=3;}finally{await watcher?.stop();}
