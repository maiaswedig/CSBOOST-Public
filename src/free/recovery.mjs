import fs from 'node:fs/promises';
import path from 'node:path';

// Called only after the owning main process has exited and under its OS mutex.
// Persistent graphics/Windows/NVIDIA choices deliberately have no crash undo.
export async function recoverTemporaryState({directory,sessions,benchmarkRunner,benchmarkAdapter,processTuning,cpuAffinity,frameCapture,now=()=>new Date().toISOString()}){
  const report={version:1,reason:'application-exited',startedAt:now(),ok:false,steps:[],errors:[]};
  for(const [name,operation]of [
    ...(frameCapture?[['frame-capture',()=>frameCapture.recover()]]:[]),
    ...(cpuAffinity?[['cpu-affinity',()=>cpuAffinity.restore()]]:[]),
    ...(processTuning?[['process-priority',()=>processTuning.restore()]]:[]),
    ['benchmark',()=>benchmarkRunner.recover({restoreImmediately:true})],
    ['benchmark-tuning',()=>benchmarkAdapter.recover()],
    ['game-session',()=>sessions.recover({restoreImmediately:true})],
  ]){
    try{const state=await operation();if(state?.status==='recovery-required')throw new Error(state.cleanupError||state.error||'Restauração pendente.');report.steps.push({name,ok:true});}
    catch(error){report.steps.push({name,ok:false});report.errors.push({name,message:error.message});}
  }
  sessions.dispose();benchmarkRunner.dispose();report.ok=report.errors.length===0;report.finishedAt=now();
  const file=path.join(directory,'crash-recovery.json'),temporary=file+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(report,null,2),{mode:0o600});await fs.rename(temporary,file);
  return report;
}
