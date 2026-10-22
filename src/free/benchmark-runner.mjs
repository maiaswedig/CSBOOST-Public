import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseBenchmarkLog} from './benchmarks.mjs';
import {parseLibraryPaths} from './system.mjs';
import {validateProcessPolicy} from './process-tuning.mjs';

export const BENCHMARK_MAP = Object.freeze({
  workshopId:'3240880604', mapName:'de_dust2', durationSeconds:120,
  workshopUrl:'https://steamcommunity.com/sharedfiles/filedetails/?id=3240880604',
  configName:'csboost-benchmark.cfg',
});
const CONFIG_TEXT=`// CSBOOST: mapa de benchmark; removido/restaurado ao concluir.\nmap_workshop ${BENCHMARK_MAP.workshopId} ${BENCHMARK_MAP.mapName}\n`;
const ARGS=Object.freeze(['-novid','-condebug','+fps_max','0','+exec',BENCHMARK_MAP.configName]);
const ACTIVE=new Set(['preparing','waiting-for-game','loading-map','in-map','measuring','saving','cleaning','waiting-for-game-close','recovery-required']);
const RUN_ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const MAX_CAPTURE=16*1024*1024;
const normal=p=>process.platform==='win32'?path.normalize(p).toLowerCase():path.normalize(p);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const failure=(code,message)=>Object.assign(new Error(message),{code});

async function regularFile(target,maxSize=MAX_CAPTURE){
  const stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxSize)throw failure('BENCHMARK_FILE_INVALID','O benchmark precisa usar arquivos regulares dentro das pastas verificadas.');
  return stat;
}
async function verifiedGamePaths(installation){
  if(!installation?.cs2Installed||typeof installation.gamePath!=='string'||typeof installation.cfgPath!=='string'||!path.isAbsolute(installation.gamePath)||!path.isAbsolute(installation.cfgPath))throw failure('BENCHMARK_GAME_MISSING','Instale o CS2 pela Steam antes do benchmark.');
  const gamePath=await fs.realpath(installation.gamePath);
  const expected=path.join(gamePath,'game','csgo','cfg');
  const cfgStat=await fs.lstat(installation.cfgPath);
  if(!cfgStat.isDirectory()||cfgStat.isSymbolicLink()||normal(await fs.realpath(installation.cfgPath))!==normal(expected))throw failure('BENCHMARK_CFG_INVALID','A pasta cfg não corresponde à instalação verificada do CS2.');
  return {gamePath,cfgPath:expected,logPath:path.join(gamePath,'game','csgo','console.log')};
}
async function containsVpk(directory,depth=0,budget={remaining:500}){
  const stat=await fs.lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink())return false;
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(--budget.remaining<0)return false;
    const target=path.join(directory,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isFile()&&/\.vpk$/i.test(entry.name)&&(await regularFile(target,Infinity)).size>0)return true;
    if(entry.isDirectory()&&depth<3&&await containsVpk(target,depth+1,budget))return true;
  }
  return false;
}

