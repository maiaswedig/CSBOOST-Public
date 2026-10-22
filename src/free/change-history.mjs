import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const CHANGE_HISTORY_LIMIT=200;
const MAX_FILE_BYTES=512*1024;
const MODULES=Object.freeze({
  'boost-video':'Boost Máximo · Gráficos',
  'boost-windows':'Boost Máximo · Windows',
  'boost-nvidia':'Boost Máximo · NVIDIA',
  'boost-power':'Boost Máximo · Energia',
  video:'Vídeo do CS2',
  windows:'Preferências do Windows',
  nvidia:'Perfil NVIDIA',
  power:'Plano de energia',
  'game-config':'Configuração do CS2',
  'process-governor':'CPU automática da sessão',
  'session-power':'Energia da sessão',
  'shader-cache':'Cache de shaders',
});
const RESTORATION=new Set(['pending','restored','partial','preserved','discarded','failed','not-applicable']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const redact=value=>String(value??'')
  .replace(/\b[A-Z]:\\Users\\[^\\\r\n]+(?:\\[^\r\n,;]*)?/gi,'[caminho local omitido]')
  .replace(/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi,'[email omitido]')
  .replace(/\b\d{17}\b/g,'[ID Steam omitido]');

function cleanText(value,max=240){
  if(typeof value!=='string')return '';
  return redact(value.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max);
}

export function historyValue(value,depth=0){
  if(value===null||value===undefined)return 'Não informado';
  if(typeof value==='string')return cleanText(value);
  if(typeof value==='number'||typeof value==='boolean')return cleanText(String(value));
  if(depth>3)return 'Valor complexo';
  if(Array.isArray(value))return value.slice(0,8).map(item=>historyValue(item,depth+1)).join(' · ').slice(0,240);
  if(!object(value))return 'Não informado';
  if(value.exists===false)return 'Não existia';
  if(Object.hasOwn(value,'data'))return cleanText([value.type,value.data].filter(item=>item!==undefined&&item!==null).join(': '));
  if(Object.hasOwn(value,'value'))return historyValue(value.value,depth+1);
  if(Object.hasOwn(value,'name')&&Object.keys(value).length<5)return cleanText(value.name);
  return Object.entries(value).filter(([key])=>!/(?:steam|account|owner|token|path|pid|identity|profileid)/i.test(key)).slice(0,6).map(([key,item])=>cleanText(key,50)+': '+historyValue(item,depth+1)).join(' · ').slice(0,240)||'Valor complexo';
}

function normalizeEvent(input,{id,at}={}){
  if(!object(input)||!Object.hasOwn(MODULES,input.moduleId))throw Error('Evento do histórico inválido.');
  const action=['applied','restored','discarded','notice','failed'].includes(input.action)?input.action:'applied';
  const restoration=RESTORATION.has(input.restoration)?input.restoration:'not-applicable';
  const label=cleanText(input.label,120)||'Ajuste';
  const reason=cleanText(input.reason,320)||'Motivo não informado.';
  const previous=historyValue(input.previous);
  const applied=historyValue(input.applied);
  const timestamp=iso(input.at)||iso(at)||new Date().toISOString();
  const restoredAt=iso(input.restoredAt);
  return {id:id||crypto.randomUUID(),at:timestamp,moduleId:input.moduleId,module:MODULES[input.moduleId],action,label,previous,applied,reason,restoration,restoredAt};
}

function validateStored(value){
  if(!object(value)||value.version!==1||!Array.isArray(value.events)||value.events.length>CHANGE_HISTORY_LIMIT)throw Error('Histórico local inválido.');
  return value.events.map(event=>{
    if(!object(event)||typeof event.id!=='string'||!/^[-a-f\d]{32,36}$/i.test(event.id))throw Error('Evento local inválido.');
    const normalized=normalizeEvent(event,{id:event.id});
    if(normalized.at!==event.at||normalized.module!==event.module||normalized.action!==event.action||normalized.label!==event.label||normalized.previous!==event.previous||normalized.applied!==event.applied||normalized.reason!==event.reason||normalized.restoration!==event.restoration||normalized.restoredAt!==event.restoredAt)throw Error('Evento local inválido.');
    return normalized;
  });
}

export function createChangeHistory({directory,discardAuditDirectories=[],now=()=>new Date().toISOString(),limit=CHANGE_HISTORY_LIMIT}={}){
  if(typeof directory!=='string'||!path.isAbsolute(directory)||!Array.isArray(discardAuditDirectories)||!discardAuditDirectories.every(item=>typeof item==='string'&&path.isAbsolute(item))||typeof now!=='function'||!Number.isInteger(limit)||limit<1||limit>CHANGE_HISTORY_LIMIT)throw Error('Configuração do histórico inválida.');
  const file=path.join(directory,'change-history.json');let queue=Promise.resolve();
  const serial=operation=>{const result=queue.then(operation,operation);queue=result.catch(()=>{});return result;};
  async function verifyDirectory(create=false){
    if(create)await fs.mkdir(directory,{recursive:true});
    const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(await fs.realpath(directory)).toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('Pasta do histórico inválida.');
  }
  async function readOwn(){
    try{await verifyDirectory();const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)throw Error('Arquivo do histórico inválido.');return validateStored(JSON.parse(await fs.readFile(file,'utf8')));}
    catch(error){if(error.code==='ENOENT')return [];throw error;}
  }
  async function write(events){
    await verifyDirectory(true);
    let bounded=events.slice(-limit),bytes=Buffer.from(JSON.stringify({version:1,events:bounded},null,2));
    while(bytes.length>MAX_FILE_BYTES&&bounded.length){bounded=bounded.slice(Math.max(1,Math.ceil(bounded.length/8)));bytes=Buffer.from(JSON.stringify({version:1,events:bounded},null,2));}
    const old=await fs.lstat(file).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});if(old&&(!old.isFile()||old.isSymbolicLink()))throw Error('Destino do histórico inválido.');
    const temporary=file+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    try{await fs.rename(temporary,file);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
    return bounded;
  }
  async function record(input){return serial(async()=>{
    const id=typeof input?.dedupeKey==='string'?hash(input.dedupeKey).slice(0,32):undefined;
    const event=normalizeEvent(input,{id,at:now()}),events=await readOwn();
    if(events.some(row=>row.id===event.id))return event;
    await write([...events,event]);return event;
  });}
  async function resolve({moduleId,labels,status,reason,at=now()}={}){return serial(async()=>{
    if(!Object.hasOwn(MODULES,moduleId)||!RESTORATION.has(status)||status==='pending'||labels!==undefined&&(!Array.isArray(labels)||labels.some(label=>typeof label!=='string')))throw Error('Resultado de restauração inválido.');
    const selected=labels?new Set(labels.map(label=>cleanText(label,120))):null,events=await readOwn(),timestamp=iso(at)||new Date().toISOString();let updated=0;
    for(let index=events.length-1;index>=0;index--){const event=events[index];if(event.moduleId!==moduleId||!['pending','partial','preserved'].includes(event.restoration)||selected&&!selected.has(event.label))continue;events[index]={...event,restoration:status,restoredAt:timestamp,...(reason?{reason:cleanText(reason,320)}:{})};updated++;}
    if(updated)await write(events);return {updated};
  });}
  async function legacyDiscardEvents(){
    const rows=[];
    for(const source of discardAuditDirectories){
      try{
        const base=path.resolve(source),directoryStat=await fs.lstat(base);if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink()||(await fs.realpath(base)).toLowerCase()!==base.toLowerCase())continue;
        const target=path.join(base,'discard-audit.json'),stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)continue;
        const parsed=JSON.parse(await fs.readFile(target,'utf8'));if(!Array.isArray(parsed)||parsed.length>200)continue;
        for(const [rowIndex,row]of parsed.entries()){
          if(!object(row)||!Object.hasOwn(MODULES,row.module)||!iso(row.at)||!Array.isArray(row.values)||row.values.length>64)continue;
          for(const [valueIndex,item]of row.values.entries()){
            if(!object(item))continue;
            const label=cleanText(item.name||item.id,120)||'Ajuste';
            const sourceId=hash([base,row.at,row.module,rowIndex,valueIndex].join('\0')).slice(0,32);
            rows.push(normalizeEvent({moduleId:row.module,label,previous:item.anterior,applied:item.aplicado,action:'discarded',reason:'Backup descartado após confirmação explícita.',restoration:'discarded',restoredAt:row.at,at:row.at},{id:sourceId}));
          }
        }
      }catch{}
    }
    return rows;
  }
  async function list(){
    const events=await readOwn(),legacy=await legacyDiscardEvents(),merged=new Map();for(const event of [...legacy,...events])merged.set(event.id,event);
    return {capturedAt:iso(now())||new Date().toISOString(),limit,personalDataIncluded:false,events:[...merged.values()].sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id)).slice(0,limit)};
  }
  async function exportJson(){const report=await list();return JSON.stringify({version:1,product:'CSBOOST',exportedAt:report.capturedAt,personalDataIncluded:false,events:report.events},null,2);}
  return {record,resolve,list,exportJson,limit,file};
}
