import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAdaptiveProcesses,validateAdaptiveProcessOptions} from './adaptive-process.mjs';
import {normalizeProcessInventory,limitProcessInventory,PROCESS_INVENTORY_WARNING} from './process-inventory.mjs';
import {runWatcherOperation} from './watcher.mjs';
export const BACKGROUND_APPS=Object.freeze([{id:'chrome',name:'Google Chrome'},{id:'msedge',name:'Microsoft Edge'},{id:'firefox',name:'Mozilla Firefox'},{id:'brave',name:'Brave'},{id:'opera',name:'Opera / Opera GX'},{id:'vivaldi',name:'Vivaldi'},{id:'Discord',name:'Discord'},{id:'Spotify',name:'Spotify'},{id:'OneDrive',name:'OneDrive'},{id:'Dropbox',name:'Dropbox',note:'Pode atrasar a sincronização enquanto o CS2 estiver aberto.'},{id:'GoogleDriveFS',name:'Google Drive para computador',note:'Pode atrasar a sincronização enquanto o CS2 estiver aberto.'},{id:'steamwebhelper',name:'Interface da Steam'},{id:'Slack',name:'Slack'},{id:'Telegram',name:'Telegram'},{id:'Teams',name:'Microsoft Teams (clássico)'},{id:'ms-teams',name:'Microsoft Teams'},{id:'obs64',name:'OBS Studio',note:'Reduzir a prioridade ou reservar núcleos pode prejudicar gravação/transmissão. Deixe desmarcado enquanto estiver gravando.'}]);
const names=new Set(['cs2',...BACKGROUND_APPS.map(item=>item.id.toLowerCase())]);
const levels=new Set(['Normal','BelowNormal','AboveNormal']);
export function validateProcessPolicy(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Política de processos inválida.');
  const prioritizeGame=input.prioritizeGame??false,backgroundApps=input.backgroundApps??[],backgroundMemoryPriorityApps=input.backgroundMemoryPriorityApps??[],cpuDistribution=input.cpuDistribution??false,automatic=input.automatic??false;
  const validApps=ids=>Array.isArray(ids)&&ids.length<=BACKGROUND_APPS.length&&new Set(ids).size===ids.length&&ids.every(id=>BACKGROUND_APPS.some(item=>item.id===id));
  if(typeof prioritizeGame!=='boolean'||typeof cpuDistribution!=='boolean'||!validApps(backgroundApps)||!validApps(backgroundMemoryPriorityApps))throw new Error('Política de processos inválida.');
  if(typeof automatic!=='boolean'||automatic&&(prioritizeGame||backgroundApps.length||backgroundMemoryPriorityApps.length||cpuDistribution))throw new Error('Escolha o modo automático ou as opções manuais.');
  if(!automatic&&input.adaptiveOptions!==undefined)throw new Error('A proteção contra oscilações só pode ser configurada no modo automático.');
  return {prioritizeGame,backgroundApps,...(backgroundMemoryPriorityApps.length?{backgroundMemoryPriorityApps}:{}),...(cpuDistribution?{cpuDistribution:true}:{}),...(automatic?{automatic:true,adaptiveOptions:validateAdaptiveProcessOptions(input.adaptiveOptions)}:{})};
}
export async function runProcessOperation(request,{gameExe,workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-watcher.exe'),spawnImpl,timeoutMs=15000}={}){
  const action=request?.action;
  const exact=keys=>request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).sort().join('|')===[...keys].sort().join('|');
  if(action==='list'&&!exact(['action']))throw new Error('Operação de processo inválida.');
  if(!['list','set','getMemoryPriority','setMemoryPriority'].includes(action))throw new Error('Fallback nativo de processos suporta somente list, set e prioridade de memória.');
  const validIdentity=Number.isInteger(request.pid)&&request.pid>0&&names.has(request.name?.toLowerCase())&&typeof request.startedAt==='string'&&Number.isFinite(Date.parse(request.startedAt))&&typeof request.path==='string'&&path.win32.isAbsolute(request.path)&&!/[\x00-\x1f]/.test(request.path);
  if(action==='set'&&(!exact(['action','expected','name','path','pid','priority','startedAt'])||!validIdentity||!levels.has(request.priority)||!levels.has(request.expected)))throw new Error('Identidade ou prioridade de processo inválida.');
  if(action==='getMemoryPriority'&&(!exact(['action','name','path','pid','startedAt'])||!validIdentity||!backgroundIds.has(request.name.toLowerCase())))throw new Error('Identidade da prioridade de memória inválida.');
  if(action==='setMemoryPriority'&&(!exact(['action','expectedPriority','name','path','pid','priority','startedAt'])||!validIdentity||!backgroundIds.has(request.name.toLowerCase())||!validMemory(request.priority)||!validMemory(request.expectedPriority)))throw new Error('Identidade ou prioridade de memória inválida.');
  if(gameExe!==undefined&&(!path.win32.isAbsolute(gameExe)||!gameExe.toLowerCase().endsWith('\\game\\bin\\win64\\cs2.exe')||gameExe.split(/[\\/]/).includes('..')))throw new Error('Caminho do CS2 inválido para o worker de processos.');
  try{const stat=await fs.lstat(workerPath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error();return await runWatcherOperation({workerPath,gameExe,request,spawnImpl,timeoutMs});}
  catch{throw new Error('O Windows não permitiu consultar ou alterar a prioridade deste processo pelo worker nativo.');}
}
const normalized=value=>path.normalize(value).toLowerCase();
const backgroundIds=new Set(BACKGROUND_APPS.map(item=>item.id.toLowerCase()));
const validMemory=value=>Number.isInteger(value)&&value>=1&&value<=5;
const processKey=entry=>entry.pid+'|'+entry.startedAt+'|'+normalized(entry.path);
const entryKey=entry=>processKey(entry)+'|'+entry.kind;
function validEntry(entry){
  if(!entry||!Number.isInteger(entry.pid)||!names.has(entry.name?.toLowerCase())||typeof entry.path!=='string'||!path.isAbsolute(entry.path)||typeof entry.startedAt!=='string'||!Number.isFinite(Date.parse(entry.startedAt)))return false;
  if(entry.kind==='priority')return entry.name.toLowerCase()==='cs2'?(entry.before==='Normal'||entry.before==='BelowNormal')&&entry.after==='AboveNormal':backgroundIds.has(entry.name.toLowerCase())&&entry.before==='Normal'&&entry.after==='BelowNormal';
  if(entry.kind==='memoryPriority')return backgroundIds.has(entry.name.toLowerCase())&&validMemory(entry.before)&&validMemory(entry.after)&&entry.after===2;
  return false;
}
function processRequest(entry,restore=false){
  const expected=restore?entry.after:entry.before,desired=restore?entry.before:entry.after;
  if(entry.kind==='priority')return {action:'set',pid:entry.pid,name:entry.name,path:entry.path,startedAt:entry.startedAt,expected,priority:desired};
  return {action:'setMemoryPriority',pid:entry.pid,name:entry.name,path:entry.path,startedAt:entry.startedAt,expectedPriority:expected,priority:desired};
}
export function createProcessTuning({directory,system,processes,now=()=>Date.now()}){
  let installationContext;
  async function readSessionContext({refresh=false}={}){if(refresh)installationContext=undefined;installationContext??=Promise.resolve().then(()=>system.refreshSteam()).catch(error=>{installationContext=undefined;throw error;});return installationContext;}
  function clearSessionContext(){installationContext=undefined;}
  const processOperation=processes??(async request=>{const game=await readSessionContext();const gameExe=game?.cs2Installed&&typeof game.gamePath==='string'?path.join(game.gamePath,'game','bin','win64','cs2.exe'):undefined;return runProcessOperation(request,{gameExe});});
  const adaptive=createAdaptiveProcesses({directory,system:{refreshSteam:()=>readSessionContext()},processes:processOperation,now});
  const file=path.join(directory,'process-restore.json');let queue=Promise.resolve();
  const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
  async function read(){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024)throw new Error('Registro de processos inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.version!==1||!Array.isArray(record.entries)||record.entries.length>256)throw new Error('Registro de processos inválido.');for(const entry of record.entries)if(!validEntry(entry))throw new Error('Registro de processo inconsistente.');return record;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function save(record){await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Pasta de recuperação de processos inválida.');const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(record,null,2),{mode:0o600});await fs.rename(temp,file);}
  async function inventory(){const game=await readSessionContext();const target=game.cs2Installed?normalized(path.join(game.gamePath,'game','bin','win64','cs2.exe')):null;const listing=normalizeProcessInventory(await processOperation({action:'list'}));const rows=listing.rows.filter(row=>row&&Number.isInteger(row.pid)&&names.has(row.name?.toLowerCase())&&typeof row.path==='string'&&path.isAbsolute(row.path)&&typeof row.startedAt==='string'&&Number.isFinite(Date.parse(row.startedAt))&&(row.name.toLowerCase()!=='cs2'||!!target&&normalized(row.path)===target));const bounded=limitProcessInventory(rows,row=>row.name.toLowerCase()==='cs2');return {rows:bounded.rows,truncated:listing.truncated||bounded.truncated};}
  async function inspect(){const listed=await inventory(),rows=listed.rows,automatic=await adaptive.inspect();return {available:BACKGROUND_APPS.map(app=>({...app,instances:rows.filter(row=>row.name.toLowerCase()===app.id.toLowerCase()).length,memoryMB:rows.filter(row=>row.name.toLowerCase()===app.id.toLowerCase()).reduce((sum,row)=>sum+(Number(row.memoryMB)||0),0)})),warnings:listed.truncated?[PROCESS_INVENTORY_WARNING]:[],gameRunning:rows.some(row=>row.name.toLowerCase()==='cs2'),active:!!await read()||automatic.active,automatic};}
  async function apply(input){return serial(async()=>{
    const policy=validateProcessPolicy(input);if(policy.automatic)return adaptive.tick(policy.adaptiveOptions);const listed=await inventory(),rows=listed.rows,record=await read()||{version:1,appliedAt:new Date().toISOString(),entries:[]},warnings=listed.truncated?[PROCESS_INVENTORY_WARNING]:[],unavailable=new Set();let applied=0,planned=0;
    if(policy.prioritizeGame&&!rows.some(row=>row.name.toLowerCase()==='cs2'))warnings.push('O processo do CS2 não pôde ser acessado; sua prioridade não foi alterada.');
    async function applyEntry(row,kind){
      const id=entryKey({...row,kind});if(record.entries.some(entry=>entryKey(entry)===id)||unavailable.has(id))return;
      let before,after;
      if(kind==='priority'){
        const game=row.name.toLowerCase()==='cs2';if(game?!['Normal','BelowNormal'].includes(row.priority):row.priority!=='Normal')return;
        before=row.priority;after=game?'AboveNormal':'BelowNormal';
      }else{
        let current;try{current=await processOperation({action:'getMemoryPriority',pid:row.pid,name:row.name,path:row.path,startedAt:row.startedAt});}catch(error){warnings.push(row.name+': '+error.message);unavailable.add(id);return;}
        if(current?.status==='unsupported'){warnings.push(row.name+': prioridade de memória não está disponível ou não pôde ser lida; estado desconhecido, mantido.');unavailable.add(id);return;}
        if(current?.status!=='ok'||!validMemory(current.priority)){if(current?.status==='conflict'||current?.status==='exited'||current?.status==='replaced')return;warnings.push(row.name+': prioridade de memória desconhecida; mantida.');unavailable.add(id);return;}
        if(current.priority===2)return;before=current.priority;after=2;
      }
      if(record.entries.length>=256){warnings.push('Limite de ajustes desta sessão atingido; novas mudanças foram preservadas.');return;}
      const entry={pid:row.pid,name:row.name,path:row.path,startedAt:row.startedAt,kind,before,after,applied:false};record.entries.push(entry);planned++;await save(record);
      try{const result=await processOperation(processRequest(entry));if(result?.status==='changed'){applied++;entry.applied=true;await save(record);}else if(['conflict','exited','replaced','unsupported'].includes(result?.status)){record.entries.splice(record.entries.indexOf(entry),1);await save(record);if(result.status==='unsupported')unavailable.add(id);if(result.status==='conflict')warnings.push(row.name+': o estado mudou externamente; ajuste preservado.');}else warnings.push(row.name+': ajuste preservado ('+(result?.status||'desconhecido')+').');}
      catch(error){warnings.push(row.name+': '+error.message);}
    }
    for(const row of rows){const game=row.name.toLowerCase()==='cs2';if(game){if(policy.prioritizeGame)await applyEntry(row,'priority');continue;}
      const name=row.name.toLowerCase();if(policy.backgroundApps.some(id=>id.toLowerCase()===name))await applyEntry(row,'priority');
      if(policy.backgroundMemoryPriorityApps?.some(id=>id.toLowerCase()===name))await applyEntry(row,'memoryPriority');
    }
    return {planned,applied,totalApplied:record.entries.filter(entry=>entry.applied===true).length,totalRecorded:record.entries.length,warnings};
  });}
  async function restore(){return serial(async()=>{let adaptiveError;try{await adaptive.restore();}catch(error){adaptiveError=error;}const record=await read();if(!record){if(adaptiveError)throw adaptiveError;return {restored:0,preserved:0};}let restored=0,preserved=0;const pending=[];
    for(const entry of [...record.entries].reverse()){
      try{const result=await processOperation(processRequest(entry,true));if(result?.status==='changed')restored++;else if(['exited','replaced','conflict'].includes(result?.status))preserved++;else throw new Error('O Windows não confirmou a restauração.');}
      catch{pending.push(entry);}
    }
    if(pending.length){await save({...record,entries:pending.reverse()});throw new Error(String(pending.length)+' ajustes de processos ainda precisam restaurar. Tente encerrar a sessão novamente.');}
    await fs.unlink(file);if(adaptiveError)throw adaptiveError;return {restored,preserved};
  });}
  return {inspect,apply,restore,readSessionContext,clearSessionContext};
}
