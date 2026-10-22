import {BROWSER_POLICIES,availableBrowserPolicies,isBrowserPolicy,BROWSER_POLICY_NOTE} from './browser-policies.mjs';
import {DESKTOP_KEY,DESKTOP_ITEMS,runDesktopPreference} from './desktop-preferences.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateOwnerToken} from './owned-state.mjs';
import {consumeDiscardToken,appendDiscardAudit} from './discard-confirmation.mjs';
import {readSystemInventory} from './system-worker.mjs';
const GAMEBAR='Software\\Microsoft\\GameBar',DVR='Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',GPU='Software\\Microsoft\\DirectX\\UserGpuPreferences';
const LAYERS='Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
const WINDOWS_IDS=['gameMode','gpu','capture','fso',...DESKTOP_ITEMS.map(item=>item.id),...BROWSER_POLICIES.map(item=>item.id)];
const validGameExe=value=>typeof value==='string'&&value.length<=32767&&path.win32.isAbsolute(value)&&!/[\x00-\x1f]/.test(value)&&!value.split(/[\\/]/).includes('..')&&/[\\/]game[\\/]bin[\\/]win64[\\/]cs2\.exe$/i.test(value);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const recordHash=record=>{const {sha256,...data}=record;return hash(data);};
const same=(a,b)=>a?.exists===b?.exists&&(!a?.exists||(a.type===b.type&&a.data===b.data));
const allowedTypes=['DWord','String'];

