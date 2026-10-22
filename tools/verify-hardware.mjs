// Read-only hardware diagnostics and a local development reference, never packaged.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createMemoryTuning} from '../src/free/memory-tuning.mjs';
import {createAmdTuning} from '../src/free/amd-tuning.mjs';
import {createSystem} from '../src/free/system.mjs';
import {readSystemInventory} from '../src/free/system-worker.mjs';
import {createSteamAuth} from '../src/free/steam-auth.mjs';
import {createBenchmarkFpsCap} from '../src/free/benchmark-fps-cap.mjs';
import {createBenchmarks} from '../src/free/benchmarks.mjs';
const directory=path.resolve('analysis/free-verification'),data=path.join(process.env.APPDATA,'csboost-free');
const auth=createSteamAuth({sessionPath:path.join(data,'steam-session.json'),openExternal:async()=>{throw Error('Read-only verification does not initiate login.');}});
try{
  const system=createSystem({dataDirectory:path.join(directory,'hardware-inspection')}),amdTuning=createAmdTuning();
  const memoryTuning=createMemoryTuning({directory:path.join(directory,'hardware-reference'),amdTuning,runInventory:()=>readSystemInventory({operation:'memory'},{workerPath:path.resolve('vendor/native/csboost-system.exe')})});
  if(await system.isGameRunning())throw Error('Close CS2 before verifying restored state.');
  const cap=createBenchmarkFpsCap({directory:path.join(data,'live-benchmark','benchmark-runs'),system,getSteamId:async()=>(await auth.getSession())?.steamId});
  const [fpsLimit,memory,amd]=await Promise.all([cap.inspect(),memoryTuning.snapshot(),amdTuning.inspect()]);
  await memoryTuning.captureReference({note:'Read-only development verification; no firmware adjustment.'});
  const check=await memoryTuning.checkReference();
  await fs.writeFile(path.join(directory,'hardware-guide.html'),await memoryTuning.renderGuide());
  const live=JSON.parse(await fs.readFile(path.join(directory,'live-benchmark.json'),'utf8'));
  if(live.status!=='completed'||!live.fpsCapRestoration?.restored||fpsLimit.current!=='1000'||fpsLimit.pending)throw Error('Benchmark restoration is not complete.');
  const benchmarks=createBenchmarks(path.join(data,'benchmarks')),baseline=await benchmarks.read(live.savedResult.id);
  await fs.writeFile(path.join(directory,'baseline-real.html'),benchmarks.renderHtml(baseline));
  const result={capturedAt:new Date().toISOString(),gameClosed:true,fpsLimit,memory,referenceVerification:{changed:check.comparison.changed,stability:check.stability},amd:{cpu:amd.cpu,board:amd.board,bios:amd.bios,ryzenMaster:amd.ryzenMaster,drivers:amd.drivers,canApply:amd.canApply,currentPbo:amd.currentPbo,currentCurveOptimizer:amd.currentCurveOptimizer},baseline:{id:baseline.id,averageFps:baseline.averageFps,onePercentLow:baseline.onePercentLow,durationSeconds:baseline.durationSeconds,sourceSHA256:baseline.sourceSHA256,stability:baseline.context.stability},firmwareWritesPerformed:false,fpsGainMeasured:false};
  await fs.writeFile(path.join(directory,'hardware-memory-ready.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,gameClosed:true,fpsLimit:fpsLimit.current,memoryGB:memory.totalGB,configuredClocksMHz:memory.configuredClocksMHz,baseline:result.baseline,ryzenMaster:amd.ryzenMaster,referenceChanged:check.comparison.changed,firmwareWritesPerformed:false},null,2));
}finally{auth.dispose();}
