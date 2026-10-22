import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {normalizeProcessInventory,limitProcessInventory,PROCESS_INVENTORY_WARNING,externalGovernorConflict} from './process-inventory.mjs';

// Own session algorithm using public Windows counters/APIs. No Bitsum code.
// Cloud-sync clients are eligible only after the same sustained CPU-pressure
// checks as browsers. Any priority change is scoped to this exact process
// instance and restored when pressure or the focused game session ends.
export const ADAPTIVE_APPS=Object.freeze(['chrome','msedge','firefox','brave','opera','vivaldi','OneDrive','Dropbox','GoogleDriveFS','steamwebhelper']);
export const ADAPTIVE_PROCESS_DEFAULTS=Object.freeze({
  maxContinuousReductionMs:60_000,
  reapplicationWindowMs:600_000,
  maxReductionsPerProcess:3,
  backoffBaseMs:30_000,
  backoffMultiplier:2,
  maxBackoffMs:300_000,
  historyLimit:256
});
const allowed=new Set(ADAPTIVE_APPS.map(name=>name.toLowerCase()));
const canonical=value=>path.normalize(value).toLowerCase();
const key=row=>`${row.pid}|${row.startedAt}|${canonical(row.path)}`;
const identity=row=>row&&Number.isInteger(row.pid)&&row.pid>0&&typeof row.path==='string'&&path.isAbsolute(row.path)&&typeof row.startedAt==='string'&&Number.isFinite(Date.parse(row.startedAt));
const power=value=>value&&[0,1].includes(value.control)&&[0,1].includes(value.state);

export function validateAdaptiveProcessOptions(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Proteção contra oscilações inválida.');
  const keys=Object.keys(input);
  if(keys.some(name=>!['maxReductionsPerProcess','reapplicationWindowMs','backoffBaseMs'].includes(name)))throw new Error('Proteção contra oscilações inválida.');
  const options={
    maxReductionsPerProcess:input.maxReductionsPerProcess??ADAPTIVE_PROCESS_DEFAULTS.maxReductionsPerProcess,
    reapplicationWindowMs:input.reapplicationWindowMs??ADAPTIVE_PROCESS_DEFAULTS.reapplicationWindowMs,
    backoffBaseMs:input.backoffBaseMs??ADAPTIVE_PROCESS_DEFAULTS.backoffBaseMs
  };
  if(![2,3,4].includes(options.maxReductionsPerProcess)||![300_000,600_000,900_000].includes(options.reapplicationWindowMs)||![15_000,30_000,60_000].includes(options.backoffBaseMs))throw new Error('Proteção contra oscilações fora das opções disponíveis.');
  return options;
}

function validHistoryEntry(entry){
  return identity(entry)&&allowed.has(entry.name?.toLowerCase())&&Array.isArray(entry.appliedAt)&&entry.appliedAt.length<=4&&entry.appliedAt.every(Number.isFinite)&&
    (entry.nextAllowedAt===undefined||Number.isFinite(entry.nextAllowedAt))&&
    (entry.lastDecision===undefined||entry.lastDecision===null||typeof entry.lastDecision==='string'&&entry.lastDecision.length<=160);
}

function reapplicationReport(record,options,at){
  const processes=(record.reapplicationHistory||[]).map(item=>{
    const recent=item.appliedAt.filter(timestamp=>at-timestamp<=options.reapplicationWindowMs);
    const count=recent.length;
    return {pid:item.pid,name:item.name,count,limit:options.maxReductionsPerProcess,windowMs:options.reapplicationWindowMs,remaining:Math.max(0,options.maxReductionsPerProcess-count),nextAllowedAt:Number.isFinite(item.nextAllowedAt)&&item.nextAllowedAt>at?item.nextAllowedAt:null};
  }).filter(item=>item.count>0||item.nextAllowedAt!==null);
  return {maxReductionsPerProcess:options.maxReductionsPerProcess,windowMs:options.reapplicationWindowMs,backoffBaseMs:options.backoffBaseMs,processes};
}

