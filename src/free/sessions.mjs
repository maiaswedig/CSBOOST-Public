import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateProcessPolicy} from './process-tuning.mjs';
import {HIGH_PERFORMANCE_PLAN,readPowerPolicy,powerReasonText} from './power-policy.mjs';

const SESSION_ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function createGameSessions({directory,system,isGameRunning,processTuning,cpuAffinity,cpuTopology,frameCapture,sessionSummaryStore,getPowerContext,onHistoryEvent=async()=>{},now=()=>Date.now(),pollMs=1500,policyRefreshMs=30000,startTimeoutMs=90000}){
  if(!Number.isFinite(policyRefreshMs)||policyRefreshMs<1000)throw new Error('Intervalo de políticas inválido.');
  async function readSessionContext(){for(const module of [processTuning,cpuAffinity])if(module?.readSessionContext)await module.readSessionContext({refresh:true});}
  const journal=path.join(directory,'game-session.json');
  const autoAttachFile=path.join(directory,'auto-attach-session.json');
  let state=null,timer=null,working=false,starting=false,topologySamplingActive=false,autoAttachEnabled=false,autoAttachStatus='disabled',autoAttachIgnoredUntilExit=false;
  let pendingSessionSummary=null;
  const seenGovernorEvents=new Set();
  async function emitHistory(event){try{await onHistoryEvent(event);}catch{}}
  async function captureGovernorEvents(report){
    for(const item of report?.events||[]){
      if(!item||typeof item.name!=='string'||typeof item.action!=='string'||!Number.isFinite(Date.parse(item.at)))continue;
      const key=[item.at,item.name,item.action].join('\0');if(seenGovernorEvents.has(key))continue;seenGovernorEvents.add(key);if(seenGovernorEvents.size>512)seenGovernorEvents.delete(seenGovernorEvents.values().next().value);
      if(item.action.startsWith('prioridade reduzida'))await emitHistory({kind:'record',moduleId:'process-governor',label:'Prioridade · '+item.name,previous:'Normal',applied:'BelowNormal',reason:'CPU elevada de forma sustentada durante a sessão. '+item.action,restoration:'pending',action:'applied',at:item.at,dedupeKey:'governor:'+key});
      else if(item.action==='restaurado')await emitHistory({kind:'resolve',moduleId:'process-governor',labels:['Prioridade · '+item.name],status:'restored',reason:'Prioridade original restaurada pelo governador.',at:item.at});
      else if(item.name==='CPU automática'&&(item.action.includes('Process Lasso')||item.action.includes('ProcessGovernor')||item.action.includes('retomou a análise'))){
        const paused=!item.action.includes('retomou a análise');await emitHistory({kind:'record',moduleId:'process-governor',label:'Regras automáticas',previous:paused?'Ativas':'Pausadas',applied:paused?'Pausadas':'Retomadas',reason:item.action,restoration:'not-applicable',action:'notice',at:item.at,dedupeKey:'governor:'+key});
      }
    }
  }
  const snapshot=()=>state?{preset:state.preset,provider:state.provider||'steam',status:state.status,startedAt:state.startedAt,observedGame:state.observedGame,processPolicy:state.processPolicy??null,error:state.error||null,processReport:state.processReport||null,powerReport:state.powerReport||null,powerPlan:state.powerPlan??'unknown',powerReason:state.powerReason??'unknown',powerPolicy:state.powerPolicy??null,affinityReport:state.affinityReport||null,frameCapture:state.frameCapture?{status:state.frameCapture.status,reason:state.frameCapture.reason||null,sampleLimitSeconds:360}:null,topologySampling:cpuTopology?.sessionSampling?.()??null}:null;
  async function startTopologySampling(){if(topologySamplingActive||typeof cpuTopology?.startSessionSampling!=='function')return;try{cpuTopology.startSessionSampling({intervalMs:Math.max(pollMs,10000)});topologySamplingActive=true;}catch{}}
  async function stopTopologySampling(){if(!topologySamplingActive)return;try{await cpuTopology?.stopSessionSampling?.();}catch{}finally{topologySamplingActive=false;}}
  async function save(){await fs.mkdir(directory,{recursive:true});const temporary=journal+'.tmp';await fs.writeFile(temporary,JSON.stringify(state,null,2));await fs.rename(temporary,journal);}
  async function prepareFrameCapture(){if(!state)return;const capture={id:state.id,status:'disabled',reason:'Coleta de frametimes detalhados desativada.'};if(frameCapture){try{const info=await frameCapture.status();if(info.enabled!==true){capture.status='disabled';capture.reason=info.reason||capture.reason;}else if(!info.canCapture){capture.status='unavailable';capture.reason=info.reason||'Permissão ou coletor indisponível.';}else{const result=await frameCapture.prepare({id:state.id});capture.status=result.status==='prepared'?'prepared':'unavailable';capture.reason=result.status==='prepared'?null:result.reason||'Não foi possível preparar a coleta.';}}catch(error){capture.status='unavailable';capture.reason=String(error?.message||error).slice(0,320);}}state.frameCapture=capture;await save();}
  async function startFrameCapture(){const capture=state?.frameCapture;if(!capture||capture.status!=='prepared'||!frameCapture)return;try{const result=await frameCapture.start({id:capture.id});capture.status=result.status==='capturing'?'capturing':'unavailable';capture.reason=result.status==='capturing'?null:result.reason||'Coletor indisponível.';}catch(error){capture.status='unavailable';capture.reason=String(error?.message||error).slice(0,320);}await save();}
  async function finishFrameCapture(finishReason){
    if(!state||state.frameCaptureFinalized)return;
    const active=state,capture=active.frameCapture||{status:'disabled',reason:'Coleta detalhada não preparada.'};
    if(!pendingSessionSummary){
      let frameResult=null;
      if(capture.id&&capture.status!=='disabled'&&frameCapture){
        // A failed stop must retain the journal so recovery can retry the collector.
        frameResult=await frameCapture.stop({id:capture.id,reason:active.observedGame&&capture.status==='capturing'?'completed':'interrupted: '+finishReason,includeTimeline:true});
      }
      if(active.observedGame){
        const captureStatus=capture.status==='disabled'?'disabled':frameResult?.status==='available'?'available':'unavailable';
        pendingSessionSummary={sessionId:active.id,provider:active.provider||'steam',startedAt:active.startedAt,gameObservedAt:active.gameObservedAt||null,finishedAt:new Date(now()).toISOString(),finishReason,captureStatus,reason:captureStatus==='available'?'':capture.reason||frameResult?.reason||'Coleta indisponível.',frameCapture:frameResult};
      }
    }
    // Keep the completed result in memory if saving fails; do not stop it again on retry.
    if(pendingSessionSummary)await sessionSummaryStore?.add(pendingSessionSummary);
    active.frameCaptureFinalized=true;await save();pendingSessionSummary=null;
  }
  async function cleanup({finishReason='game-exit'}={}){const errors=[];try{await finishFrameCapture(finishReason);}catch(error){errors.push('Não foi possível concluir o resumo da sessão: '+error.message);}await stopTopologySampling();for(const module of [cpuAffinity,processTuning]){try{if(module)await module.restore();}catch(error){errors.push(error.message);}finally{if(module===processTuning)try{await captureGovernorEvents((await processTuning.inspect())?.automatic);}catch{}}}try{if(state?.powerChanged){const plans=await system.getPowerPlans();if(![state.originalPowerGuid,state.appliedPowerGuid||'8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'].includes(plans.activeGuid))throw new Error('O plano de energia mudou fora desta sessão. Sua escolha e o backup foram preservados; selecione o plano da sessão ou o anterior antes de tentar restaurar.');if(state.priorRestoreGuid)await system.activatePowerPlan(state.originalPowerGuid);else if(plans.restoreGuid)await system.restorePowerPlan();else if(plans.activeGuid!==state.originalPowerGuid)throw new Error('O plano anterior está registrado na sessão, mas falta o registro de restauração de energia.');}}catch(error){errors.push(error.message);}if(errors.length)throw new Error(errors.join(' '));if(state?.powerChanged)await emitHistory({kind:'resolve',moduleId:'session-power',status:'restored',reason:'Plano anterior confirmado após encerrar a sessão.'});await fs.unlink(journal).catch(error=>{if(error.code!=='ENOENT')throw error;});state=null;for(const module of [processTuning,cpuAffinity])module?.clearSessionContext?.();if(!autoAttachEnabled&&timer)clearInterval(timer);if(!autoAttachEnabled)timer=null;}
  async function poll(){
    if(working)return;
    if(!state){if(!autoAttachEnabled)return;working=true;try{const running=await isGameRunning();if(!running){autoAttachIgnoredUntilExit=false;autoAttachStatus='waiting';return;}if(autoAttachIgnoredUntilExit)return;autoAttachStatus='detected';await start({preset:'balanced',processPolicy:{automatic:true},provider:'steam',attachRunning:true});autoAttachStatus='managed';}catch(error){autoAttachStatus='error: '+String(error?.message||'falha ao conectar').slice(0,200);}finally{working=false;}return;}
    working=true;
    try{
      const running=await isGameRunning();
      if(running)await startTopologySampling();else await stopTopologySampling();
      if(running&&system.getPowerPlans&&(state.lastPowerCheck===undefined||now()-state.lastPowerCheck>=policyRefreshMs)){
        state.lastPowerCheck=now();
        try{const plans=await system.getPowerPlans();if(plans?.activeGuid&&state.powerPlan&&state.powerPlan!=='unknown'&&plans.activeGuid!==state.powerPlan){const original=plans.plans?.find(plan=>plan.guid===state.powerPlan)?.name||'plano registrado no início',current=plans.plans?.find(plan=>plan.guid===plans.activeGuid)?.name||'outro plano';state.powerReport=`Aviso: o plano mudou durante a sessão, de ${original} para ${current}. A alteração ocorreu fora do CSBOOST; ele não vai reverter nem reativar nenhum plano automaticamente.`;await emitHistory({kind:'record',moduleId:'power',label:'Mudança externa durante sessão',previous:original,applied:current,reason:'Detectada por leitura periódica; nenhuma escrita automática foi feita.',restoration:'not-applicable',action:'notice',dedupeKey:'external-power:'+state.startedAt+':'+state.powerPlan+':'+plans.activeGuid});await save();}}
        catch{if(!state.powerReport?.startsWith('Aviso: o plano mudou'))state.powerReport='Não foi possível conferir o plano de energia durante a sessão.';await save();}
      }
      if(running&&!state.observedGame){state.observedGame=true;state.gameObservedAt=new Date(now()).toISOString();state.status='running';await save();await startFrameCapture();
      }
      if(running&&processTuning&&(state.processPolicy?.automatic||state.processPolicy?.prioritizeGame||state.processPolicy?.backgroundApps?.length||state.processPolicy?.backgroundMemoryPriorityApps?.length)&&(state.lastProcessUpdate===undefined||now()-state.lastProcessUpdate>=(state.processPolicy.automatic?1500:policyRefreshMs))){
        const stable=value=>JSON.stringify(value,(key,item)=>key==='cpuPercent'?undefined:item),before=stable(state.processReport);state.lastProcessUpdate=now();try{state.processReport=await processTuning.apply(state.processPolicy);if(state.processReport?.automatic)await captureGovernorEvents(state.processReport);}catch(error){state.processReport={applied:null,warnings:[error.message]};}if(!state.processPolicy.automatic||before!==stable(state.processReport))await save();
      }
      if(running&&cpuAffinity&&state.processPolicy?.cpuDistribution&&(state.lastAffinityUpdate===undefined||now()-state.lastAffinityUpdate>=policyRefreshMs)){
        state.lastAffinityUpdate=now();try{state.affinityReport=await cpuAffinity.apply({backgroundApps:state.processPolicy.backgroundApps});}catch(error){state.affinityReport={applied:null,warnings:[error.message]};}await save();
      }
      if(!running&&(state.observedGame||now()-state.startTime>(state.provider&&state.provider!=='steam'?Math.max(600000,startTimeoutMs):startTimeoutMs)))await cleanup();
    }catch(error){if(state){state.status='recovery-required';state.error=error.message;await save();}}finally{working=false;}
  }
  function monitor(){if(!timer){timer=setInterval(()=>{poll().catch(error=>{if(state){state.status='recovery-required';state.error='Não foi possível atualizar o registro da sessão: '+error.message;}});},pollMs);timer.unref?.();}}
  async function readAutoAttach(){try{const stat=await fs.lstat(autoAttachFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)throw Error('Preferência de sessão automática inválida.');const data=JSON.parse(await fs.readFile(autoAttachFile,'utf8'));if(data?.version!==1||typeof data.enabled!=='boolean')throw Error('Preferência de sessão automática inválida.');return data.enabled;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
  async function setAutoAttach(enabled){if(typeof enabled!=='boolean')throw Error('Escolha inválida para sessão automática.');autoAttachEnabled=enabled;autoAttachStatus=enabled?'waiting':'disabled';await fs.mkdir(directory,{recursive:true});const temporary=autoAttachFile+'.tmp';await fs.writeFile(temporary,JSON.stringify({version:1,enabled}),{flag:'w'});await fs.rename(temporary,autoAttachFile);if(enabled)monitor();else if(!state&&timer){clearInterval(timer);timer=null;}return getAutoAttach();}
  function getAutoAttach(){return {enabled:autoAttachEnabled,status:autoAttachStatus,intervalMs:pollMs};}
  async function recover({restoreImmediately=false}={}){
    autoAttachEnabled=await readAutoAttach();autoAttachStatus=autoAttachEnabled?'waiting':'disabled';
    let data;
    try{const stat=await fs.lstat(journal);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Registro de sessão inválido.');data=JSON.parse(await fs.readFile(journal,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;try{await cleanup({finishReason:'recovery'});}catch(recovery){state={id:crypto.randomUUID(),preset:'balanced',status:'recovery-required',powerChanged:false,observedGame:false,startTime:now(),startedAt:new Date(now()).toISOString(),error:recovery.message};await save();}if(autoAttachEnabled)monitor();return snapshot();}
    if(!data||!['balanced','performance','competitive'].includes(data.preset)||typeof data.powerChanged!=='boolean'||!Number.isFinite(data.startTime)||data.powerChanged&&(!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(data.originalPowerGuid)||data.priorRestoreGuid&&!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(data.priorRestoreGuid)))throw new Error('Registro de sessão inválido.');
    if(data.provider!==undefined&&!['steam','faceit','gamersclub'].includes(data.provider))throw Error('Plataforma de sessão inválida.');if(data.processPolicy)data.processPolicy=validateProcessPolicy(data.processPolicy);state=data;state.id=SESSION_ID.test(state.id||'')?state.id:crypto.randomUUID();if(!state.frameCapture)state.frameCapture={id:state.id,status:'unavailable',reason:'Esta sessão foi registrada antes da coleta pós-sessão; não há dados confiáveis para reconstruir.'};if(state.frameCapture&&['prepared','capturing'].includes(state.frameCapture.status)){state.frameCapture.status='unavailable';state.frameCapture.reason='Captura interrompida pelo fechamento do CSBOOST; nenhuma estatística foi reconstruída.';}state.frameCaptureFinalized=state.frameCaptureFinalized===true;await save();
    try{if(!restoreImmediately&&await isGameRunning()){await readSessionContext();state.observedGame=true;state.gameObservedAt??=new Date(now()).toISOString();state.status='running';monitor();}else await cleanup({finishReason:'recovery'});}catch(error){if(state){state.status='recovery-required';state.error=error.message;await save();}}
    return snapshot();
  }
  async function start({preset,settings,processPolicy,provider='steam',userOverride,powerOverride,attachRunning=false}){
    if(typeof attachRunning!=='boolean'||attachRunning&&settings)throw Error('Sessão existente não permite aplicar CFG.');
    if(userOverride!==undefined||powerOverride!==undefined)throw Error('Override de energia não disponível; use a política padrão.');
    if(!['steam','faceit','gamersclub'].includes(provider))throw Error('Plataforma de sessão inválida.');
    if(provider!=='steam'&&settings)throw Error('Use a configuração atual para iniciar pelo cliente externo; o CSBOOST não pode confirmar a execução do CFG por ele.');
    const policy=validateProcessPolicy(processPolicy);
    if(!['balanced','performance','competitive'].includes(preset))throw new Error('Preset inválido.');if(state||starting)throw new Error('Já existe uma sessão ativa.');starting=true;try{const running=await isGameRunning();if(attachRunning&&!running)throw Error('Abra o CS2 antes de conectar a sessão.');if(!attachRunning&&running)throw new Error('Feche o CS2 antes de iniciar uma sessão com outro preset.');await readSessionContext();if(policy.cpuDistribution){if(!cpuAffinity)throw new Error('Módulo de afinidade indisponível.');const capability=await cpuAffinity.inspect();if(!capability.supported)throw new Error(capability.reason);}}catch(error){starting=false;throw error;}
    state={id:crypto.randomUUID(),preset,provider,status:'preparing',observedGame:false,gameObservedAt:attachRunning?new Date(now()).toISOString():null,powerChanged:false,startTime:now(),startedAt:new Date(now()).toISOString(),processPolicy:policy};
    try{
      await save();await prepareFrameCapture();
      const plans=await Promise.resolve().then(()=>system.getPowerPlans()).catch(()=>null),power=await readPowerPolicy({route:'session',system,getPowerContext,getCpuTopology:cpuTopology?()=>cpuTopology.inspect():undefined,plans});
      state.powerPolicy=power.decision;state.powerPlan=plans?.activeGuid??'unknown';state.powerReason=!plans?'power-state-unavailable':preset==='balanced'?'preset-keep-current':power.decision.reason;state.powerReport=powerReasonText(state.powerReason);
      if(preset!=='balanced'&&power.decision.allowHighPerformance&&plans){
        state.powerReport=plans.activeGuid===HIGH_PERFORMANCE_PLAN?'O plano Alto desempenho já estava ativo.':'Plano Alto desempenho selecionado para esta sessão.';
        if(plans.activeGuid!==HIGH_PERFORMANCE_PLAN){state.powerChanged=true;state.appliedPowerGuid=HIGH_PERFORMANCE_PLAN;state.originalPowerGuid=plans.activeGuid;state.priorRestoreGuid=plans.restoreGuid;await save();const result=await system.activatePowerPlan(HIGH_PERFORMANCE_PLAN);state.powerPlan=HIGH_PERFORMANCE_PLAN;await emitHistory({kind:'record',moduleId:'session-power',label:'Plano de energia',previous:plans.plans?.find(plan=>plan.guid===plans.activeGuid)?.name||plans.activeGuid,applied:result?.plans?.find(plan=>plan.guid===HIGH_PERFORMANCE_PLAN)?.name||'Alto desempenho',reason:`Política de energia (${state.powerReason}): ${powerReasonText(state.powerReason)}`,restoration:'pending',action:'applied'});}
      }
      if(settings)await system.applyProfile({settings});if(provider==='steam'&&!attachRunning)await system.launchCS2(settings?{withConfig:true,settings}:{withConfig:false});state.observedGame=attachRunning;state.status=attachRunning?'running':'waiting-for-game';await save();if(attachRunning){await startFrameCapture();await startTopologySampling();}monitor();return snapshot();
    }catch(error){try{await cleanup({finishReason:'startup-failed'});}catch(recovery){if(state){state.status='recovery-required';state.error=recovery.message;await save();}throw new Error(error.message+' A restauração requer atenção: '+recovery.message);}throw error;}finally{starting=false;}
  }
  async function stop(){if(working||starting)throw new Error('A sessão está sendo atualizada. Tente novamente.');working=true;try{if(state){const gameStillRunning=await isGameRunning();await cleanup({finishReason:gameStillRunning?'manual-stop':'game-exit'});if(autoAttachEnabled&&gameStillRunning)autoAttachIgnoredUntilExit=true;}return null;}finally{working=false;}}
  function dispose(){if(timer)clearInterval(timer);timer=null;stopTopologySampling().catch(()=>{});}
  return {start,stop,recover,getState:async()=>snapshot(),getAutoAttach,setAutoAttach,poll,dispose};
}
