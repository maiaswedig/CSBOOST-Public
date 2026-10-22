import crypto from 'node:crypto';
import {createOwnedState,stateHash,validateOwnerToken} from './owned-state.mjs';
import {readFirmwarePlatform} from './firmware-platform.mjs';
import {BOOSTERS,BOOST_IDS,BOOST_GROUPS} from './boosters/index.mjs';
import {HIGH_PERFORMANCE_PLAN,powerPolicyContext,decidePowerPlan} from './power-policy.mjs';
import {recommendFromBottleneck} from './boost-recommendations.mjs';
const RES=['keep','1280x720','1280x960','1600x900','1920x1080'];
const VIDEO_PRESETS=['fps','competitive'];
const safeError=error=>String(error?.message||'Operação indisponível.').slice(0,300);
const selection=value=>Array.isArray(value)&&value.length<=BOOST_IDS.length&&new Set(value).size===value.length&&value.every(id=>BOOST_IDS.includes(id))&&!(value.includes('nvidia-low-latency')&&value.includes('nvidia-low-latency-ultra'));

export function createBoostPlan({directory,system,optimizations,windowsTuning,nvidia,getSteamId,getPowerContext=readFirmwarePlatform,getCpuTopology,getLatestDiagnosis,onHistoryEvent=async()=>{},now=()=>new Date().toISOString()}){
  const store=createOwnedState(directory);let queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  async function history(event){try{await onHistoryEvent(event);}catch{}}
  async function identity(){const id=await getSteamId();if(typeof id!=='string'||!/^\d{17}$/.test(id))throw Error('Entre com a Steam para continuar.');return {id,key:stateHash(['boost',id])};}
  async function read(){
    const record=await store.read('boost.json');if(!record)return null;
    if(![1,2].includes(record.version)||!validateOwnerToken(record.ownerToken)||!/^[a-f\d]{64}$/.test(record.ownerKey)||!['applying','active','recovery-required','restoring','restored','failed-restored'].includes(record.status)||!Array.isArray(record.steps)||record.steps.length>BOOST_GROUPS.length||new Set(record.steps.map(item=>item.group)).size!==record.steps.length||!selection(record.selectedIds)||!RES.includes(record.resolution)||record.videoPreset!==undefined&&!VIDEO_PRESETS.includes(record.videoPreset)||record.bundleProfile!==undefined&&!['safe','full'].includes(record.bundleProfile))throw Error('Registro Boost Máximo inválido.');
    if(record.automatic!==undefined&&typeof record.automatic!=='boolean'||record.keepPowerPlan!==undefined&&typeof record.keepPowerPlan!=='boolean')throw Error('Modo do Boost inválido.');
    for(const step of record.steps){
      if(!BOOST_GROUPS.includes(step.group)||!['prepared','applied','restored','skipped'].includes(step.status)||typeof step.before!=='string'||step.before.length>128)throw Error('Passo do Boost inválido.');
      if(record.version===1)step.id=BOOSTERS.find(item=>item.group===step.group&&record.selectedIds.includes(item.id))?.id??BOOSTERS.find(item=>item.group===step.group).id;
      if(!BOOSTERS.some(item=>item.id===step.id&&item.group===step.group))throw Error('Módulo do Boost inválido.');
    }
    record.version=2;return record;
  }
  const pending=record=>!!record&&!['restored','failed-restored'].includes(record.status);
  const publicState=record=>({name:'Boost Máximo',automatic:record?.automatic??null,keepPowerPlan:record?.keepPowerPlan??false,bundleProfile:record?.bundleProfile??null,ownerToken:record?.ownerToken??null,ownerKey:record?.ownerKey??null,selectedIds:record?.selectedIds??[],videoPreset:record?.videoPreset??'fps',pendingRestore:pending(record),status:record?.status??'idle',appliedAt:record?.createdAt??null,steps:record?.steps.map(({id,group,status})=>({id,group,status}))??[],error:record?.error??null,fpsGain:null});
  async function inspect(){return publicState(await read());}
  async function stopped(){if(await system.isGameRunning())throw Error('Feche o CS2 antes de aplicar ou restaurar o Boost Máximo.');}
  async function inputs(resolution,videoPreset='fps',knownAccount){
    const account=knownAccount??await identity(),values=await Promise.allSettled([optimizations.inspect(account.id,{preset:videoPreset,resolution}),windowsTuning.inspect(),nvidia.inspect({preset:'recommended'}),system.getPowerPlans(),getPowerContext(),system.getSystemInfo(),Promise.resolve().then(()=>getCpuTopology?.()??null)]);
    const result=index=>values[index].status==='fulfilled'?values[index].value:null;
    return {account,resolution,videoPreset,system,optimizations,windowsTuning,nvidiaModule:nvidia,video:result(0),windows:result(1),nvidia:result(2),power:result(3),context:result(4),hardware:result(5),topology:result(6)};
  }
  async function preview(options={}){
    if(options.userOverride!==undefined||options.powerOverride!==undefined)throw Error('Override de energia não disponível; use a política padrão.');
    const keepPowerPlan=options.keepPowerPlan??false;if(typeof keepPowerPlan!=='boolean')throw Error('Opção de preservação de energia inválida.');
    const videoPreset=options.preset??'fps',resolution=options.resolution??'keep';
    const automatic=options.automatic??false;if(typeof automatic!=='boolean'||automatic&&(resolution!=='keep'||options.selection!==undefined))throw Error('O modo automático preserva a resolução e calcula a seleção no motor.');
    if(!VIDEO_PRESETS.includes(videoPreset))throw Error('Preset de Boost inválido.');if(!RES.includes(resolution))throw Error('Resolução de Boost inválida.');if(options.selection!==undefined&&!selection(options.selection))throw Error('Seleção de Boost inválida.');
    const state=await read(),ctx=await inputs(resolution,videoPreset),allBlocked=pending(state);
    const plans=await Promise.all(BOOSTERS.map(async module=>({module,plan:await module.plan(ctx)})));
    const items=plans.map(({module,plan})=>({id:module.id,group:module.group,title:plan.title??module.title,name:plan.title??module.title,profile:module.profile,risk:module.risk,scope:module.scope,requiresGameClosed:module.requiresGameClosed,status:!plan.available?'unavailable':allBlocked||plan.blocked?'pending':plan.needed?'needed':'already',selectable:!!plan.available&&!allBlocked&&!plan.blocked&&!!plan.needed,recommended:!!plan.recommended,reason:plan.reason,...(plan.powerReason?{powerReason:plan.powerReason,powerPolicy:plan.powerPolicy}:{}),tradeoffs:plan.tradeoffs,changes:plan.changes}));
    if(keepPowerPlan)for(const item of items)if(item.id==='power'){item.selectable=false;item.recommended=false;item.powerReason='benchmark-keep-current';item.reason='FPS+: plano atual preservado para comparar Antes e Depois com a mesma energia.';}
    const powerPolicy=decidePowerPlan(powerPolicyContext({route:'boost',powerContext:ctx.context,hardware:ctx.hardware,topology:ctx.topology,highPerformancePlanExists:!!ctx.power?.plans?.some(plan=>plan.guid===HIGH_PERFORMANCE_PLAN)}));
    const automaticIds=items.filter(row=>row.selectable&&row.recommended&&!['windows-capture','windows-fso','nvidia-anisotropic-sample','nvidia-anisotropic-filter','nvidia-trilinear'].includes(row.id)&&(row.group!=='nvidia'||ctx.context?.onBattery===false)).map(row=>row.id);
    const requested=automatic?automaticIds:options.selection??items.filter(row=>row.selectable&&row.recommended).map(row=>row.id);for(const row of items)row.selected=row.selectable&&requested.includes(row.id);
    let latestDiagnosis=null;try{latestDiagnosis=await getLatestDiagnosis?.()??null;}catch{}
    const diagnosisRecommendations=recommendFromBottleneck({latest:latestDiagnosis,hardware:ctx.hardware,topology:ctx.topology,items});
    const selectedIds=items.filter(row=>row.selected).map(row=>row.id),fingerprint=stateHash({ownerKey:ctx.account.key,resolution,videoPreset,keepPowerPlan,parts:plans.map(({module,plan})=>[module.id,plan.fingerprintPart??null]),items:items.map(({id,status,selected})=>({id,status,selected})),onBattery:ctx.context?.onBattery??null,powerPolicy,platform:ctx.hardware?.platform??null,state:publicState(state)});
    return {name:'Boost Máximo',automatic,keepPowerPlan,preset:videoPreset,resolution,items,selectedIds,diagnosisRecommendations,fingerprint,previewFingerprint:fingerprint,canApply:!allBlocked&&selectedIds.length>0&&ctx.hardware?.platform==='win32',state:publicState(state),automaticSummary:{cpu:ctx.hardware?.cpu||'CPU não identificada',gpu:ctx.hardware?.gpu||'GPU não identificada',onBattery:ctx.context?.onBattery??null,powerPolicy,session:'Eficiência do CS2 e equilíbrio de processos durante a sessão.',preserved:['Resolução e limite de FPS atuais','Gravação, firmware e afinidade de CPU','Três extras NVIDIA de filtragem',...(keepPowerPlan||!powerPolicy.allowHighPerformance?['Plano de energia atual']:[])]},hardwarePending:['PBO/CO e XMP/EXPO ficam nos ajustes avançados, com fluxo assistido.'],fpsGain:null,message:'Ajustes compatíveis detectados. Compare o resultado no benchmark.'};
  }
  async function restoreRecord(record,account,discardTokens={}){
    if(record.ownerKey!==account.key)throw Error('Entre na mesma conta Steam que aplicou o Boost para restaurar.');record.status='restoring';await store.write('boost.json',record);const errors=[];
    for(const step of [...record.steps].reverse()){
      if(['restored','skipped'].includes(step.status))continue;
      try{await stopped();const module=BOOSTERS.find(item=>item.id===step.id),ctx=await inputs(record.resolution,record.videoPreset,account),outcome=await module.restore({...ctx,ownerToken:record.ownerToken,selectedIds:record.selectedIds,discardTokens},step);step.status='restored';await store.write('boost.json',record);const moduleId='boost-'+module.group;if(outcome?.discarded&&outcome.restoredItems?.length){await history({kind:'resolve',moduleId,status:'partial',reason:'Parte dos valores foi restaurada; os itens conflitantes foram descartados após confirmação.'});await history({kind:'resolve',moduleId,labels:outcome.restoredItems,status:'restored',reason:'Valor original restaurado e confirmado.'});await history({kind:'resolve',moduleId,status:'discarded',reason:'Backup restante descartado após confirmação; os valores atuais conflitantes foram mantidos.'});}else await history({kind:'resolve',moduleId,status:outcome?.discarded||discardTokens[module.group]?'discarded':'restored',reason:outcome?.discarded||discardTokens[module.group]?'Backup descartado após confirmação; os valores atuais foram mantidos.':'Restauração confirmada pelo módulo do Boost Máximo.'});}catch(error){errors.push(safeError(error));const module=BOOSTERS.find(item=>item.id===step.id),moduleId='boost-'+module.group;await history({kind:'resolve',moduleId,status:'partial',reason:'Restauração parcial ou pendente: '+safeError(error)});if(Array.isArray(error?.restoredItems)&&error.restoredItems.length)await history({kind:'resolve',moduleId,labels:error.restoredItems,status:'restored',reason:'Valor original restaurado e confirmado; os demais itens continuam preservados.'});}
    }
    record.status=errors.length?'recovery-required':'restored';record.error=errors.join(' ')||null;await store.write('boost.json',record);if(errors.length)throw Error('Restauração incompleta: '+record.error);return publicState(record);
  }
  async function apply(request){return serial(async()=>{
    if(request?.userOverride!==undefined||request?.powerOverride!==undefined)throw Error('Override de energia não disponível; use a política padrão.');
    if(request?.keepPowerPlan!==undefined&&typeof request.keepPowerPlan!=='boolean')throw Error('Opção de preservação de energia inválida.');
    if(request?.automatic!==undefined&&typeof request.automatic!=='boolean')throw Error('Modo do Boost inválido.');
    if(!request||typeof request.previewFingerprint!=='string'||!/^[a-f\d]{64}$/.test(request.previewFingerprint)||!selection(request.selectedIds)||!request.selectedIds.length||!RES.includes(request.resolution??'keep')||request.bundleProfile!==undefined&&!['safe','full'].includes(request.bundleProfile))throw Error('Atualize a prévia e selecione os ajustes.');
    await stopped();if(pending(await read()))throw Error('Restaure o Boost anterior antes de aplicar outro.');
    const options={...(request.automatic?{automatic:true}:{selection:request.selectedIds}),resolution:request.resolution??'keep',preset:request.preset??'fps',keepPowerPlan:request.keepPowerPlan??false},plan=await preview(options);
    if(!plan.canApply||plan.selectedIds.length!==request.selectedIds.length||plan.selectedIds.some((id,index)=>id!==request.selectedIds[index])||plan.fingerprint!==request.previewFingerprint)throw Error('A configuração ou seleção mudou. Atualize a prévia do Boost.');
    const account=await identity(),base=await inputs(options.resolution,options.preset);if((await preview(options)).fingerprint!==plan.fingerprint)throw Error('As opções mudaram durante a preparação.');
    const record={version:2,automatic:request.automatic??false,keepPowerPlan:options.keepPowerPlan,...(request.bundleProfile?{bundleProfile:request.bundleProfile}:{}),ownerKey:account.key,ownerToken:'boost:'+crypto.randomUUID(),status:'applying',createdAt:now(),selectedIds:[...request.selectedIds],resolution:options.resolution,videoPreset:options.preset,steps:[],error:null};await store.write('boost.json',record);
    try{
      const modules=BOOST_GROUPS.map(group=>BOOSTERS.find(item=>item.group===group&&request.selectedIds.includes(item.id))).filter(Boolean);
      for(const module of modules){
        await stopped();if((await identity()).key!==account.key)throw Error('A conta Steam mudou durante a aplicação.');const live=await inputs(options.resolution,options.preset),current=await module.plan(live);
        if(!current.available||current.blocked||module.signature(live)!==module.signature(base)||module.group==='power'&&stateHash([live.context,live.hardware?.cpu,live.hardware?.x3d,live.hardware?.formFactor])!==stateHash([base.context,base.hardware?.cpu,base.hardware?.x3d,base.hardware?.formFactor]))throw Error('As preferências de '+module.title+' mudaram; não sobrescritas.');
        const step={id:module.id,group:module.group,status:'prepared',before:module.signature(base)};record.steps.push(step);await store.write('boost.json',record);
        const ctx={...base,selectedIds:request.selectedIds,ownerToken:record.ownerToken},result=await module.apply(ctx,{ownerToken:record.ownerToken});
        if(!await module.verify(ctx)){if(result?.changed===false)step.status='skipped';else throw Error('O módulo não confirmou o backup próprio do Boost.');}else{
          step.status='applied';
          const changes=Array.isArray(current.changes)?current.changes.slice(0,32):[];
          for(const change of changes){
            const powerName=guid=>base.power?.plans?.find(plan=>plan.guid===guid)?.name||guid;
            const power=module.group==='power';
            await history({kind:'record',moduleId:'boost-'+module.group,label:change.label||module.title,previous:power?powerName(change.before):change.before,applied:power?powerName(change.after??change.value):change.after??change.value,reason:power?`Política de energia (${current.powerReason||'não informada'}): ${current.reason||'Ajuste aplicado pelo motor.'}`:current.reason||'Ajuste selecionado pelo motor Boost Máximo.',restoration:'pending',action:'applied'});
          }
        }await store.write('boost.json',record);
      }
      record.status='active';await store.write('boost.json',record);return publicState(record);
    }catch(error){record.error=safeError(error);await store.write('boost.json',record);try{await restoreRecord(record,account);record.status='failed-restored';record.error=safeError(error);await store.write('boost.json',record);}catch(restoreError){throw Error(safeError(error)+' '+safeError(restoreError));}throw Error(safeError(error)+' Os ajustes próprios já aplicados foram restaurados.');}
  });}
  async function restore(options={}){return serial(async()=>{if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='discardTokens'))throw Error('Opções de restauração do Boost inválidas.');const discardTokens=options.discardTokens??{};if(!discardTokens||typeof discardTokens!=='object'||Array.isArray(discardTokens)||Object.keys(discardTokens).some(key=>!['video','windows','nvidia','power'].includes(key))||Object.values(discardTokens).some(token=>typeof token!=='string'||!/^[a-f\d]{64}$/i.test(token)))throw Error('Confirmações de descarte do Boost inválidas.');await stopped();const record=await read();if(!pending(record))return publicState(record);return restoreRecord(record,await identity(),discardTokens);});}
  return {preview,apply,inspect,restore};
}
