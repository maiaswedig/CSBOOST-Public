// Real, explicitly requested validation with the packaged CSBOOST modules.
// Isolated recovery journals avoid sharing in-memory state with the open GUI.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const app=path.join(path.dirname(process.execPath),'resources','app');
const load=name=>import(pathToFileURL(path.join(app,name)).href);
const type=process.argv[2];
if(!['baseline','boosted','recover'].includes(type))throw new Error('Use baseline, boosted ou recover. Nenhum ajuste PBO/CO é aplicado por este comando.');
const data=path.join(process.env.APPDATA,'csboost-free'),live=path.join(data,'live-benchmark');
const reportPath=path.join(process.cwd(),'analysis','free-verification','live-benchmark.json');
const [{createSystem},{createSteamAuth},{createBenchmarks},{createBenchmarkRunner},{createBenchmarkAdapter},{createBenchmarkFpsCap},{createBenchmarkContext},{createOptimizations},{createProcessTuning},{createCpuAffinity},{createNvidia},{createAmdTuning},{startRecoveryGuard}]=await Promise.all(['system.mjs','steam-auth.mjs','benchmarks.mjs','benchmark-runner.mjs','benchmark-adapter.mjs','benchmark-fps-cap.mjs','benchmark-context.mjs','optimizations.mjs','process-tuning.mjs','cpu-affinity.mjs','nvidia.mjs','amd-tuning.mjs','recovery-guard.mjs'].map(load));
let guard,runner,auth,requestedCancel=false,lastStatus=null,reportedResult=false;
const keepAlive=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function publish(state){
  const report={realExecution:true,type,status:state?.status||'preflight',updatedAt:new Date().toISOString(),id:state?.id||null,result:state?.result||null,savedResult:state?.savedResult||null,error:state?.error||null,cleanupError:state?.cleanupError||null,instructions:state?.instructions||null,fpsCapRestoration:state?.fpsCapRestoration||null,recoveryDirectory:live};
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  if(lastStatus!==report.status){lastStatus=report.status;console.log(JSON.stringify({status:report.status,instructions:report.instructions,error:report.error,cleanupError:report.cleanupError}));}
  if(report.result&&!reportedResult){reportedResult=true;console.log(JSON.stringify({realResult:{averageFps:report.result.averageFps,onePercentLow:report.result.onePercentLow,durationSeconds:report.result.durationSeconds},savedToHistory:!!report.savedResult}));}
}
process.on('SIGINT',()=>{requestedCancel=true;});
process.on('SIGTERM',()=>{requestedCancel=true;});
try{
  await fs.mkdir(live,{recursive:true});const stat=await fs.lstat(live);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Diretório de recuperação inválido.');
  guard=await startRecoveryGuard({directory:live,workerPath:path.join(app,'native','csboost-recovery.exe')});
  auth=createSteamAuth({sessionPath:path.join(data,'steam-session.json'),openExternal:async()=>{throw Error('Entre com a Steam pela interface do CSBOOST.');}});
  if(!await auth.getSession())throw Error('Entre com a Steam no CSBOOST antes da medição.');
  const system=createSystem({dataDirectory:live}),getSteamId=async()=>(await auth.getSession())?.steamId;
  const processTuning=createProcessTuning({directory:path.join(live,'process-backups'),system});
  const cpuAffinity=createCpuAffinity({directory:path.join(live,'affinity-backups'),system,workerPath:path.join(app,'native','csboost-cpu.exe')});
  const nvidia=createNvidia({dataDirectory:path.join(live,'nvidia-backups'),workerPath:path.join(app,'native','csboost-nvidia.exe'),isGameRunning:()=>system.isGameRunning()});
  const amdTuning=createAmdTuning();
  const optimizations=createOptimizations({directory:path.join(live,'video-backups'),system});
  const benchmarks=createBenchmarks(path.join(data,'benchmarks'));
  const adapter=createBenchmarkAdapter({directory:path.join(live,'benchmark-runs'),system,processTuning,cpuAffinity});
  const fpsCap=createBenchmarkFpsCap({directory:path.join(live,'benchmark-runs'),system,getSteamId});
  const context=createBenchmarkContext({directory:path.join(live,'benchmark-context'),system,amdTuning,optimizations,nvidia,getSteamId});
  runner=createBenchmarkRunner({directory:path.join(live,'benchmark-runs'),resolveInstallation:()=>system.refreshSteam(),isGameRunning:()=>system.isGameRunning(),isGameFocused:()=>cpuAffinity.isGameFocused(),fpsCap,
    launch:()=>system.launchCS2({withConfig:false,benchmarkRun:true}),
    prepare:async request=>{await context.begin(request);return adapter.prepare(request);},onGameStart:adapter.onGameStart,cleanup:adapter.cleanup,
    saveResult:async({logPath,id})=>benchmarks.importFile(logPath,{context:await context.complete(id)}),pollMs:1000});
  await runner.recover();
  if(type!=='recover'){
    if(runner.isActive())throw Error('Existe uma medição anterior aguardando recuperação; feche CS2 e execute novamente.');
    await adapter.recover();
    const installation=await runner.inspect();if(!installation.map.installed)throw Error('O mapa Workshop ainda não foi baixado.');if(!installation.fpsLimit?.available)throw Error(installation.fpsLimit?.reason||'Limite de FPS indisponível.');
    const started=await runner.start({type,preset:'balanced',processPolicy:{prioritizeGame:false,backgroundApps:[]},tuningNote:type==='baseline'?'Referência com ajustes atuais; PBO/CO não alterado pelo CSBOOST.':'Após ajuste externo de PBO/CO; energia e prioridades atuais preservadas.'});
    await publish(started);
  }
  const deadline=Date.now()+15*60*1000;
  while(runner.isActive()){
    if(requestedCancel)await runner.cancel();
    const state=await runner.getState();await publish(state);
    if(state.status==='recovery-required')throw Error(state.cleanupError||'Recuperação requer atenção.');
    if(Date.now()>deadline)throw Error('Feche o CS2 para concluir a restauração pendente.');
    await keepAlive(1000);
  }
  const final=await runner.getState();await publish(final);runner.dispose();auth.dispose();guard.disarm();guard=null;
  process.exitCode=type==='recover'||final?.status==='completed'?0:2;
}catch(error){
  try{if(runner){await runner.cancel();await publish(await runner.getState());}}catch{}
  console.error(error.message);process.exitCode=1;
}finally{runner?.dispose();auth?.dispose();}
