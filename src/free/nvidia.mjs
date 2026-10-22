import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateOwnerToken} from './owned-state.mjs';
import {consumeDiscardToken,appendDiscardAudit} from './discard-confirmation.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const APPLICATION = 'cs2.exe';
const OWN_PROFILE = 'CSBOOST - Counter-Strike 2';
const FORMAT = 1;
export const NVIDIA_DRIVER_KEYS=Object.freeze([
  'powerMode','refreshRate','textureFilter','vsync',
  'fxaa','mfaa','aaControl','anisoControl','ambientOcclusion','aaGamma','aaTransparency',
  'negativeLodBias','threadedOptimization','vulkanPresent','tripleBuffer','lowLatency',
]);
export const NVIDIA_SETTINGS = Object.freeze([

  Object.freeze({key:'powerMode',id:0x1057eb71,value:1,label:'Preferir desempenho máximo',reason:'Preferência de energia do driver para o perfil do CS2.',tradeoff:'Pode aumentar consumo e temperatura enquanto o jogo estiver aberto.',presets:Object.freeze(['performance','competitive','recommended'])}),
  Object.freeze({key:'refreshRate',id:0x0064b541,value:1,label:'Maior taxa de atualização disponível',reason:'Solicita ao driver a maior taxa disponível nos modos em que esta opção é respeitada.',tradeoff:'Depende do modo de tela e do monitor; não aumenta por si só o FPS renderizado.',presets:Object.freeze(['performance','competitive','recommended'])}),
  Object.freeze({key:'vsync',id:0x00a879cf,value:0x08416747,label:'VSync forçado desligado',reason:'Permite renderizar sem esperar a sincronização vertical.',tradeoff:'Pode causar rasgos na imagem e alterar a experiência com VRR/G-SYNC.',presets:Object.freeze(['competitive'])}),
  Object.freeze({key:'textureFilter',id:0x00ce2691,value:20,label:'Filtragem de textura em alto desempenho',reason:'Prioriza desempenho na política de filtragem do driver.',tradeoff:'Pode reduzir a qualidade de filtragem; o efeito depende do jogo e do driver.',presets:Object.freeze(['competitive','recommended'])}),
  Object.freeze({key:'anisotropicSample',id:0x00e73211,value:1,label:'Otimização de amostras anisotrópicas',reason:'Permite ao driver reduzir amostras de filtragem conforme sua política.',tradeoff:'Pode reduzir a qualidade da filtragem; compare imagem e FPS no jogo.',presets:Object.freeze(['texture','recommended'])}),
  Object.freeze({key:'anisotropicFilter',id:0x0084cd70,value:1,label:'Otimização de filtragem anisotrópica',reason:'Habilita a opção pública de otimização da filtragem no perfil do CS2.',tradeoff:'Pode reduzir a qualidade de texturas; o ganho depende do driver e do jogo.',presets:Object.freeze(['texture','recommended'])}),
  Object.freeze({key:'trilinear',id:0x002ecaf2,value:1,label:'Otimização trilinear',reason:'Permite simplificar a filtragem onde o driver considerar apropriado em DirectX.',tradeoff:'Pode alterar a transição de texturas; não se aplica a todos os renderizadores.',presets:Object.freeze(['texture','recommended'])}),
  Object.freeze({key:'shaderCache',id:0x00198FFF,value:1,label:'Cache de shaders NVIDIA',reason:'Reativa o cache quando o driver confirma que está desativado no perfil do CS2.',tradeoff:'Usa espaço em disco; pode reduzir recompilações, sem garantir melhora de FPS.',presets:Object.freeze([])}),
  Object.freeze({"key":"fxaa","id":276089202,"value":0,"label":"FXAA do driver desligado","reason":"Remove um efeito ou uma substituição forçada pelo driver no perfil do CS2 quando a leitura confirma que está ativo.","tradeoff":"Pode alterar a imagem. O efeito depende do renderizador e do suporte do driver; não garante FPS adicional.","presets":["recommended"],"requiresExisting":true}),
  Object.freeze({"key":"mfaa","id":10011052,"value":0,"label":"MFAA do driver desligado","reason":"Remove um efeito ou uma substituição forçada pelo driver no perfil do CS2 quando a leitura confirma que está ativo.","tradeoff":"Pode alterar a imagem. O efeito depende do renderizador e do suporte do driver; não garante FPS adicional.","presets":["recommended"],"requiresExisting":true}),
  Object.freeze({"key":"aaControl","id":276757595,"value":0,"label":"Antisserrilhado controlado pelo jogo","reason":"Remove um efeito ou uma substituição forçada pelo driver no perfil do CS2 quando a leitura confirma que está ativo.","tradeoff":"Pode alterar a imagem. O efeito depende do renderizador e do suporte do driver; não garante FPS adicional.","presets":["recommended"],"requiresExisting":true}),
  Object.freeze({"key":"anisoControl","id":282245910,"value":0,"label":"Filtragem anisotrópica controlada pelo jogo","reason":"Remove um efeito ou uma substituição forçada pelo driver no perfil do CS2 quando a leitura confirma que está ativo.","tradeoff":"Pode alterar a imagem. O efeito depende do renderizador e do suporte do driver; não garante FPS adicional.","presets":["recommended"],"requiresExisting":true}),
  Object.freeze({"key":"ambientOcclusion","id":6714153,"value":0,"label":"Oclusão ambiente do driver desligada","reason":"Remove um efeito ou uma substituição forçada pelo driver no perfil do CS2 quando a leitura confirma que está ativo.","tradeoff":"Pode alterar a imagem. O efeito depende do renderizador e do suporte do driver; não garante FPS adicional.","presets":["recommended"],"requiresExisting":true}),
  Object.freeze({key:'aaGamma',id:0x107d639d,value:0,label:'Correção de gama do antisserrilhado desligada',reason:'Mantém o antisserrilhado do driver sem efeito adicional, como no perfil recomendado.',tradeoff:'O jogo controla o antisserrilhado; confira a imagem se usar outro renderizador.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'aaTransparency',id:0x10fc2d9c,value:0,label:'Antisserrilhado de transparência desligado',reason:'Evita forçar uma etapa de antisserrilhado pelo driver.',tradeoff:'Pode mudar a aparência de elementos transparentes em jogos que aceitam esse override.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'negativeLodBias',id:0x0019bb68,value:0,label:'Viés negativo de textura permitido',reason:'Corresponde à opção Allow do perfil mostrado; o jogo mantém o controle da textura.',tradeoff:'Pode causar cintilação em algumas superfícies; restaure o valor anterior se notar artefatos.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'threadedOptimization',id:0x20c1221e,value:0,label:'Otimização segmentada em automático',reason:'Mantém a decisão de paralelismo do driver em Auto.',tradeoff:'Aplica-se a OpenGL; não promete ganho em DirectX/Vulkan.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'vulkanPresent',id:0x20d690f8,value:2,label:'Apresentação Vulkan/OpenGL em automático',reason:'Mantém a seleção de apresentação sob controle do driver.',tradeoff:'Só afeta jogos que usam as APIs Vulkan ou OpenGL.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'tripleBuffer',id:0x20fdd1f9,value:0,label:'Buffer triplo desligado',reason:'Remove o buffer triplo forçado pelo driver no perfil CS2.',tradeoff:'Pode mudar o comportamento de sincronização vertical em OpenGL.',presets:Object.freeze(['recommended']),requiresExisting:true}),
  Object.freeze({key:'lowLatency',id:0x007ba09e,value:1,label:'Modo de baixa latência ligado (1 quadro)',reason:'Limita a fila do driver a um quadro no perfil CS2, opção pública equivalente ao modo On.',tradeoff:'O NVIDIA Reflex é controlado pelo jogo e coordena a fila de outra forma. Compare as opções no CS2 e não presuma benefício adicional do override do driver.',presets:Object.freeze(['recommended'])})
]);
const IDS = NVIDIA_SETTINGS.map(x=>x.id);
const object = x=>x&&typeof x==='object'&&!Array.isArray(x);
const uint = x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
const clone = x=>JSON.parse(JSON.stringify(x));
const journalDigest=record=>{const {sha256,...data}=record;return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');};
export const NVIDIA_TEXTURE_KEYS=Object.freeze(['anisotropicSample','anisotropicFilter','trilinear']);
function extras(value=[]){const allowed=[...new Set([...NVIDIA_TEXTURE_KEYS,'shaderCache','lowLatencyUltra',...NVIDIA_DRIVER_KEYS])];if(!Array.isArray(value)||value.length>allowed.length||new Set(value).size!==value.length||value.some(key=>!allowed.includes(key)))throw Error('Seleção NVIDIA adicional inválida.');return allowed.filter(key=>value.includes(key));}
function preset(value='performance') {if(!['performance','competitive','texture','custom','recommended'].includes(value))throw new Error('Preset NVIDIA inválido.');return value;}
function snapshot(input,allowLegacy=false) {
  if(!object(input)||input.supported!==true||input.application!==APPLICATION||!uint(input.driverVersion)||typeof input.branch!=='string'||input.branch.length>64||!object(input.profile)||!Array.isArray(input.settings)||(input.settings.length!==IDS.length&&!(allowLegacy&&[4,7,8].includes(input.settings.length))))throw new Error('O driver retornou um inventário NVIDIA inválido.');
  const p=input.profile;
  if(typeof p.exists!=='boolean'||typeof p.predefined!=='boolean'||typeof p.name!=='string'||p.name.length>2048||!Array.isArray(p.applications)||p.applications.length>512||p.applications.some(x=>typeof x!=='string'||!x||x.length>2048)||!uint(p.settingCount)||(p.exists&&!p.name)||(!p.exists&&(p.name||p.applications.length)))throw new Error('O driver retornou um perfil NVIDIA inválido.');
  const settings=input.settings.map(s=>{
    if(!object(s)||!IDS.includes(s.id)||typeof s.recognized!=='boolean'||typeof s.exists!=='boolean'||s.type!==0||!uint(s.value)||!Number.isInteger(s.location)||s.location<0||s.location>3||typeof s.predefined!=='boolean'||typeof s.userOverride!=='boolean'||(s.userOverride&&(!s.exists||s.predefined||s.location!==0))||(!s.recognized&&s.exists))throw new Error('O driver retornou uma configuração NVIDIA inválida.');
    return {id:s.id,recognized:s.recognized,exists:s.exists,type:s.type,value:s.value,location:s.location,predefined:s.predefined,userOverride:s.userOverride};
  });
  if(new Set(settings.map(s=>s.id)).size!==settings.length)throw new Error('O inventário NVIDIA contém configurações duplicadas.');
  if([4,7,8,13].includes(settings.length)&&allowLegacy){const legacyLength=settings.length;if(settings.some(s=>!IDS.slice(0,legacyLength).includes(s.id)))throw Error('Inventário legado NVIDIA inválido.');for(const id of IDS.slice(legacyLength))settings.push({id,recognized:false,exists:false,type:0,value:0,location:3,predefined:false,userOverride:false});}
  return {supported:true,application:APPLICATION,driverVersion:input.driverVersion,branch:input.branch,profile:{exists:p.exists,name:p.name,predefined:p.predefined,applications:[...p.applications].sort((a,b)=>a.localeCompare(b)),settingCount:p.settingCount},settings:IDS.map(id=>settings.find(s=>s.id===id))};
}
function exclusive(profile) {
  if(!profile.exists)return true;
  const official=profile.predefined&&profile.name.toLowerCase()==='counter-strike 2';
  return profile.applications.length>0&&profile.applications.some(x=>x.toLowerCase()===APPLICATION)&&profile.applications.every(x=>x.toLowerCase()===APPLICATION||(official&&x.toLowerCase()==='csgos2.exe'));
}
function selected(state, name,extraKeys=[]) {
  const latencyUltra=extraKeys.includes('lowLatencyUltra');
  return NVIDIA_SETTINGS.filter(s=>s.presets.includes(name)||extraKeys.includes(s.key)||latencyUltra&&s.key==='lowLatency').filter(s=>{
    const current=state.settings.find(c=>c.id===s.id),target=latencyUltra&&s.key==='lowLatency'?2:s.value;
    return current.recognized&&(!s.requiresExisting||current.exists)&&(s.key==='shaderCache'?current.exists&&current.value===0:!current.exists||current.value!==target);
  }).map(s=>({id:s.id,value:latencyUltra&&s.key==='lowLatency'?2:s.value}));
}
function textureOptions(state){return NVIDIA_SETTINGS.filter(setting=>NVIDIA_TEXTURE_KEYS.includes(setting.key)).map(rule=>{const before=state.settings.find(item=>item.id===rule.id);return {key:rule.key,id:rule.id,label:rule.label,value:rule.value,before,recognized:before.recognized,needed:before.recognized&&(!before.exists||before.value!==rule.value),reason:rule.reason,tradeoff:rule.tradeoff};});}
export function nvidiaFingerprint(state, name='performance') {return crypto.createHash('sha256').update(JSON.stringify({format:FORMAT,preset:preset(name),snapshot:snapshot(state)})).digest('hex');}
function sameRestored(actual,before) {return before.userOverride?actual.userOverride&&actual.value===before.value:!actual.userOverride;}
function sameProfile(a,b){return a.exists===b.exists&&(!a.exists||(a.name===b.name&&a.predefined===b.predefined&&JSON.stringify(a.applications)===JSON.stringify(b.applications)));}

export function createNvidia({dataDirectory,workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-nvidia.exe'),runWorker,isGameRunning=async()=>false}={}) {
  if(typeof dataDirectory!=='string'||!path.isAbsolute(dataDirectory))throw new Error('A pasta NVIDIA precisa ser absoluta.');
  if(typeof workerPath!=='string'||!path.isAbsolute(workerPath)||path.basename(workerPath)!=='csboost-nvidia.exe')throw new Error('Caminho do worker NVIDIA inválido.');
  if(runWorker!==undefined&&typeof runWorker!=='function')throw new Error('Adaptador NVIDIA inválido.');
  if(typeof isGameRunning!=='function')throw new Error('Monitor do CS2 inválido.');
  const journalPath=path.join(dataDirectory,'nvidia-restore.json');
  let queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  async function ensure() {await fs.mkdir(dataDirectory,{recursive:true});const st=await fs.lstat(dataDirectory);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('A pasta NVIDIA precisa ser um diretório regular.');}
  async function safeFile(file) {const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)throw new Error('O registro de recuperação NVIDIA precisa ser um arquivo regular válido.');}
  async function readJournal() {
    await ensure();
    try {
      await safeFile(journalPath);
      const j=JSON.parse(await fs.readFile(journalPath,'utf8'));
      if(!object(j)||j.format!==FORMAT||j.application!==APPLICATION||!['prepared','active'].includes(j.state)||typeof j.createdAt!=='string'||!Number.isFinite(Date.parse(j.createdAt))||!Array.isArray(j.settings))throw new Error('Registro de recuperação NVIDIA inválido; preserve esse arquivo para diagnóstico.');
      if(j.sha256!==undefined&&j.sha256!==journalDigest(j))throw new Error('Registro de recuperação NVIDIA alterado; preserve esse arquivo para diagnóstico.');
      if(j.ownerToken!==undefined)validateOwnerToken(j.ownerToken);
      const before=snapshot(j.before,true),name=preset(j.preset),extraKeys=extras(j.extraKeys),expected=selected(before,name,extraKeys);
      if(JSON.stringify(j.settings)!==JSON.stringify(expected))throw new Error('Os ajustes salvos para recuperação NVIDIA não correspondem ao catálogo.');
      if(j.after)snapshot(j.after,true);
      return {...j,before,preset:name,extraKeys};
    } catch(error) {if(error.code==='ENOENT')return null;throw error;}
  }
  async function writeJournal(j,initial=false) {
    await ensure();
    const {sha256,...data}=j,record={...data,sha256:journalDigest(data)};
    if(initial){const handle=await fs.open(journalPath,'wx',0o600);try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}return;}
    await safeFile(journalPath);
    const temporary=journalPath+'.'+crypto.randomUUID()+'.tmp';
    const handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(record,null,2));await handle.sync();}finally{await handle.close();}
    try{await fs.rename(temporary,journalPath);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
  }
  async function native(request) {
    if(runWorker)return await runWorker(clone(request));
    if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Perfis NVIDIA exigem Windows de 64 bits.');
    const st=await fs.lstat(workerPath).catch(()=>null);
    if(!st?.isFile()||st.isSymbolicLink())throw new Error('O worker NVIDIA não está incluído nesta build.');
    const payload=Buffer.from(JSON.stringify(request),'utf8');
    if(payload.length>65536)throw new Error('Solicitação NVIDIA excessiva.');
    const {stdout}=await execute(workerPath,['--request',payload.toString('base64')],{windowsHide:true,timeout:30000,maxBuffer:128*1024,encoding:'utf8',shell:false});
    let response;try{response=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw new Error('O worker NVIDIA não retornou uma resposta válida.');}
    if(!object(response)||response.ok!==true)throw new Error(typeof response?.error==='string'?response.error:'O driver NVIDIA recusou a operação.');
    return response.value;
  }
  async function read() {return snapshot(await native({operation:'read'}));}
  function restoreConflicts(state,journal){
    if(!journal)return [];
    const original=journal.before.profile,current=state.profile;
    if(original.exists){if(!sameProfile(current,original))return [{id:'profile',motivo:'O perfil NVIDIA mudou.'}];return journal.settings.filter(item=>{const actual=state.settings.find(entry=>entry.id===item.id),before=journal.before.settings.find(entry=>entry.id===item.id);return !sameRestored(actual,before)&&!(actual.userOverride&&actual.value===item.value);}).map(item=>({id:item.id,motivo:'O ajuste mudou fora do CSBOOST.'}));}
    if(!current.exists)return [];
    if(current.name!==OWN_PROFILE||current.predefined||JSON.stringify(current.applications)!==JSON.stringify([APPLICATION]))return [{id:'profile',motivo:'Outro perfil foi associado ao CS2.'}];
    const exact=current.settingCount===journal.settings.length&&journal.settings.every(item=>{const actual=state.settings.find(entry=>entry.id===item.id);return actual?.userOverride&&actual.value===item.value;});
    return exact?[]:[{id:'profile',motivo:'O perfil criado pelo CSBOOST recebeu alterações externas.'}];
  }
  function describe(state,name,journal,extraKeys=[]) {
    const changes=selected(state,name,extraKeys),canApply=exclusive(state.profile)&&!journal;
    const reason=journal?'Há ajustes NVIDIA com recuperação pendente. Restaure-os antes de aplicar outro preset.':exclusive(state.profile)?null:'O perfil NVIDIA contém executáveis fora do perfil CS2 permitido. Esses aplicativos não serão alterados.';
    return {supported:true,canApply,canDiscard:!!(journal?.sha256&&journal?.ownerToken),reason,...(journal?.ownerToken?{ownerToken:validateOwnerToken(journal.ownerToken)}:{}),snapshot:state,textureOptimization:textureOptions(state),shaderCache:state.settings.find(item=>item.id===0x00198FFF),pendingRestore:!!journal,restoreState:journal?.state??null,preview:{preset:name,source:'csboost-own-catalog',fingerprint:nvidiaFingerprint(state,name),profileName:state.profile.exists?state.profile.name:OWN_PROFILE,applications:state.profile.exists?state.profile.applications:[APPLICATION],createsProfile:!state.profile.exists,changes:changes.map(c=>{const rule=NVIDIA_SETTINGS.find(s=>s.id===c.id);return {key:rule.key,id:c.id,label:rule.label,value:c.value,before:state.settings.find(s=>s.id===c.id),reason:rule.reason,tradeoff:rule.tradeoff};}),unavailable:NVIDIA_SETTINGS.filter(s=>s.presets.includes(name)&&!state.settings.find(x=>x.id===s.id).recognized).map(s=>({key:s.key,label:s.label,reason:'O driver não enumera esse ajuste público como reconhecido.'})),unchanged:NVIDIA_SETTINGS.filter(s=>s.presets.includes(name)&&state.settings.find(x=>x.id===s.id).recognized&&!changes.some(c=>c.id===s.id)).map(s=>s.key),message:'Catálogo próprio para o perfil CS2. Ganho de FPS precisa ser medido no seu computador.'}};
  }
  async function inspect(options={}) {
    const name=preset(options?.preset??'performance'),extraKeys=extras(options?.extraKeys);
    let journal;
    try{journal=await readJournal();}catch(error){return {supported:false,canApply:false,pendingRestore:true,reason:error.message};}
    try{const state=await read();return {...describe(state,name,journal,extraKeys),conflicts:restoreConflicts(state,journal)};}catch(error){return {supported:false,canApply:false,pendingRestore:!!journal,restoreState:journal?.state??null,reason:error.message};}
  }
  async function apply(request) {return serial(async()=>{
    const ownerToken=validateOwnerToken(request?.ownerToken);
    if(!object(request)||typeof request.previewFingerprint!=='string'||!(/^[a-f\d]{64}$/).test(request.previewFingerprint))throw new Error('Abra a prévia NVIDIA antes de aplicar.');
    const name=preset(request.preset),extraKeys=extras(request.extraKeys);
    if(await readJournal())throw new Error('Restaure os ajustes NVIDIA anteriores antes de aplicar outro preset.');
    if(await isGameRunning())throw new Error('Feche o CS2 antes de alterar o perfil NVIDIA.');
    const before=await read();
    if(!exclusive(before.profile))throw new Error('O perfil NVIDIA contém executáveis fora do perfil CS2 permitido.');
    if(nvidiaFingerprint(before,name)!==request.previewFingerprint)throw new Error('Conflito: as configurações NVIDIA mudaram desde a prévia. Atualize a prévia.');
    const settings=selected(before,name,extraKeys);
    if(!settings.length)return {...describe(before,name,null,extraKeys),changed:false};
    const journal={format:FORMAT,...(ownerToken?{ownerToken}:{}),application:APPLICATION,state:'prepared',preset:name,extraKeys,createdAt:new Date().toISOString(),before,settings,after:null};
    await writeJournal(journal,true);
    const result=await native({operation:'apply',preset:name,before,settings});
    const after=snapshot(result?.after);
    if(!exclusive(after.profile)||!after.profile.exists||(before.profile.exists?(after.profile.name!==before.profile.name||after.profile.predefined!==before.profile.predefined||JSON.stringify(after.profile.applications)!==JSON.stringify(before.profile.applications)):(after.profile.name!==OWN_PROFILE||after.profile.predefined||JSON.stringify(after.profile.applications)!==JSON.stringify([APPLICATION]))))throw new Error('O driver retornou um perfil NVIDIA inesperado após aplicar. A recuperação permanece pendente.');
    for(const setting of settings){const actual=after.settings.find(x=>x.id===setting.id);if(!actual.userOverride||actual.value!==setting.value)throw new Error('O driver não confirmou o ajuste NVIDIA. A recuperação permanece pendente.');}
    await writeJournal({...journal,state:'active',after});
    return {...describe(after,name,{...journal,state:'active'},extraKeys),changed:true};
  });}
  async function restore() {return serial(async()=>{
    const journal=await readJournal();
    if(!journal)return {restored:false,pendingRestore:false,message:'Não há ajustes NVIDIA anteriores salvos pelo CSBOOST.'};
    if(await isGameRunning())throw new Error('Feche o CS2 antes de restaurar o perfil NVIDIA.');
    const result=await native({operation:'restore',preset:journal.preset,before:journal.before,settings:journal.settings});
    const after=snapshot(result?.after),original=journal.before.profile;
    const conflictIds=Array.isArray(result?.conflicts)?result.conflicts:[],allSettings=[...journal.settings],restoredIds=allSettings.filter(item=>!conflictIds.includes(item.id)&&!conflictIds.includes('profile')).map(item=>item.id);
    if(conflictIds.some(id=>id!=='profile'&&!journal.settings.some(item=>item.id===id)||typeof id!=='number'&&id!=='profile'))throw new Error('O driver retornou conflitos NVIDIA inválidos.');
    if(original.exists&&!conflictIds.includes('profile')){if(!after.profile.exists||after.profile.name!==original.name||after.profile.predefined!==original.predefined||JSON.stringify(after.profile.applications)!==JSON.stringify(original.applications))throw new Error('O driver não confirmou o perfil NVIDIA restaurado.');for(const setting of journal.settings)if(!conflictIds.includes(setting.id)&&!sameRestored(after.settings.find(x=>x.id===setting.id),journal.before.settings.find(x=>x.id===setting.id)))throw new Error('O driver não confirmou a restauração NVIDIA.');}
    else if(!conflictIds.includes('profile')&&after.profile.exists)throw new Error('O driver não confirmou a remoção do perfil NVIDIA criado pelo CSBOOST.');
    if(conflictIds.length){journal.settings=journal.settings.filter(item=>conflictIds.includes(item.id)||conflictIds.includes('profile'));journal.after=after;await writeJournal({...journal,state:'active'});return {...describe(after,journal.preset,journal),restored:true,changed:result.changed!==false,pendingRestore:true,restoredItems:restoredIds,preserved:conflictIds.map(id=>({id,motivo:'O valor foi alterado depois do ajuste.',valorAtual:id==='profile'?after.profile:after.settings.find(item=>item.id===id)}))};}
    await safeFile(journalPath);await fs.unlink(journalPath);
    return {...describe(after,journal.preset,null),restored:true,changed:result.changed!==false,pendingRestore:false};
  });}
  async function discardBackup(token){return serial(async()=>{if(await isGameRunning())throw Error('Feche o CS2 antes de descartar o backup NVIDIA.');const journal=await readJournal();if(!journal)throw Error('Não há backup NVIDIA para descartar.');if(!journal.sha256||!journal.ownerToken)throw Error('Este backup antigo não tem hash e identificação de propriedade; restaure-o manualmente.');consumeDiscardToken('nvidia',token,journal.ownerToken);const current=await read(),values=journal.settings.map(item=>({id:item.id,anterior:journal.before.settings.find(setting=>setting.id===item.id),aplicado:item.value,atual:current.settings.find(setting=>setting.id===item.id)}));const latest=await readJournal();if(!latest||latest.sha256!==journal.sha256)throw Error('O backup mudou durante a confirmação; nada foi descartado.');if(JSON.stringify(await read())!==JSON.stringify(current))throw Error('O perfil NVIDIA mudou durante a confirmação; backup preservado.');await appendDiscardAudit(dataDirectory,{module:'nvidia',ownerToken:journal.ownerToken,values});const final=await readJournal();if(!final||final.sha256!==journal.sha256||JSON.stringify(await read())!==JSON.stringify(current))throw Error('O backup ou o perfil NVIDIA mudou durante a confirmação; nada foi descartado.');await fs.unlink(journalPath);return {discarded:true,module:'nvidia',items:values.length};});}
  return {inspect,apply,restore,discardBackup,journalPath};
}