export async function inspectBenchmarkInstallation(installation){
  const game=await verifiedGamePaths(installation);
  const roots=[path.dirname(path.dirname(path.dirname(game.gamePath)))];
  if(typeof installation.steamPath==='string'&&path.isAbsolute(installation.steamPath)){
    roots.push(installation.steamPath);
    try{roots.push(...parseLibraryPaths(await fs.readFile(path.join(installation.steamPath,'steamapps','libraryfolders.vdf'),'utf8')).filter(path.isAbsolute));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const root of [...new Set(roots.map(p=>normal(path.resolve(p))))]){
    const directory=path.join(root,'steamapps','workshop','content','730',BENCHMARK_MAP.workshopId);
    try{
      if(await containsVpk(directory))return {...game,map:{...BENCHMARK_MAP,installed:true,directory,verification:'local-vpk-presence'}};
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  return {...game,map:{...BENCHMARK_MAP,installed:false,directory:null,verification:'no-local-vpk-found'}};
}

function timestamp(line){
  const match=line.match(/^(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if(!match)return null;
  const [,month,day,hour,minute,second]=match.map(Number);
  if(month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
  return Date.UTC(2000,month-1,day,hour,minute,second)/1000;
}
function elapsed(start,end){if(start===null||end===null)return null;const seconds=end-start;return seconds>=0?seconds:seconds+31622400;}

/** Observes real map/VProf lines. A wall-clock timer never produces FPS. */
export function createBenchmarkProtocol({minimumDurationSeconds=90}={}){
  let mapName=null,addonId=null,mapSignal=false,mapReady=false,inGame=false,vprofStarted=false,startedAt=null,summary=null,report=null,error=null;
  function resetMap(){mapReady=false;inGame=false;vprofStarted=false;startedAt=null;summary=null;report=null;error=null;}
  function consume(line){
    if(report||error)return;
    let match=line.match(/Loading map "([^"]+)"(?:\s+\(addon '(\d+)'\))?/);
    if(match){resetMap();mapSignal=true;mapName=match[1];addonId=match[2]??null;return;}
    match=line.match(/Mounting addon '(\d+)'/);
    if(match){addonId=match[1];mapSignal=true;return;}
    match=line.match(/execing maps\/([a-z0-9_]+)\.cfg/i);
    if(match){if(match[1].toLowerCase()==='fpsheavenbenchmark')mapReady=true;else{mapName=match[1];mapSignal=true;}return;}
    if(/Created physics for benchmark_mainmap/.test(line)){mapReady=true;return;}
    if(/ChangeGameUIState: \S+ -> CSGO_GAME_UI_STATE_INGAME/.test(line)){inGame=true;return;}
    if(/\[VProf\]\s+VProfLite started\./.test(line)){vprofStarted=true;startedAt=timestamp(line);summary=null;report=null;return;}
    match=line.match(/\[VProf\]\s+Summary of (\d+) frames and (\d+) 1-second intervals/);
    if(match){summary={frames:Number(match[1]),durationSeconds:Number(match[2])};return;}
    if(/\[VProf\]\s*FPS:\s*Avg=/.test(line)){
      if(!mapSignal||mapName!==BENCHMARK_MAP.mapName||addonId!==BENCHMARK_MAP.workshopId||!mapReady||!vprofStarted){error='BENCHMARK_UNVERIFIED_REPORT';return;}
      try{
        const result=parseBenchmarkLog(line);
        const duration=elapsed(startedAt,timestamp(line))??summary?.durationSeconds;
        if(!Number.isFinite(duration)||duration<minimumDurationSeconds||summary&&(!Number.isSafeInteger(summary.frames)||summary.frames<=0||summary.durationSeconds<minimumDurationSeconds)){error='BENCHMARK_INCOMPLETE';return;}
        report={...result,frames:summary?.frames??null,durationSeconds:summary?.durationSeconds??duration,elapsedSeconds:duration};
      }catch{error='BENCHMARK_REPORT_INVALID';}
    }
  }
  function snapshot(){
    if(error)return {status:'invalid',reason:error};
    if(mapSignal&&((mapName!==null&&mapName!==BENCHMARK_MAP.mapName)||(addonId!==null&&addonId!==BENCHMARK_MAP.workshopId)))return {status:'invalid',reason:'BENCHMARK_WRONG_MAP'};
    if(report)return {status:'valid',result:clone(report)};
    const phase=vprofStarted&&mapReady?'measuring':mapReady&&inGame?'in-map':mapSignal?'loading-map':'launching';
    return {status:'pending',phase,mapVerified:mapName===BENCHMARK_MAP.mapName&&addonId===BENCHMARK_MAP.workshopId};
  }
  return {consume,snapshot,hasStarted:()=>vprofStarted,finalize(){const state=snapshot();if(state.status!=='pending')return state;return {status:'invalid',reason:!mapSignal?'BENCHMARK_MAP_NOT_LOADED':!mapReady?'BENCHMARK_WRONG_MAP':!vprofStarted?'BENCHMARK_NOT_STARTED':'BENCHMARK_NO_REPORT'};}};
}

const REASONS={
  BENCHMARK_WRONG_MAP:'O log não identifica o mapa Workshop esperado. Abra CS2 FPS BENCHMARK DUST2 na Oficina.',
  BENCHMARK_UNVERIFIED_REPORT:'O log contém FPS sem confirmar mapa, início VProf e protocolo do benchmark. Nenhum resultado foi salvo.',
  BENCHMARK_INCOMPLETE:'A medição do mapa terminou antes de 90 segundos ou não informa sua duração. Repita o benchmark completo.',
  BENCHMARK_REPORT_INVALID:'O relatório VProf não contém valores de FPS válidos.',
  BENCHMARK_MAP_NOT_LOADED:'O mapa de benchmark não foi observado no novo log. Confirme a instalação e abra o mapa no CS2.',
  BENCHMARK_NOT_STARTED:'O mapa abriu, mas a medição VProf não começou. Inicie o teste dentro do mapa.',
  BENCHMARK_NO_REPORT:'O CS2 não forneceu um relatório VProf completo nesta execução.',
  BENCHMARK_GAME_NOT_STARTED:'O CS2 não foi detectado após a solicitação à Steam.',
  BENCHMARK_TIMEOUT:'O tempo limite foi atingido sem relatório real. Nenhum FPS foi estimado.',
  BENCHMARK_LATE_PREPARATION:'A medição VProf começou antes da preparação dos processos. Nenhum ajuste tardio foi aplicado; repita o teste.',
  BENCHMARK_FOCUS_LOST:'O CS2 perdeu o foco durante a medição. Repita o teste mantendo o jogo em primeiro plano.',
};

/** All native changes belong to injected adapters; launch is never inferred from a timer. */
export function createBenchmarkRunner({
  directory,resolveInstallation,isGameRunning,launch,prepare,onGameStart,cleanup=async()=>{},saveResult,
  onProgress=()=>{},isGameFocused,fpsCap,frameCapture,now=()=>Date.now(),pollMs=1000,startTimeoutMs=90000,
  runTimeoutMs=360000,setIntervalImpl=setInterval,clearIntervalImpl=clearInterval,
}){
  if(!path.isAbsolute(directory)||typeof resolveInstallation!=='function'||typeof isGameRunning!=='function'||typeof launch!=='function')throw new Error('Dependências do benchmark inválidas.');
  const journal=path.join(directory,'active-benchmark.json');
  let state=null,timer=null,working=false,starting=false,controller=null,protocol=null,finishing=null;
  let runInstallation=null,lastInspection=null;
  let reader=null,captured=[],capturedSize=0,cancelRequested=false,immediateRecovery=false;
  const snapshot=()=>clone(state);
  const active=()=>state&&ACTIVE.has(state.status);
  const emit=()=>{try{onProgress(snapshot());}catch{}};
  async function save(){await fs.mkdir(directory,{recursive:true});const temporary=journal+'.tmp';await fs.writeFile(temporary,JSON.stringify(state,null,2),{mode:0o600});await fs.rename(temporary,journal);emit();}
  function stopTimer(){if(timer)clearIntervalImpl(timer);timer=null;}
  function startTimer(){if(!timer){timer=setIntervalImpl(()=>{poll().catch(()=>{});},pollMs);timer?.unref?.();}}
  function checkCancellation(){if(cancelRequested)throw failure('BENCHMARK_CANCELLED','Benchmark cancelado. Feche o CS2 quando desejar; nenhum resultado foi criado.');}
  function frameClassificationContext(){
    const previous=Number(state?.fpsLimit?.previous);
    return {fpsCap:Number.isFinite(previous)&&previous>=0&&previous<=100000?{persistedValue:previous,effective:false,source:'saved-config-before-benchmark'}:{}};
  }
  async function inspect({refresh=false}={}){
    // A study/UI refresh must not launch installation or FPS inventory during a run.
    // Start and recovery validate independently; this is only the active-run view.
    if(active()&&runInstallation)return {...clone(runInstallation),fpsLimit:clone(state.fpsLimit??runInstallation.fpsLimit)};
    if(!refresh&&lastInspection)return clone(lastInspection);
    if(await isGameRunning())throw failure('BENCHMARK_GAME_RUNNING','Feche o CS2 para atualizar a instalação do benchmark.');
    const installation=await inspectBenchmarkInstallation(await resolveInstallation());
    if(fpsCap?.inspect)try{const limit=await fpsCap.inspect();installation.fpsLimit={supported:true,canCapture:!limit.pending,...limit};}catch(error){installation.fpsLimit={supported:false,available:false,canCapture:false,reason:error.message};}
    lastInspection=clone(installation);return installation;
  }

  async function installConfig(){
    const target=path.join(state.cfgPath,BENCHMARK_MAP.configName);
    let previous=null;
    try{await regularFile(target,65536);previous=(await fs.readFile(target)).toString('base64');}catch(error){if(error.code!=='ENOENT')throw error;}
    state.config={target,previous,expectedSHA256:crypto.createHash('sha256').update(CONFIG_TEXT).digest('hex'),installed:false};
    await save();
    const temporary=path.join(state.cfgPath,'.csboost-benchmark-'+state.id+'.tmp');
    await fs.writeFile(temporary,CONFIG_TEXT,{flag:'wx',mode:0o600});
    try{await fs.rename(temporary,target);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
    state.config.installed=true;await save();
  }
  async function restoreConfig(){
    if(!state.config)return;
    const expected=path.join(state.cfgPath,BENCHMARK_MAP.configName);
    if(normal(state.config.target)!==normal(expected)||state.config.expectedSHA256!==crypto.createHash('sha256').update(CONFIG_TEXT).digest('hex'))throw new Error('Registro de configuração do benchmark inválido.');
    const currentInstallation=await verifiedGamePaths(runInstallation??await resolveInstallation());
    if(normal(currentInstallation.gamePath)!==normal(state.gamePath)||normal(currentInstallation.cfgPath)!==normal(state.cfgPath))throw new Error('A instalação do CS2 mudou; confira o registro de restauração antes de substituir arquivos.');
    let current;
    try{await regularFile(expected,65536);current=await fs.readFile(expected);}catch(error){if(error.code==='ENOENT'){if(state.config.previous!==null&&state.config.installed)throw new Error('O arquivo de benchmark foi removido externamente; a cópia anterior foi preservada no registro de recuperação.');return;}throw error;}
    const hash=crypto.createHash('sha256').update(current).digest('hex');
    if(state.config.previous!==null&&(typeof state.config.previous!=='string'||state.config.previous.length>88000))throw new Error('Backup de configuração inválido.');
    const previous=state.config.previous===null?null:Buffer.from(state.config.previous,'base64');
    if(previous&&current.equals(previous))return;
    if(hash!==state.config.expectedSHA256){if(!state.config.installed)return;throw new Error('O arquivo de benchmark foi alterado externamente; restauração pendente para evitar sobrescrever suas alterações.');}
    if(previous!==null){const temporary=expected+'.restore-'+state.id;await fs.writeFile(temporary,previous,{flag:'wx',mode:0o600});try{await fs.rename(temporary,expected);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}}
    else await fs.unlink(expected);
  }
  async function performFinish(status,error=null){
    const outcome=state.pendingStatus==='completed'?'completed':status;
    const outcomeError=outcome==='completed'?null:error;
    stopTimer();state.status='cleaning';await save();const errors=[];
    if(state.frameCapturePrepared&&!state.frameCaptureCleaned){try{if(!frameCapture)throw Error('Coletor indisponível; finalize a recuperação da captura antes de restaurar.');state.frametimes=await frameCapture.stop({id:state.id,reason:outcome,context:frameClassificationContext()});state.frameCaptureCleaned=true;}catch(problem){state.status='recovery-required';state.cleanupError=problem.message;state.pendingStatus=outcome;await save();return snapshot();}}
    if(state.preparationAttempted&&!state.adapterCleaned){try{await cleanup({type:state.type,preset:state.preset,id:state.id,reason:outcome,observedGame:state.observedGame,processPolicy:clone(state.processPolicy),prepared:clone(state.preparation),processPreparation:clone(state.processPreparation)});state.adapterCleaned=true;}catch(problem){errors.push(problem.message);}}
    if(!state.configRestored)try{await restoreConfig();state.configRestored=true;}catch(problem){errors.push(problem.message);}
    if(state.fpsCapCaptureAttempted&&!state.fpsCapRestored&&fpsCap?.restore){
      try{state.fpsCapRestoration=await fpsCap.restore({id:state.id});state.fpsCapRestored=!state.fpsCapRestoration?.pending;}catch(problem){errors.push(problem.message);}
    }else if(state.fpsCapCaptureAttempted&&!state.fpsCapRestored)errors.push('O adaptador de restauração do limite de FPS está indisponível; o backup foi preservado.');
    state.error=outcomeError?{code:outcomeError.code||'BENCHMARK_FAILED',message:outcomeError.message}:null;
    if(errors.length){state.status='recovery-required';state.cleanupError=errors.join(' ');state.pendingStatus=outcome;await save();return snapshot();}
    if(state.fpsCapRestoration?.pending){
      state.status=immediateRecovery?'recovery-required':'waiting-for-game-close';state.pendingStatus=outcome;
      state.cleanupError=immediateRecovery?'Feche o CS2 e reabra o CSBOOST para concluir a restauração do limite de FPS.':null;
      state.instructions=outcome==='completed'?'Resultado salvo. Feche o CS2 para restaurar seu limite de FPS e liberar a próxima medição.':'Ajustes temporários restaurados. Feche o CS2 para restaurar seu limite de FPS.';
      await save();if(!immediateRecovery)startTimer();return snapshot();
    }
    state.status=outcome;state.finishedAt=new Date(now()).toISOString();state.cleanupError=null;
    state.instructions=outcome==='completed'?'Resultado salvo e ajustes temporários restaurados. Você pode iniciar outra medição.':'Ajustes temporários restaurados.';
    if(outcome==='completed')state.progress=1;
    await save();
    await fs.unlink(journal).catch(problem=>{if(problem.code!=='ENOENT')throw problem;});emit();return snapshot();
  }
  function finish(status,error=null){
    if(finishing)return finishing;
    finishing=performFinish(status,error).finally(()=>{finishing=null;});return finishing;
  }

  async function anchor(file,position){
    const offset=Math.max(0,position-128),buffer=Buffer.alloc(position-offset);
    if(buffer.length)await file.read(buffer,0,buffer.length,offset);
    return buffer;
  }
  async function resetReader(stat,position=0){
    reader={position,initialPosition:position,identity:stat?`${stat.dev}:${stat.ino}`:null,anchor:Buffer.alloc(0),residual:Buffer.alloc(0),processedBytes:0,acceptedBytes:null,skipPartial:false};
    if(stat&&position){const file=await fs.open(state.logPath,'r');try{reader.anchor=await anchor(file,position);reader.skipPartial=reader.anchor.at(-1)!==10;}finally{await file.close();}}
    protocol=createBenchmarkProtocol();captured=[];capturedSize=0;
    state.logCapture={initialOffset:position,fromOffset:position,rotated:false};
  }
  async function readNewLog(){
    let stat;
    try{stat=await regularFile(state.logPath,Infinity);}catch(error){if(error.code==='ENOENT')return;throw error;}
    const file=await fs.open(state.logPath,'r');
    try{
      const identity=`${stat.dev}:${stat.ino}`;
      let reset=reader.identity!==null&&reader.identity!==identity||stat.size<reader.position;
      if(!reset&&reader.position&&reader.anchor.length&&stat.size>=reader.position)reset=!(await anchor(file,reader.position)).equals(reader.anchor);
      if(reset){const initialOffset=state.logCapture.initialOffset;await resetReader(stat);state.logCapture={initialOffset,fromOffset:0,rotated:true};state.warnings.push('console.log foi recriado/truncado; somente a nova geração será usada.');}
      reader.identity=identity;
      while(reader.position<stat.size){
        const length=Math.min(65536,stat.size-reader.position),buffer=Buffer.alloc(length);
        const {bytesRead}=await file.read(buffer,0,length,reader.position);if(!bytesRead)break;
        reader.position+=bytesRead;const bytes=buffer.subarray(0,bytesRead);
        capturedSize+=bytesRead;if(capturedSize>MAX_CAPTURE)throw failure('BENCHMARK_LOG_TOO_LARGE','O novo trecho de log excedeu 16 MB. Cancele e repita com uma sessão limpa.');
        captured.push(bytes);reader.residual=Buffer.concat([reader.residual,bytes]);
        let boundary;
        while((boundary=reader.residual.indexOf(10))!==-1){
          const line=reader.residual.subarray(0,boundary);reader.residual=reader.residual.subarray(boundary+1);reader.processedBytes+=boundary+1;
          if(reader.skipPartial){reader.skipPartial=false;continue;}
          protocol.consume(line.toString('utf8').replace(/\r$/,''));
          const observation=protocol.snapshot();
          if(observation.status==='valid'){reader.acceptedBytes=reader.processedBytes;return;}
          if(observation.status==='invalid')return;
        }
      }
      reader.anchor=await anchor(file,reader.position);
      state.logCapture.toOffset=reader.position;state.logCapture.bytes=capturedSize;
    }finally{await file.close();}
  }
  async function complete(result){
    checkCancellation();
    state.status='saving';await save();
    if(state.frameCapturePrepared&&!state.frameCaptureCleaned){state.frametimes=await frameCapture.stop({id:state.id,reason:'completed',context:frameClassificationContext()});state.frameCaptureCleaned=true;await save();}
    const capturePath=path.join(directory,state.id+'.log');
    const capture=Buffer.concat(captured).subarray(0,reader.acceptedBytes??capturedSize);
    state.logCapture.bytes=capture.length;state.logCapture.toOffset=state.logCapture.fromOffset+capture.length;
    await fs.writeFile(capturePath,capture,{flag:'wx',mode:0o600});
    const metadata={id:state.id,runType:state.type,preset:state.preset,tuningNote:state.tuningNote??'',fpsLimit:clone(state.fpsLimit),processPolicy:clone(state.processPolicy),map:{workshopId:BENCHMARK_MAP.workshopId,name:BENCHMARK_MAP.mapName},startedAt:state.startedAt,capturedAt:new Date(now()).toISOString(),source:'observed-cs2-console',logCapture:clone(state.logCapture),preparation:clone(state.preparation),frametimes:clone(state.frametimes??state.frameCapture??{status:'unavailable',reason:'Coleta detalhada não realizada.'})};
    state.result={...result,runType:state.type,preset:state.preset,sourceSHA256:crypto.createHash('sha256').update(capture).digest('hex'),sourceName:path.basename(capturePath),metadata};
    if(saveResult)state.savedResult=await saveResult({id:state.id,logPath:capturePath,metadata,result:clone(state.result)});
    await fs.writeFile(path.join(directory,state.id+'.json'),JSON.stringify({metadata,result:state.result,savedResult:state.savedResult??null},null,2),{flag:'wx',mode:0o600});
    return finish('completed');
  }
  async function poll(){
    if(working||starting||!active()||state.status==='recovery-required')return snapshot();
    working=true;
    try{
      if(state.status==='waiting-for-game-close'){
        if(await isGameRunning())return snapshot();
        return await finish(state.pendingStatus||'cancelled',state.error?failure(state.error.code,state.error.message):null);
      }
      checkCancellation();await readNewLog();
      const running=await isGameRunning();
      if(running&&!state.observedGame){const policy=state.processPolicy;if(onGameStart&&state.type==='boosted'&&(policy.prioritizeGame||policy.cpuDistribution||policy.backgroundApps.length||policy.backgroundMemoryPriorityApps?.length)&&(protocol.hasStarted()||/\[VProf\]\s+VProfLite started\./.test(reader.residual.toString('utf8'))))throw failure('BENCHMARK_LATE_PREPARATION',REASONS.BENCHMARK_LATE_PREPARATION);state.observedGame=true;state.observedAt=new Date(now()).toISOString();await save();if(onGameStart)state.processPreparation=await onGameStart({type:state.type,preset:state.preset,id:state.id,processPolicy:clone(state.processPolicy),prepared:clone(state.preparation),signal:controller.signal});await save();}
      checkCancellation();
      const observation=protocol.snapshot();
      if(observation.status==='invalid')throw failure(observation.reason,REASONS[observation.reason]||'O log não confirmou um benchmark válido.');
      if(state.observedGame&&isGameFocused&&(observation.status==='valid'||['in-map','measuring'].includes(observation.phase))&&running&&!await isGameFocused())throw failure('BENCHMARK_FOCUS_LOST',REASONS.BENCHMARK_FOCUS_LOST);
      if(observation.phase==='measuring'&&running&&state.frameCapturePrepared&&!state.frameCaptureStartAttempted){state.frameCaptureStartAttempted=true;await save();try{state.frameCapture=await frameCapture.start({id:state.id});}catch(error){state.frameCapture={status:'unavailable',reason:error.message};state.warnings.push('Coleta detalhada indisponível; VProf continua sendo a fonte do resultado.');}await save();}
      if(observation.status==='valid'){
        if(!state.observedGame)throw failure('BENCHMARK_GAME_NOT_STARTED','O relatório chegou sem observar o processo do CS2. Repita o teste para validar sua execução.');
        return await complete(observation.result);
      }
      if(!running&&state.observedGame){
        if(reader.residual.length&&!reader.skipPartial){protocol.consume(reader.residual.toString('utf8').replace(/\r$/,''));reader.acceptedBytes=reader.processedBytes+reader.residual.length;reader.residual=Buffer.alloc(0);const final=protocol.finalize();if(final.status==='valid')return await complete(final.result);if(final.status==='invalid')throw failure(final.reason,REASONS[final.reason]||'O benchmark terminou sem resultado.');}
        const final=protocol.finalize();throw failure(final.reason,REASONS[final.reason]||'O benchmark terminou sem resultado.');
      }
      if(!state.observedGame&&now()-state.startedMs>startTimeoutMs)throw failure('BENCHMARK_GAME_NOT_STARTED',REASONS.BENCHMARK_GAME_NOT_STARTED);
      if(now()-state.startedMs>runTimeoutMs)throw failure('BENCHMARK_TIMEOUT',REASONS.BENCHMARK_TIMEOUT);
      state.status=!state.observedGame?'waiting-for-game':observation.phase==='launching'?'loading-map':observation.phase;
      state.phase=observation.phase;state.mapVerified=observation.mapVerified;
      if(state.status==='measuring')state.measurementStartedMs??=now();
      state.elapsedSeconds=state.measurementStartedMs===undefined?0:Math.max(0,(now()-state.measurementStartedMs)/1000);
      state.progress=state.status==='measuring'?Math.min(0.95,state.elapsedSeconds/BENCHMARK_MAP.durationSeconds):null;
      await save();return snapshot();
    }catch(error){return await finish(error.code==='BENCHMARK_CANCELLED'?'cancelled':'failed',error);}finally{working=false;}
  }
  async function start({type,preset='balanced',processPolicy,tuningNote=''}={}){
    if(!['baseline','boosted'].includes(type)||!['balanced','performance','competitive'].includes(preset))throw new Error('Tipo/preset de benchmark inválido.');
    const policy=validateProcessPolicy(processPolicy);
    if(typeof tuningNote!=='string'||tuningNote.length>300||/[\x00-\x1f\x7f]/.test(tuningNote))throw new Error('Anotação de ajuste inválida; use até 300 caracteres sem quebras de linha.');
    tuningNote=tuningNote.trim();
    if(active()||starting||working)throw new Error('Já existe um benchmark ativo ou restauração pendente.');
    if(type==='boosted'&&typeof prepare!=='function')throw new Error('O benchmark otimizado precisa de um adaptador real de otimização.');
    starting=true;cancelRequested=false;controller=new AbortController();
    try{
      if(await isGameRunning())throw failure('BENCHMARK_GAME_RUNNING','Feche o CS2 antes de iniciar uma nova medição.');
      runInstallation=null;const installation=await inspect({refresh:true});runInstallation={...installation,cs2Installed:true};
      if(!installation.map.installed)throw failure('BENCHMARK_MAP_MISSING','Inscreva-se no mapa CS2 FPS BENCHMARK DUST2 e aguarde o download pela Steam.');
      state={id:crypto.randomUUID(),type,preset,tuningNote,processPolicy:policy,status:'preparing',startedAt:new Date(now()).toISOString(),startedMs:now(),gamePath:installation.gamePath,cfgPath:installation.cfgPath,logPath:installation.logPath,map:installation.map,observedGame:false,preparationAttempted:false,adapterCleaned:false,warnings:['O mapa/comportamento atual precisa ser confirmado no jogo. Se necessário, inicie o teste dentro do mapa.','Baseline mede os ajustes atuais do PC; não restaura automaticamente alterações feitas fora deste fluxo.',fpsCap?'O benchmark solicita fps_max 0; o limite persistido será restaurado após fechar o CS2. Autoexec e comandos dentro do jogo podem definir outro limite.':'O benchmark solicita fps_max 0 (FPS sem limite). O CS2 pode persistir esse valor; restaure seu limite pelo perfil/configuração após medir.'],instructions:'Mantenha o CS2 em primeiro plano. Se o mapa não abrir, selecione CS2 FPS BENCHMARK DUST2 na Oficina e inicie a medição. Aguarde o relatório VProf completo.'};
      await save();
      if(fpsCap?.capture){state.fpsCapCaptureAttempted=true;await save();state.fpsLimit=await fpsCap.capture({id:state.id});await save();checkCancellation();}
      if(frameCapture){state.frameCapture=await frameCapture.prepare({id:state.id});state.frameCapturePrepared=state.frameCapture.status==='prepared';await save();checkCancellation();}
      let stat=null;try{stat=await regularFile(state.logPath,Infinity);}catch(error){if(error.code!=='ENOENT')throw error;}
      await resetReader(stat,stat?.size??0);await installConfig();checkCancellation();
      state.preparationAttempted=true;await save();
      checkCancellation();
      if(prepare){state.preparation=await prepare({type,preset,id:state.id,tuningNote,processPolicy:clone(policy),signal:controller.signal});await save();}
      checkCancellation();state.status='waiting-for-game';await save();
      await launch({type,preset,id:state.id,args:[...ARGS],signal:controller.signal});
      checkCancellation();state.launchRequested=true;await save();
      startTimer();return snapshot();
    }catch(error){
      if(state&&active())await finish(error.code==='BENCHMARK_CANCELLED'?'cancelled':'failed',error);
      throw error;
    }finally{starting=false;}
  }
  async function cancel(){
    if(!active()||state.status==='saving'||state.status==='cleaning')return snapshot();cancelRequested=true;controller?.abort();
    if(starting||working)return snapshot();return finish('cancelled',failure('BENCHMARK_CANCELLED','Benchmark cancelado. Feche o CS2 quando desejar; nenhum FPS foi estimado.'));
  }
  async function recover({restoreImmediately=false}={}){
    if(starting||working||finishing)throw new Error('Aguarde a atualização do benchmark.');
    if(active())return snapshot();
    let retained;
    try{await regularFile(journal,256*1024);retained=JSON.parse(await fs.readFile(journal,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
    if(!retained||!RUN_ID.test(retained.id)||!['baseline','boosted'].includes(retained.type)||!['balanced','performance','competitive'].includes(retained.preset))throw new Error('Registro de recuperação do benchmark inválido.');
    runInstallation=null;
    state={...retained,processPolicy:validateProcessPolicy(retained.processPolicy)};
    if(!restoreImmediately&&await isGameRunning()&&!state.fpsCapCaptureAttempted){state.status='recovery-required';state.cleanupError='Há uma sessão de benchmark interrompida. Feche o CS2 e use cancelar/restaurar antes de iniciar outra.';emit();return snapshot();}
    immediateRecovery=restoreImmediately;
    try{return await finish(state.pendingStatus||'cancelled',state.error?failure(state.error.code,state.error.message):failure('BENCHMARK_INTERRUPTED','A sessão anterior foi interrompida; a recuperação preserva os resultados já salvos.'));}finally{immediateRecovery=false;}
  }
  function dispose(){stopTimer();controller?.abort();if(frameCapture?.isActive())frameCapture.stop({reason:'app-close'}).catch(()=>{});}
  return {inspect,start,poll,cancel,recover,dispose,getState:async()=>snapshot(),isActive:()=>Boolean(active())};
}