export function createAdaptiveProcesses({directory,system,processes,now=()=>Date.now()}){
  const file=path.join(directory,'adaptive-restore.json');let previous=null,pressure=0;
  const streaks=new Map(),blocked=new Set(),events=[];let priorExternalGovernor=false;
  const event=(name,action)=>{events.push({at:new Date(now()).toISOString(),name,action});if(events.length>32)events.shift();};

  // `power` is accepted only to recover v1 journals from older builds; new ticks create priority entries only.
  async function read(){
    try{
      const stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024)throw Error('Registro automático inválido.');
      const record=JSON.parse(await fs.readFile(file,'utf8'));
      if(record.version!==1||!Array.isArray(record.entries)||record.entries.length>64)throw Error('Registro automático inválido.');
      for(const entry of record.entries){
        if(!identity(entry)||!Number.isFinite(entry.at)||typeof entry.name!=='string'||!['priority','power'].includes(entry.kind)||
          entry.kind==='priority'&&(!allowed.has(entry.name.toLowerCase())||entry.before!=='Normal'||entry.after!=='BelowNormal')||
          entry.kind==='power'&&(entry.name.toLowerCase()!=='cs2'||!power(entry.before)||!power(entry.after)||entry.after.control!==1||entry.after.state!==0))throw Error('Identidade de recuperação automática inválida.');
      }
      if(record.reapplicationHistory!==undefined&&(!Array.isArray(record.reapplicationHistory)||record.reapplicationHistory.length>ADAPTIVE_PROCESS_DEFAULTS.historyLimit||!record.reapplicationHistory.every(validHistoryEntry)))throw Error('Contador de reaplicação automática inválido.');
      record.reapplicationHistory??=[];
      return record;
    }catch(error){if(error.code==='ENOENT')return {version:1,entries:[],reapplicationHistory:[]};throw error;}
  }

  async function save(record){
    await fs.mkdir(directory,{recursive:true});
    const stat=await fs.lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Pasta de recuperação automática inválida.');
    const temp=file+'.'+randomUUID()+'.tmp';
    await fs.writeFile(temp,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
    await fs.rename(temp,file);
  }

  function request(entry,restore=false){
    const before=restore?entry.after:entry.before,after=restore?entry.before:entry.after;
    if(entry.kind==='power'){
      if(!restore)throw Error('Ajuste de energia legado só pode ser restaurado.');
      return {action:'setPower',pid:entry.pid,name:entry.name,path:entry.path,startedAt:entry.startedAt,expectedControl:before.control,expectedState:before.state,control:after.control,state:after.state};
    }
    return {action:'set',pid:entry.pid,name:entry.name,path:entry.path,startedAt:entry.startedAt,expected:before,priority:after,...(!restore?{backgroundOnly:true}:{})};
  }

  function pruneHistory(record,options,at){
    let changed=false;
    record.reapplicationHistory=record.reapplicationHistory.filter(item=>{
      const priorLength=item.appliedAt.length;
      item.appliedAt=item.appliedAt.filter(timestamp=>at-timestamp<=options.reapplicationWindowMs);
      if(item.appliedAt.length!==priorLength)changed=true;
      const keep=item.appliedAt.length>0||(Number.isFinite(item.nextAllowedAt)&&item.nextAllowedAt>at);
      if(!keep)changed=true;
      return keep;
    });
    return changed;
  }

  function historyFor(record,row,options,at){
    let item=record.reapplicationHistory.find(candidate=>key(candidate)===key(row));
    if(!item){
      if(record.reapplicationHistory.length>=ADAPTIVE_PROCESS_DEFAULTS.historyLimit)return null;
      item={pid:row.pid,name:row.name,path:row.path,startedAt:row.startedAt,appliedAt:[],nextAllowedAt:0,lastDecision:null};
      record.reapplicationHistory.push(item);
    }
    item.appliedAt=item.appliedAt.filter(timestamp=>at-timestamp<=options.reapplicationWindowMs);
    return item;
  }

  function progressiveBackoff(count,options){
    return Math.min(ADAPTIVE_PROCESS_DEFAULTS.maxBackoffMs,options.backoffBaseMs*(ADAPTIVE_PROCESS_DEFAULTS.backoffMultiplier**Math.max(0,count-1)));
  }

  function logDecision(item,action,decisionKey=action){
    if(item.lastDecision===decisionKey)return false;
    item.lastDecision=decisionKey;event(item.name,action);return true;
  }

  async function release(record,predicate,warnings,options){
    let restored=0;
    for(const entry of [...record.entries].reverse()){
      if(!predicate(entry))continue;
      try{
        const result=await processes(request(entry,true));
        if(result?.status==='changed'){
          restored++;event(entry.name,'restaurado');
          if(entry.kind==='priority'){
            const item=historyFor(record,entry,options,now());
            if(item){
              // Migrate pre-counter active journals conservatively: restoring an old reduction consumes one slot.
              if(Number.isFinite(entry.at)&&!item.appliedAt.includes(entry.at))item.appliedAt.push(entry.at);
              item.appliedAt.sort((a,b)=>a-b);
              const count=item.appliedAt.length,delay=progressiveBackoff(Math.max(1,count),options);
              const budgetAt=count>=options.maxReductionsPerProcess?item.appliedAt[0]+options.reapplicationWindowMs+1:0;
              item.nextAllowedAt=Math.max(item.nextAllowedAt||0,now()+delay,budgetAt);
              item.lastDecision=null;
              event(entry.name,`recuo progressivo de ${Math.ceil(delay/1000)} s (${count}/${options.maxReductionsPerProcess} nesta janela)`);
            }else warnings.push(entry.name+': limite do registro de reaplicações atingido; a prioridade foi restaurada e novas reduções ficam suspensas nesta sessão.');
          }
        }else if(['conflict','replaced','exited'].includes(result?.status)){
          if(result.status==='conflict')blocked.add(key(entry));
          event(entry.name,'preferência externa preservada');
        }else throw Error('Restauração não confirmada.');
        record.entries.splice(record.entries.indexOf(entry),1);
        await save(record);
      }catch(error){warnings.push(entry.name+': '+error.message);}
    }
    return restored;
  }

  async function inspect(){
    const record=await read(),options=validateAdaptiveProcessOptions();
    return {active:record.entries.length>0,activeEntries:record.entries.length,events:[...events],reapplication:reapplicationReport(record,options,now())};
  }

  async function restore(){
    const record=await read(),warnings=[],options=validateAdaptiveProcessOptions();
    const restored=await release(record,()=>true,warnings,options);
    if(record.entries.length)throw Error('Restauração automática pendente: '+warnings.join(' '));
    await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    previous=null;pressure=0;streaks.clear();blocked.clear();
    return {restored,preserved:0};
  }

  async function tick(inputOptions={}){
    const options=validateAdaptiveProcessOptions(inputOptions);
    const record=await read(),warnings=[];let sample,inventory;
    try{
      sample=await processes({action:'sample'});inventory=normalizeProcessInventory(sample);
      if(!sample||typeof sample.supported!=='boolean'||typeof sample.gameFocused!=='boolean'||typeof sample.externalGovernor!=='boolean'||!Number.isInteger(sample.logicalProcessors)||sample.logicalProcessors<1||sample.logicalProcessors>64||![sample.totalMs,sample.idleMs].every(value=>Number.isFinite(value)&&value>=0)||sample.idleMs>sample.totalMs)throw Error('Amostra de CPU inválida.');
    }catch(error){
      const restored=await release(record,()=>true,warnings,options);
      previous=null;pressure=0;streaks.clear();
      return {automatic:true,applied:0,restored,totalApplied:record.entries.length,warnings:[error.message,...warnings],status:'unavailable',events:[...events],reapplication:reapplicationReport(record,options,now())};
    }

    const at=now();
    if(pruneHistory(record,options,at)&&record.entries.length+record.reapplicationHistory.length>0)await save(record);
    const installation=await system.refreshSteam(),gameExe=installation.cs2Installed&&installation.gamePath?canonical(path.join(installation.gamePath,'game','bin','win64','cs2.exe')):null;
    const matched=inventory.rows.filter(row=>identity(row)&&typeof row.name==='string'&&Number.isFinite(row.cpuMs)&&row.cpuMs>=0&&(allowed.has(row.name.toLowerCase())||row.name.toLowerCase()==='cs2'&&canonical(row.path)===gameExe));
    const bounded=limitProcessInventory(matched,row=>row.name.toLowerCase()==='cs2'&&canonical(row.path)===gameExe),rows=bounded.rows;
    if(inventory.truncated||bounded.truncated)warnings.push(PROCESS_INVENTORY_WARNING);
    const governorConflict=externalGovernorConflict({...sample,externalGovernor:sample.externalGovernor||inventory.externalGovernor,externalGovernorNames:inventory.externalGovernorNames});
    if(governorConflict&&!priorExternalGovernor)event('CPU automática',governorConflict.message);
    if(!governorConflict&&priorExternalGovernor)event('CPU automática','O gerenciador externo não foi detectado; o CSBOOST retomou a análise automática.');
    priorExternalGovernor=!!governorConflict;
    if(governorConflict)warnings.unshift(governorConflict.message);
    const focused=sample.supported&&sample.gameFocused&&!!gameExe&&!governorConflict&&rows.some(row=>row.name.toLowerCase()==='cs2');
    const delta=previous?sample.totalMs-previous.totalMs:0,idle=previous?sample.idleMs-previous.idleMs:0;
    const measured=delta>0&&idle>=0&&idle<=delta&&previous&&now()-previous.at>=500&&now()-previous.at<=10000;
    const utilization=measured?Math.max(0,Math.min(100,100*(1-idle/delta))):null;
    pressure=focused&&utilization!==null&&utilization>=80?pressure+1:0;
    const usage=new Map();
    for(const row of rows){
      const id=key(row),prior=previous?.rows.get(id),percent=measured&&prior!==undefined&&row.cpuMs>=prior?100*(row.cpuMs-prior)/delta:null;
      usage.set(id,percent);
      streaks.set(id,focused&&percent!==null&&percent>=Math.max(5,75/sample.logicalProcessors)?(streaks.get(id)||0)+1:0);
    }

    const restored=await release(record,entry=>!focused||entry.kind==='priority'&&(utilization===null||utilization<60||!rows.some(row=>key(row)===key(entry))||(usage.get(key(entry))??0)<2||now()-entry.at>=ADAPTIVE_PROCESS_DEFAULTS.maxContinuousReductionMs),warnings,options);
    let applied=0;
    if(focused){
      for(const row of rows){
        const id=key(row),game=row.name.toLowerCase()==='cs2';
        if(game||blocked.size>=256||blocked.has(id)||record.entries.some(entry=>key(entry)===id)||record.entries.length>=64)continue;
        if(pressure<2||(streaks.get(id)||0)<2||row.priority!=='Normal')continue;
        const item=historyFor(record,row,options,now());
        if(!item){warnings.push(row.name+': limite de identidades do registro atingido; ajuste preservado.');event(row.name,'limite de identidades atingido; redução não aplicada');continue;}
        const count=item.appliedAt.length;
        if(count>=options.maxReductionsPerProcess){
          const opensAt=item.appliedAt[0]+options.reapplicationWindowMs+1;
          item.nextAllowedAt=Math.max(item.nextAllowedAt||0,opensAt);
          const action=`limite de reaplicações atingido (${count}/${options.maxReductionsPerProcess} por ${options.reapplicationWindowMs/60_000} min)`;
          if(logDecision(item,action))await save(record);
          continue;
        }
        if((item.nextAllowedAt||0)>now()){
          const seconds=Math.ceil((item.nextAllowedAt-now())/1000),action=`recuo progressivo ativo (${seconds} s restantes; ${count}/${options.maxReductionsPerProcess})`;
          if(logDecision(item,action,`backoff:${item.nextAllowedAt}`))await save(record);
          continue;
        }
        const appliedAt=now();
        const entry={...row,kind:'priority',before:'Normal',after:'BelowNormal',at:appliedAt};
        delete entry.cpuMs;delete entry.memoryMB;delete entry.priority;
        item.appliedAt.push(appliedAt);item.lastDecision=null;
        record.entries.push(entry);await save(record);
        try{
          const result=await processes(request(entry));
          if(result?.status==='changed'){
            entry.applied=true;applied++;
            event(entry.name,`prioridade reduzida (${item.appliedAt.length}/${options.maxReductionsPerProcess} nesta janela)`);
            await save(record);
          }else if(['conflict','foreground','exited','replaced','unsupported'].includes(result?.status)){
            record.entries.splice(record.entries.indexOf(entry),1);
            item.appliedAt=item.appliedAt.filter(timestamp=>timestamp!==appliedAt);
            if(result.status==='conflict')blocked.add(id);
            event(entry.name,({conflict:'estado externo preservado; redução cancelada',foreground:'processo em primeiro plano; redução cancelada',exited:'processo encerrou; redução cancelada',replaced:'processo substituído; redução cancelada',unsupported:'operação não suportada; redução cancelada'})[result.status]);
            await save(record);
          }else throw Error('Ajuste automático não confirmado.');
        }catch(error){
          warnings.push(entry.name+': '+error.message);
          event(entry.name,'resultado incerto; contador reservado para evitar repetição');
        }
      }
    }

    previous={totalMs:sample.totalMs,idleMs:sample.idleMs,at:now(),rows:new Map(rows.map(row=>[key(row),row.cpuMs]))};
    for(const id of streaks.keys())if(!previous.rows.has(id))streaks.delete(id);
    return {automatic:true,applied,restored,totalApplied:record.entries.length,cpuPercent:utilization,status:governorConflict?'external-governor':!sample.supported?'unsupported':focused?'monitoring':'waiting-for-focus',warnings,events:[...events],reapplication:reapplicationReport(record,options,now())};
  }

  return {inspect,tick,restore};
}
