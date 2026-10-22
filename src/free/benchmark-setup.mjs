import {readSystemInventory} from './system-worker.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validateProcessPolicy} from './process-tuning.mjs';
import {validateOwnerToken} from './owned-state.mjs';
import {summarizeBenchmarkRuns} from './benchmarks.mjs';
import {BOOST_IDS} from './boosters/index.mjs';

const execute=promisify(execFile);
const ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const SHA=/^[a-f\d]{64}$/i;
const GROUPS=['baseline','optimized'];
const PRESETS=['balanced','performance','competitive'];
const POWER_GUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const validOneClick=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['profile','selectedIds'].includes(key))&&['safe','full'].includes(value.profile)&&Array.isArray(value.selectedIds)&&value.selectedIds.length>0&&value.selectedIds.length<=BOOST_IDS.length&&new Set(value.selectedIds).size===value.selectedIds.length&&value.selectedIds.every(id=>BOOST_IDS.includes(id));
function validReceipt(receipt){return receipt&&validateOwnerToken(receipt.ownerToken)&&SHA.test(receipt.ownerKey)&&['fps','competitive'].includes(receipt.videoPreset)&&Array.isArray(receipt.selectedIds)&&receipt.selectedIds.length>0&&receipt.selectedIds.length<=BOOST_IDS.length&&new Set(receipt.selectedIds).size===receipt.selectedIds.length&&receipt.selectedIds.every(id=>BOOST_IDS.includes(id));}
const STAGES=['preparation','baseline','adjustments','awaiting-reboot','optimized','results','completed','cancelled'];
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const error=(code,message,details)=>Object.assign(new Error(message),{code,...(details?{details}:{} )});
const label=(value,name='Anotação')=>{if(typeof value!=='string'||value.length>300||/[\x00-\x1f\x7f]/.test(value))throw error('BENCHMARK_SETUP_INVALID',name+' inválida; use até 300 caracteres sem quebras de linha.');return value.trim();};
export const BENCHMARK_SETUP_CHECKS=Object.freeze([
  Object.freeze({id:'quietWorkload',label:'Downloads, gravações e carga de fundo semelhantes nos dois grupos.'}),
  Object.freeze({id:'sameScenario',label:'Mesmo mapa, percurso e duração do benchmark antes e depois.'}),
  Object.freeze({id:'foreground',label:'Manter o CS2 em primeiro plano durante toda a medição.'}),
]);

async function windowsBootId(){if(process.platform!=='win32')return null;return (await readSystemInventory({operation:'platform'})).bootId||null;}

const bootToken=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f\x7f]/.test(value)?value:null;
const ids=value=>Array.isArray(value)&&value.length<=10&&value.every(id=>typeof id==='string'&&ID.test(id))&&new Set(value).size===value.length;
function measurement(row){
  if(!row||!ID.test(row.id)||!SHA.test(row.sourceSHA256)||!Number.isFinite(row.averageFps)||row.averageFps<=0||row.averageFps>10000||!Number.isFinite(row.onePercentLow)||row.onePercentLow<0||row.onePercentLow>row.averageFps||!Number.isFinite(row.durationSeconds)||row.durationSeconds<90)throw error('BENCHMARK_SETUP_RESULT_INVALID','Selecione resultados VProf completos, com origem SHA-256 e pelo menos 90 segundos.');
  return {sourceSHA256:row.sourceSHA256.toLowerCase(),averageFps:row.averageFps,onePercentLow:row.onePercentLow,durationSeconds:row.durationSeconds,runId:row.context?.runId??null,collectorInterrupted:row.context?.collectorInterrupted===true,...(row.context&&Object.hasOwn(row.context,'powerPlan')?{powerPlan:typeof row.context.powerPlan==='string'&&POWER_GUID.test(row.context.powerPlan)?row.context.powerPlan.toLowerCase():'unknown'}:{})};
}