// Fixed HKCU scope. No renderer-provided registry paths, PowerShell or scripts.
export async function runUserRegistry(operation,{read=readSystemInventory}={}){
  if(typeof read!=='function')throw new Error('Adaptador do Registro nativo inválido.');
  if(!operation||typeof operation!=='object'||Array.isArray(operation))throw new Error('Operação do Windows inválida.');
  const {action,key,name,value}=operation;
  const expectedKeys=action==='write'?['action','key','name','value']:['action','key','name'];
  if(Object.keys(operation).sort().join('|')!==expectedKeys.sort().join('|'))throw new Error('Operação do Windows inválida.');
  if(!['read','write','remove'].includes(action)||!(isBrowserPolicy(key,name)||(key===GAMEBAR&&name==='AutoGameModeEnabled')||(key===DVR&&name==='AppCaptureEnabled')||([GPU,LAYERS].includes(key)&&validGameExe(name))))throw new Error('Operação do Windows inválida.');
  if(action==='write'&&(!value||typeof value!=='object'||Array.isArray(value)||!allowedTypes.includes(value.type)||(value.type==='DWord'&&(!Number.isInteger(value.data)||value.data<0||value.data>4294967295))||(value.type==='String'&&(typeof value.data!=='string'||value.data.length>32767||value.data.includes('\0')))))throw new Error('Valor do Windows inválido.');
  try{
    const result=await read({operation:'registry',action,key,name,...(action==='write'?{value:{type:value.type,data:value.data}}:{})});
    if(action==='read'){
      const invalidShape=!result||typeof result!=='object'||Array.isArray(result)||typeof result.exists!=='boolean';
      const invalidData=result?.exists&&(!allowedTypes.includes(result.type)||(result.type==='DWord'&&(!Number.isInteger(result.data)||result.data<0||result.data>0xffffffff))||(result.type==='String'&&typeof result.data!=='string'));
      const unexpectedMissingData=result?.exists===false&&Object.keys(result).some(field=>field!=='exists');
      if(invalidShape||invalidData||unexpectedMissingData)throw new Error('Resposta do Registro inválida.');
      return result;
    }
    if(result?.changed!==true)throw new Error('A escrita nativa não foi confirmada.');
    return null;
  }
  catch{throw new Error('O Windows não permitiu consultar ou alterar esta preferência. Nenhum sucesso foi presumido; verifique a restauração se houver backup.');}
}
export function highPerformanceGpuValue(before){
  if(before.exists&&before.type!=='String')throw new Error('A preferência de GPU tem um tipo inesperado.');
  const pairs=before.exists?before.data.split(';').map(item=>item.trim()).filter(Boolean):[];
  const filtered=pairs.filter(item=>!/^GpuPreference=/i.test(item));filtered.unshift('GpuPreference=2');
  return {exists:true,type:'String',data:filtered.join(';')+';'};
}
export function withFullscreenFlag(before){
  if(before.exists&&(before.type!=='String'||typeof before.data!=='string'||before.data.length>8192))throw Error('A preferência de tela cheia tem um tipo ou tamanho inesperado.');
  const flag='DISABLEDXMAXIMIZEDWINDOWEDMODE',text=before.exists?before.data:'';
  if(text.split(/\s+/).some(value=>value.toUpperCase()===flag))return {...before};
  return {exists:true,type:'String',data:(text.trim().startsWith('~')?text.trim():'~ '+text.trim()).trim()+' '+flag};
}
export function createWindowsTuning({directory,system,registry:registryAdapter=runUserRegistry,preferences=registryAdapter===runUserRegistry?runDesktopPreference:null,browserInventory=registryAdapter===runUserRegistry?()=>readSystemInventory({operation:'browserInventory'}):null}){
  const registry=request=>request.key===DESKTOP_KEY?preferences(request):registryAdapter(request);
  const file=path.join(directory,'windows-restore.json');let queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  async function catalog(){const game=await system.refreshSteam();let browsers={};try{browsers=await browserInventory?.();}catch{}return [
    ...availableBrowserPolicies(browsers).map(item=>({...item,description:item.description+' '+BROWSER_POLICY_NOTE})),
    ...(preferences?DESKTOP_ITEMS:[]),
    {id:'gameMode',name:'Modo de Jogo do Windows',description:'Ativa o modo de jogo. Pode ajudar na disputa por recursos com outros aplicativos.',key:GAMEBAR,valueName:'AutoGameModeEnabled',after:{exists:true,type:'DWord',data:1}},
    ...(game.cs2Installed&&game.gamePath?[{id:'gpu',name:'GPU de alto desempenho para CS2',description:'Seleciona a preferência de GPU do Windows para o executável do CS2. Faz diferença principalmente em PCs com mais de uma GPU.',key:GPU,valueName:path.join(game.gamePath,'game','bin','win64','cs2.exe')}]:[]),
    {id:'capture',name:'Desativar captura da Game Bar',description:'Desativa gravação e captura pela Game Bar. Escolha apenas se você não usa esse recurso.',key:DVR,valueName:'AppCaptureEnabled',after:{exists:true,type:'DWord',data:0}},
    ...(game.cs2Installed&&game.gamePath?[{id:'fso',name:'Testar compatibilidade de tela cheia',description:'Desativa as otimizações de tela cheia somente para o CS2. Experimental: o resultado depende do Windows, driver e modo de apresentação; pode piorar.',key:LAYERS,valueName:path.join(game.gamePath,'game','bin','win64','cs2.exe')}]:[]),
  ];}
  async function readBackup(){try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)throw new Error('Registro de restauração inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.version!==1||!Array.isArray(record.changes)||record.changes.length>WINDOWS_IDS.length)throw new Error('Registro de restauração inválido.');if(record.sha256!==undefined&&record.sha256!==recordHash(record))throw new Error('Registro de restauração alterado; backup preservado.');if(record.ownerToken!==undefined)validateOwnerToken(record.ownerToken);return record;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function save(input){await fs.mkdir(directory,{recursive:true});const st=await fs.lstat(directory);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('Pasta de restauração inválida.');const {sha256,...data}=input;const record={...data,sha256:recordHash(data)};const temporary=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});await fs.rename(temporary,file);}
  async function inspect(){const items=[];for(const item of await catalog()){let value;try{value=await registry({action:'read',key:item.key,name:item.valueName});}catch(error){if(item.key===DESKTOP_KEY)continue;throw error;}const before=value.exists?{exists:true,type:value.type,data:value.data}:{exists:false};if(before.exists&&!allowedTypes.includes(before.type))throw new Error('Tipo de preferência do Windows não reconhecido: '+item.name);const after=item.id==='gpu'?highPerformanceGpuValue(before):item.id==='fso'?withFullscreenFlag(before):item.after;items.push({...item,before,after,needed:!same(before,after)});}const backup=await readBackup();const conflicts=backup?backup.changes.filter(change=>{const item=items.find(row=>row.id===change.id);return item&&!same(item.before,change.before)&&!same(item.before,change.after);}).map(change=>change.name):[];return {items,sourceSHA256:hash(items.map(({id,before})=>({id,before}))),active:backup?{...(backup.ownerToken?{ownerToken:validateOwnerToken(backup.ownerToken)}:{}),canDiscard:!!(backup.sha256&&backup.ownerToken),appliedAt:backup.appliedAt,changes:backup.changes.map(({id,name,before,after})=>({id,name,before,after})),conflicts}:null};}
  async function assertStopped(){if(await system.isGameRunning())throw new Error('Feche o CS2 antes de alterar ou restaurar as preferências do Windows.');}
  async function apply({ids,sourceSHA256,ownerToken:requestOwner}={}){return serial(async()=>{
    const ownerToken=validateOwnerToken(requestOwner);
    if(!Array.isArray(ids)||!ids.length||ids.length>WINDOWS_IDS.length||new Set(ids).size!==ids.length||ids.some(id=>!WINDOWS_IDS.includes(id)))throw new Error('Seleção de ajustes inválida.');
    await assertStopped();if(await readBackup())throw new Error('Restaure os ajustes anteriores antes de aplicar outro conjunto.');const preview=await inspect();if(preview.sourceSHA256!==sourceSHA256)throw new Error('As preferências do Windows mudaram. Atualize a prévia.');
    const changes=preview.items.filter(item=>ids.includes(item.id)&&item.needed);if(ids.some(id=>!preview.items.some(item=>item.id===id)))throw new Error('Ajuste não disponível neste PC.');if(!changes.length)return {...preview,changed:false};
    const record={version:1,...(ownerToken?{ownerToken}:{}),appliedAt:new Date().toISOString(),changes};await save(record);
    for(const change of changes){await assertStopped();const current=await registry({action:'read',key:change.key,name:change.valueName});if(!same(current,change.before))throw new Error('A preferência mudou durante a preparação. O registro de restauração foi mantido.');await registry({action:'write',key:change.key,name:change.valueName,value:change.after});if(!same(await registry({action:'read',key:change.key,name:change.valueName}),change.after))throw new Error('O Windows não confirmou '+change.name+'. O registro de restauração foi mantido.');}
    return {...await inspect(),changed:true};
  });}
  async function restore(){return serial(async()=>{
    await assertStopped();const record=await readBackup();if(!record)throw new Error('Não há preferências do Windows para restaurar.');const available=[...await catalog(),...BROWSER_POLICIES];
    const restored=[],preserved=[];
    for(const change of record.changes){
      const definition=available.find(item=>item.id===change.id);if(!definition||change.key!==definition.key||change.valueName!==definition.valueName||!change.before||!change.after||typeof change.before.exists!=='boolean'||(change.before.exists&&!allowedTypes.includes(change.before.type)))throw new Error('Registro de restauração não corresponde aos ajustes disponíveis.');
      const current=await registry({action:'read',key:change.key,name:change.valueName});
      if(same(current,change.before)){restored.push(change.name);continue;}
      if(!same(current,change.after)){preserved.push({id:change.id,motivo:'O valor foi alterado depois do ajuste.',valorAtual:current});continue;}
      await assertStopped();const latest=await registry({action:'read',key:change.key,name:change.valueName});
      if(!same(latest,change.after)){preserved.push({id:change.id,motivo:'O valor mudou durante a restauração.',valorAtual:latest});continue;}
      if(change.before.exists)await registry({action:'write',key:change.key,name:change.valueName,value:change.before});else await registry({action:'remove',key:change.key,name:change.valueName});
      const confirmed=await registry({action:'read',key:change.key,name:change.valueName});if(!same(confirmed,change.before))throw new Error('Não foi possível confirmar a restauração de '+change.name);restored.push(change.name);
    }
    if(preserved.length){record.changes=record.changes.filter(change=>preserved.some(item=>item.id===change.id));await save(record);}else await fs.unlink(file);
    return {restored:true,pendingRestore:preserved.length>0,restoredItems:restored,preserved,message:preserved.length?'Os itens sem conflito foram restaurados. Os demais valores e seus backups foram preservados.':'Todas as preferências anteriores foram restauradas.'};
  });}
  async function discardBackup(token){return serial(async()=>{await assertStopped();const record=await readBackup();if(!record)throw Error('Não há backup do Windows para descartar.');if(!record.sha256||!record.ownerToken)throw Error('Este backup antigo não tem hash e identificação de propriedade; restaure-o manualmente.');consumeDiscardToken('windows',token,record.ownerToken);const current=[];for(const change of record.changes)current.push({id:change.id,anterior:change.before,aplicado:change.after,atual:await registry({action:'read',key:change.key,name:change.valueName})});const latest=await readBackup();if(!latest||latest.sha256!==record.sha256)throw Error('O backup mudou durante a confirmação; nada foi descartado.');for(let index=0;index<record.changes.length;index++){const change=record.changes[index],verified=await registry({action:'read',key:change.key,name:change.valueName});if(!same(verified,current[index].atual))throw Error('Uma preferência mudou durante a confirmação; backup preservado.');}await appendDiscardAudit(directory,{module:'windows',ownerToken:record.ownerToken,values:current});const final=await readBackup();if(!final||final.sha256!==record.sha256)throw Error('O backup mudou durante a confirmação; nada foi descartado.');await fs.unlink(file);return {discarded:true,module:'windows',items:current.length};});}
  return {inspect,apply,restore,discardBackup};
}