/** A persistent study of actual history records. Reading never launches or reapplies. */
export function createBenchmarkSetup({directory,benchmarks,runner,isGameRunning=async()=>false,getBoostState,getPowerPlans,getBootId=windowsBootId,now=()=>new Date().toISOString()}){
  if(!path.isAbsolute(directory)||typeof benchmarks?.read!=='function'||typeof benchmarks?.compare!=='function'||typeof runner?.getState!=='function'||typeof runner?.inspect!=='function'||typeof runner?.start!=='function')throw new Error('Dependências do assistente de benchmark inválidas.');
  const journal=path.join(directory,'benchmark-setup.json');
  let queue=Promise.resolve();const serial=operation=>{const result=queue.then(operation,operation);queue=result.catch(()=>{});return result;};
  const time=()=>{const result=now();if(typeof result!=='string'||!Number.isFinite(Date.parse(result)))throw new Error('Relógio do assistente inválido.');return result;};
  async function boot(){try{return bootToken(await getBootId());}catch{return null;}}
  function validate(state){
    if(!state||state.version!==1||!ID.test(state.id)||!['active','completed','cancelled'].includes(state.status)||!STAGES.includes(state.stage)||!PRESETS.includes(state.preset)||!['boosted','current'].includes(state.optimizedMode)||!Number.isInteger(state.targetRuns)||state.targetRuns<1||state.targetRuns>10||!ids(state.baselineIds)||!ids(state.optimizedIds)||new Set([...state.baselineIds,...state.optimizedIds]).size!==state.baselineIds.length+state.optimizedIds.length||!state.selectedSources||typeof state.selectedSources!=='object'||Array.isArray(state.selectedSources)||!state.preparation||BENCHMARK_SETUP_CHECKS.some(check=>typeof state.preparation[check.id]!=='boolean')||!state.adjustments||typeof state.adjustments.confirmed!=='boolean'||typeof state.adjustments.rebootPending!=='boolean'||!Array.isArray(state.allowInterruptedIds)||state.allowInterruptedIds.length>20||state.allowInterruptedIds.some(id=>!ID.test(id)))throw error('BENCHMARK_SETUP_JOURNAL_INVALID','O registro do assistente está inválido. Seus resultados de benchmark permanecem no histórico.');
    label(state.adjustments.note);
    if(state.oneClick!==undefined&&(!validOneClick(state.oneClick)||state.guided||state.targetRuns!==1||state.optimizedMode!=='current'))throw error('BENCHMARK_SETUP_JOURNAL_INVALID','Referência de boosters inválida.');
    if(state.guided!==undefined&&typeof state.guided!=='boolean'||state.adjustments.boostReceipt&&!validReceipt(state.adjustments.boostReceipt))throw error('BENCHMARK_SETUP_JOURNAL_INVALID','A referência do Boost deste estudo está inválida.');
    for(const id of [...state.baselineIds,...state.optimizedIds]){const source=state.selectedSources[id];if(!source||!SHA.test(source.sourceSHA256)||!Number.isFinite(source.averageFps)||!Number.isFinite(source.onePercentLow)||!Number.isFinite(source.durationSeconds)||source.powerPlan!==undefined&&source.powerPlan!=='unknown'&&!POWER_GUID.test(source.powerPlan))throw error('BENCHMARK_SETUP_JOURNAL_INVALID','Uma referência de resultado do assistente está inválida.');}
    if(state.pendingRun&&(!GROUPS.includes(state.pendingRun.group)||state.pendingRun.id!==null&&!ID.test(state.pendingRun.id)||typeof state.pendingRun.requestedAt!=='string'||typeof state.pendingRun.status!=='string'||state.pendingRun.status.length>60))throw error('BENCHMARK_SETUP_JOURNAL_INVALID','A referência da execução pendente está inválida.');
    return state;
  }
  async function read(){try{const stat=await fs.lstat(journal);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)throw error('BENCHMARK_SETUP_JOURNAL_INVALID','O assistente precisa de um registro local regular de até 128 KB.');return validate(JSON.parse(await fs.readFile(journal,'utf8')));}catch(problem){if(problem.code==='ENOENT')return null;throw problem;}}
  function stage(state){
    if(state.status==='cancelled')return 'cancelled';if(state.status==='completed')return 'completed';
    if(state.pendingRun)return state.pendingRun.group==='baseline'?'baseline':'optimized';
    if(state.baselineIds.length<state.targetRuns)return BENCHMARK_SETUP_CHECKS.every(check=>state.preparation[check.id])?'baseline':'preparation';
    if(!state.adjustments.confirmed)return 'adjustments';
    if(state.adjustments.rebootPending)return 'awaiting-reboot';
    return state.optimizedIds.length<state.targetRuns?'optimized':'results';
  }
  async function save(state){state.stage=stage(state);state.updatedAt=time();validate(state);await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('A pasta do assistente precisa ser regular.');const temporary=journal+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});try{await fs.rename(temporary,journal);}catch(problem){await fs.unlink(temporary).catch(()=>{});throw problem;}}
  const requireStudy=async()=>{const state=await read();if(!state)throw error('BENCHMARK_SETUP_MISSING','Crie um assistente antes de continuar.');return state;};
  const requireActive=state=>{if(state.status!=='active')throw error('BENCHMARK_SETUP_FINISHED','Este assistente já terminou. Crie outro para uma nova comparação.');};
  async function idle(state){
    if(state.pendingRun||runner.isActive?.()||await isGameRunning())throw error('BENCHMARK_SETUP_BUSY','Conclua ou cancele a medição e feche o CS2 para restaurar o limite de FPS antes do próximo passo.');
    const installation=await runner.inspect().catch(()=>null);
    if(installation?.fpsLimit?.pending)throw error('BENCHMARK_SETUP_BUSY','A restauração do limite de FPS ainda está pendente. Conclua a recuperação antes do próximo passo.');
  }
  async function checkedRows(state){
    const rows=[];
    for(const id of [...state.baselineIds,...state.optimizedIds]){const row=await benchmarks.read(id),source=measurement(row);if(JSON.stringify(source)!==JSON.stringify(state.selectedSources[id]))throw error('BENCHMARK_SETUP_SOURCE_CHANGED','Um resultado selecionado foi alterado no histórico. Confira sua origem e crie outro assistente antes de comparar.');rows.push(row);}
    return rows;
  }
  async function matchingPower(state){
    const baseline=(await checkedRows(state)).slice(0,state.baselineIds.length);
    if(!baseline.length)return {ready:true,legacy:false,reason:null};
    const known=new Set(),legacy=baseline.some(row=>!row.context||!Object.hasOwn(row.context,'powerPlan'));
    for(const row of baseline){if(!row.context||!Object.hasOwn(row.context,'powerPlan'))continue;const plan=row.context.powerPlan;if(typeof plan!=='string'||!POWER_GUID.test(plan))return {ready:false,legacy,code:'BENCHMARK_SETUP_POWER_UNKNOWN',reason:'O plano de energia do teste Antes não foi confirmado. Repita a referência Antes com a leitura de energia disponível.'};known.add(plan.toLowerCase());}
    if(known.size>1)return {ready:false,legacy,code:'BENCHMARK_SETUP_POWER_MISMATCH',reason:'As referências Antes usaram planos de energia diferentes. Crie outro estudo com um único plano.'};
    // Old 1.26 history has no powerPlan field. Keep it usable, but explicitly
    // disclose that equal plans cannot be established from those records.
    if(!known.size)return {ready:true,legacy:true,reason:'Referência antiga sem plano de energia registrado; não foi possível confirmar o mesmo plano nos dois testes.'};
    let plans;try{plans=await getPowerPlans?.();}catch{}
    if(!plans||typeof plans.activeGuid!=='string'||!POWER_GUID.test(plans.activeGuid))return {ready:false,legacy,code:'BENCHMARK_SETUP_POWER_UNKNOWN',reason:'Não foi possível confirmar o plano de energia atual. Atualize a leitura antes de iniciar Depois.'};
    const expected=[...known][0],current=plans.activeGuid.toLowerCase();
    return {ready:expected===current,legacy,expected,current,code:expected===current?null:'BENCHMARK_SETUP_POWER_MISMATCH',reason:expected===current?(legacy?'Parte das referências antigas não registra energia; a comparação tem essa limitação.':null):'O plano de energia mudou desde Antes. Restaure o plano '+expected+' antes de iniciar Depois; o benchmark preserva o plano atual.'};
  }
  async function acceptResult(state,group,id,{allowInterrupted=false}={}){
    const row=await benchmarks.read(id),source=measurement(row);
    if(source.collectorInterrupted&&!allowInterrupted&&!state.allowInterruptedIds.includes(id))throw error('BENCHMARK_SETUP_INTERRUPTED_RESULT','O coletor desta medição foi interrompido e o foco contínuo não foi validado. Repita o teste ou selecione explicitamente com essa ressalva.');
    const selected=[...state.baselineIds,...state.optimizedIds];
    if(state[group+'Ids'].includes(id))return;
    if(selected.includes(id))throw error('BENCHMARK_SETUP_DUPLICATE_SOURCE','O mesmo resultado não pode aparecer nos dois grupos.');
    if(selected.some(other=>state.selectedSources[other]?.sourceSHA256===source.sourceSHA256))throw error('BENCHMARK_SETUP_DUPLICATE_SOURCE','O mesmo arquivo de origem não pode contar duas vezes ou aparecer nos dois grupos.');
    if(state[group+'Ids'].length>=state.targetRuns)throw error('BENCHMARK_SETUP_GROUP_FULL','Este grupo já atingiu a quantidade de medições escolhida.');
    state[group+'Ids'].push(id);state.selectedSources[id]=source;if(allowInterrupted&&!state.allowInterruptedIds.includes(id))state.allowInterruptedIds.push(id);
  }
  async function refresh(state){
    if(!state?.pendingRun){
      // Old guided studies with at most one result in each group can adopt the
      // single-run flow without deleting or selecting a different measurement.
      if(state?.guided&&state.status==='active'&&state.targetRuns===3&&state.baselineIds.length<=1&&state.optimizedIds.length<=1&&!runner.isActive?.()&&!await isGameRunning()){
        const installation=await runner.inspect().catch(()=>null);
        if(installation&&!installation.fpsLimit?.pending){await checkedRows(state);state.previousTargetRuns=3;state.targetRuns=1;await save(state);}
      }
      return state;
    }
    const before=JSON.stringify(state),pending=state.pendingRun,current=await runner.getState();
    if(pending.id&&current?.id===pending.id){
      pending.status=current.status;
      if(current.savedResult?.id&&ID.test(current.savedResult.id)){
        pending.resultId=current.savedResult.id;
        try{await acceptResult(state,pending.group,pending.resultId);}catch(problem){state.lastError={code:problem.code||'BENCHMARK_SETUP_RESULT_INVALID',message:problem.message};}
      }
      if(!runner.isActive?.()&&['completed','cancelled','failed'].includes(current.status)){
        state.lastRun={id:pending.id,group:pending.group,status:current.status,resultId:pending.resultId??null,error:clone(current.error)};state.pendingRun=null;
        if(current.status!=='completed')state.lastError={code:current.error?.code||'BENCHMARK_SETUP_RUN_FAILED',message:current.error?.message||'A execução terminou sem um resultado completo.'};
      }
    }else{
      // No inference from a new unrelated run. Existing records need an exact ID.
      let candidates=[];
      if(pending.resultId)try{candidates=[await benchmarks.read(pending.resultId)];}catch{}
      else if(pending.id&&benchmarks.list)candidates=(await benchmarks.list()).filter(row=>row.context?.runId===pending.id);
      if(candidates.length===1){try{await acceptResult(state,pending.group,candidates[0].id);state.lastRun={id:pending.id,group:pending.group,status:'recovered-from-history',resultId:candidates[0].id};}catch(problem){state.lastError={code:problem.code||'BENCHMARK_SETUP_RESULT_INVALID',message:problem.message};}}
      else state.lastError={code:'BENCHMARK_SETUP_RUN_INTERRUPTED',message:'O assistente foi interrompido. Nenhuma medição foi inferida ou relançada; confira o histórico e selecione um resultado real, ou repita o teste.'};
      state.pendingRun=null;
    }
    if(state.cancelRequested&&!state.pendingRun)state.status='cancelled';
    if(JSON.stringify(state)!==before)await save(state);return state;
  }
  async function snapshot(state){
    if(!state)return null;
    const results=await Promise.allSettled([runner.inspect(),runner.getState(),isGameRunning()]);
    const installation=results[0].status==='fulfilled'?results[0].value:null,current=results[1].status==='fulfilled'?results[1].value:null;
    const checklist=[
      {id:'installation',automatic:true,ready:!!installation,label:'Steam e instalação do CS2 verificadas.',reason:results[0].status==='rejected'?results[0].reason.message:null},
      {id:'map',automatic:true,ready:installation?.map?.installed===true,label:'Mapa de benchmark presente na biblioteca Steam.'},
      {id:'fps-cap',automatic:true,ready:installation?.fpsLimit?.available!==false&&installation?.fpsLimit?.pending!==true,label:'Limite de FPS anterior restaurado ou disponível para captura.',reason:installation?.fpsLimit?.reason??null},
      {id:'game-closed',automatic:true,ready:results[2].status==='fulfilled'&&!results[2].value,label:'CS2 fechado antes de começar outra medição.'},
      {id:'recovery',automatic:true,ready:results[1].status==='fulfilled'&&!runner.isActive?.()&&!state.pendingRun,label:'Nenhuma medição ou recuperação pendente.'},
      ...BENCHMARK_SETUP_CHECKS.map(check=>({...check,automatic:false,ready:state.preparation[check.id]})),
    ];
    if(state.adjustments.boostReceipt){const receipt=state.adjustments.boostReceipt;let live;try{live=await getBoostState?.();}catch{}checklist.push({id:'boost-receipt',automatic:true,ready:live?.status==='active'&&live.ownerToken===receipt.ownerToken&&live.ownerKey===receipt.ownerKey,label:'Boost vinculado ao estudo continua ativo.'});}
    const warnings=['O próprio aplicativo e outros programas influenciam a medição. Use condições semelhantes nos dois grupos.'];
    if(state.targetRuns===1)warnings.push('Uma medição por grupo compara estes dois testes; não mede a variação entre execuções.');
    if(state.allowInterruptedIds.length)warnings.push('Há resultado selecionado com interrupção do coletor. O foco contínuo não foi validado; repita antes de concluir ganhos.');
    if(state.adjustments.rebootVerification==='user-reported')warnings.push('Reinicialização informada pelo usuário; o Windows não forneceu uma identificação de inicialização comparável.');
    let selectionProblem=null,baselineSummary=null,powerConsistency=null;try{const rows=await checkedRows(state);if(state.baselineIds.length)baselineSummary=summarizeBenchmarkRuns(rows.slice(0,state.baselineIds.length));powerConsistency=await matchingPower(state);if(powerConsistency.legacy&&powerConsistency.reason)warnings.push(powerConsistency.reason);if(state.adjustments.confirmed&&state.baselineIds.length)checklist.push({id:'same-power-plan',automatic:true,ready:powerConsistency.ready,label:'Mesmo plano de energia registrado no teste Antes.',reason:powerConsistency.reason});}catch(problem){selectionProblem=problem.message;warnings.push(problem.message);}
    const ready=state.status==='active'&&!selectionProblem&&checklist.every(check=>check.ready);
    return {...clone(state),baselineSummary,powerConsistency,checklist,warnings,selectionProblem,activeRun:clone(current),canStartBaseline:ready&&state.baselineIds.length<state.targetRuns&&!state.adjustments.confirmed,canStartOptimized:ready&&state.baselineIds.length>=state.targetRuns&&state.adjustments.confirmed&&!state.adjustments.rebootPending&&state.optimizedIds.length<state.targetRuns,canCompare:state.status!=='cancelled'&&!selectionProblem&&!state.pendingRun&&!runner.isActive?.()&&results[2].status==='fulfilled'&&!results[2].value&&!installation?.fpsLimit?.pending&&state.baselineIds.length>=state.targetRuns&&state.optimizedIds.length>=state.targetRuns};
  }
  async function create({preset='performance',targetRuns=1,optimizedMode='boosted',guided=false,oneClick}={}){return serial(async()=>{
    if(!PRESETS.includes(preset)||!Number.isInteger(targetRuns)||targetRuns<1||targetRuns>10||!['boosted','current'].includes(optimizedMode))throw error('BENCHMARK_SETUP_INVALID','Escolha um preset válido e entre 1 e 10 medições por grupo.');
    if(typeof guided!=='boolean'||guided&&targetRuns!==1)throw error('BENCHMARK_SETUP_INVALID','O fluxo guiado utiliza uma execução por grupo.');
    if(oneClick!==undefined&&(!validOneClick(oneClick)||guided||targetRuns!==1||optimizedMode!=='current'))throw error('BENCHMARK_SETUP_INVALID','Referência de boosters inválida.');
    const previous=await read();if(previous?.status==='active')throw error('BENCHMARK_SETUP_EXISTS','Já existe um assistente em andamento. Continue ou cancele antes de criar outro.');await idle(previous||{});
    const state={version:1,id:crypto.randomUUID(),status:'active',stage:'preparation',preset,targetRuns,optimizedMode,guided,...(oneClick?{oneClick:clone(oneClick)}:{}),createdAt:time(),updatedAt:time(),baselineIds:[],optimizedIds:[],selectedSources:{},allowInterruptedIds:[],preparation:Object.fromEntries(BENCHMARK_SETUP_CHECKS.map(check=>[check.id,false])),adjustments:{confirmed:false,note:'',rebootPending:false,rebootVerification:'not-requested'},pendingRun:null,lastRun:null,lastError:null,cancelRequested:false,comparison:null};await save(state);return snapshot(state);
  });}
  async function getState(){return serial(async()=>snapshot(await refresh(await read())));}
  async function confirmPreparation(checks){return serial(async()=>{
    const state=await refresh(await requireStudy());requireActive(state);if(!checks||typeof checks!=='object'||Array.isArray(checks)||Object.keys(checks).some(key=>!BENCHMARK_SETUP_CHECKS.some(check=>check.id===key))||BENCHMARK_SETUP_CHECKS.some(check=>typeof checks[check.id]!=='boolean'))throw error('BENCHMARK_SETUP_INVALID','Confirme cada condição de preparação explicitamente.');state.preparation={...checks};state.lastError=null;await save(state);return snapshot(state);
  });}
  async function selectResults({group,ids:selection,allowInterrupted=false}={}){return serial(async()=>{
    const state=await refresh(await requireStudy());requireActive(state);await idle(state);if(!GROUPS.includes(group)||!ids(selection)||selection.length>state.targetRuns||typeof allowInterrupted!=='boolean')throw error('BENCHMARK_SETUP_INVALID','Seleção de medições inválida.');
    if(group==='baseline'&&state.adjustments.confirmed)throw error('BENCHMARK_SETUP_BASELINE_LOCKED','O grupo Antes foi fixado antes dos ajustes. Crie outro assistente para substituir essa referência.');
    if(group==='optimized'&&(!state.adjustments.confirmed||state.adjustments.rebootPending||state.baselineIds.length<state.targetRuns))throw error('BENCHMARK_SETUP_ORDER','Selecione as medições Antes e registre seus ajustes/retomada antes de escolher Depois.');
    const next=clone(state),removed=next[group+'Ids'];next[group+'Ids']=[];for(const id of removed){delete next.selectedSources[id];next.allowInterruptedIds=next.allowInterruptedIds.filter(value=>value!==id);}
    for(const id of selection)await acceptResult(next,group,id,{allowInterrupted});next.comparison=null;next.lastError=null;await save(next);return snapshot(next);
  });}
  async function mark({note='',rebootRequired=false}={},receiptRequest){
    const state=await refresh(await requireStudy());requireActive(state);await idle(state);note=label(note);if(typeof rebootRequired!=='boolean')throw error('BENCHMARK_SETUP_INVALID','A necessidade de reinicialização precisa ser explícita.');
    if(receiptRequest&&(!state.guided&&!state.oneClick||state.id!==receiptRequest.studyId||!validReceipt(receiptRequest.receipt)))throw error('BENCHMARK_SETUP_INVALID','A referência aplicada não corresponde a este estudo.');
    if(receiptRequest&&state.adjustments.boostReceipt?.ownerToken===receiptRequest.receipt.ownerToken)return snapshot(state);
    if(state.baselineIds.length<state.targetRuns||state.optimizedIds.length)throw error('BENCHMARK_SETUP_ORDER','Conclua o grupo Antes antes de registrar ajustes; comece outro assistente para mudar um estudo já medido.');await checkedRows(state);
    state.adjustments={confirmed:true,note,changedAt:time(),rebootPending:rebootRequired,bootBefore:rebootRequired?await boot():null,bootAfter:null,rebootVerification:rebootRequired?'pending':'not-requested',source:'user-reported; no settings were applied by this assistant'};
    if(receiptRequest){state.adjustments.source='csboost-owned-boost';state.adjustments.boostReceipt=clone(receiptRequest.receipt);}
    state.preparation=Object.fromEntries(BENCHMARK_SETUP_CHECKS.map(check=>[check.id,false]));state.lastError=null;await save(state);return snapshot(state);
  }
  const markAdjustments=request=>serial(()=>mark(request));
  const recordBoost=({studyId,receipt,rebootRequired=false}={})=>serial(()=>mark({note:'Boost CSBOOST aplicado; perfil '+(receipt?.videoPreset||'desconhecido')+'.',rebootRequired},{studyId,receipt}));
  async function resume({confirmManualRestart=false}={}){return serial(async()=>{
    const state=await refresh(await requireStudy());requireActive(state);if(typeof confirmManualRestart!=='boolean')throw error('BENCHMARK_SETUP_INVALID','Confirmação de reinicialização inválida.');
    if(state.adjustments.rebootPending){
      await idle(state);const current=await boot(),previous=state.adjustments.bootBefore;
      if(previous&&current){if(previous===current)throw error('BENCHMARK_SETUP_REBOOT_NOT_OBSERVED','O Windows ainda informa a mesma inicialização. Reinicie manualmente quando estiver pronto; o assistente não reinicia o PC.');state.adjustments.rebootVerification='boot-change-observed';}
      else if(confirmManualRestart)state.adjustments.rebootVerification='user-reported';
      else throw error('BENCHMARK_SETUP_REBOOT_UNKNOWN','Não foi possível verificar a reinicialização. Confirme manualmente somente depois de reiniciar o Windows.');
      state.adjustments.bootAfter=current;state.adjustments.rebootPending=false;state.adjustments.resumedAt=time();state.lastError=null;await save(state);
    }
    return snapshot(state);
  });}
  async function startRun({group,processPolicy,tuningNote=''}={}){return serial(async()=>{
    const state=await refresh(await requireStudy());requireActive(state);if(!GROUPS.includes(group))throw error('BENCHMARK_SETUP_INVALID','Grupo de medição inválido.');const policy=validateProcessPolicy(processPolicy);tuningNote=label(tuningNote);if(group==='optimized'){const power=await matchingPower(state);if(!power.ready)throw error(power.code,power.reason);}const preview=await snapshot(state);
    if(!(group==='baseline'?preview.canStartBaseline:preview.canStartOptimized))throw error('BENCHMARK_SETUP_NOT_READY','Complete o checklist e o passo anterior; feche o CS2 e aguarde a restauração antes de medir.',preview.checklist.filter(check=>!check.ready).map(check=>check.id));
    if(group==='optimized'&&state.adjustments.boostReceipt){const live=await getBoostState?.(),receipt=state.adjustments.boostReceipt;if(live?.status!=='active'||live.ownerToken!==receipt.ownerToken||live.ownerKey!==receipt.ownerKey)throw error('BENCHMARK_SETUP_BOOST_CHANGED','O Boost registrado foi restaurado ou mudou. Reconfigure o estudo antes de medir Depois.');}
    const type=group==='baseline'||state.optimizedMode==='current'?'baseline':'boosted';
    state.pendingRun={id:null,group,status:'dispatching',requestedAt:time()};state.lastError=null;await save(state);
    try{const run=await runner.start({type,preset:state.preset,processPolicy:type==='baseline'?{prioritizeGame:false,backgroundApps:[]}:policy,tuningNote:tuningNote||(group==='optimized'?state.adjustments.note:'')});if(!ID.test(run?.id))throw error('BENCHMARK_SETUP_RUN_INVALID','O coletor não forneceu uma identificação válida. Confira a medição antes de continuar.');state.pendingRun={...state.pendingRun,id:run.id,status:run.status};await save(state);return snapshot(state);}
    catch(problem){const current=await runner.getState().catch(()=>null);if(runner.isActive?.()&&ID.test(current?.id))state.pendingRun={...state.pendingRun,id:current.id,status:current.status};else state.pendingRun=null;state.lastError={code:problem.code||'BENCHMARK_SETUP_START_FAILED',message:problem.message};await save(state);throw problem;}
  });}
  async function compare(){return serial(async()=>{
    const state=await refresh(await requireStudy());if(state.status==='cancelled')throw error('BENCHMARK_SETUP_FINISHED','Este assistente foi cancelado.');await idle(state);await checkedRows(state);
    if(state.baselineIds.length<state.targetRuns||state.optimizedIds.length<state.targetRuns||state.adjustments.rebootPending)throw error('BENCHMARK_SETUP_ORDER','Conclua os dois grupos e a retomada antes de comparar.');
    const comparison=await benchmarks.compare({baselineIds:state.baselineIds,optimizedIds:state.optimizedIds});
    if(state.allowInterruptedIds.length)comparison.warnings.push('O assistente inclui medição com coletor interrompido, aceita explicitamente. Repita antes de concluir ganhos.');
    if(comparison.averageFps.percent>0&&comparison.onePercentLow.percent<0)comparison.warnings.push('O FPS médio aumentou e o P1 diminuiu. Avalie os dois resultados antes de adotar o ajuste.');
    state.comparison=comparison;state.status='completed';state.completedAt=time();state.lastError=null;await save(state);return snapshot(state);
  });}
  async function cancel(){return serial(async()=>{
    const state=await refresh(await requireStudy());if(state.status!=='active')return snapshot(state);state.cancelRequested=true;
    if(state.pendingRun&&runner.cancel)await runner.cancel();await refresh(state);if(!state.pendingRun)state.status='cancelled';await save(state);return snapshot(state);
  });}
  return {create,getState,confirmPreparation,selectResults,markAdjustments,recordBoost,resume,startRun,compare,cancel};
}
