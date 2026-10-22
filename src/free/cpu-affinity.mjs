import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {BACKGROUND_APPS,runProcessOperation} from './process-tuning.mjs';
import {normalizeProcessInventory,limitProcessInventory,PROCESS_INVENTORY_WARNING} from './process-inventory.mjs';
const execute=promisify(execFile),HEX=/^[0-9a-f]{1,16}$/i;
const mask=value=>{if(typeof value!=='string'||!HEX.test(value)||BigInt('0x'+value)===0n)throw new Error('Máscara de CPU inválida.');return BigInt('0x'+value);};
const hex=value=>value.toString(16),canonical=value=>path.normalize(value).toLowerCase();
export function planCpuDistribution(topology){
  if(!topology?.supported||topology.groups!==1||!Array.isArray(topology.cores))return {supported:false,reason:'Distribuição requer um único grupo de processadores (até 64 lógicos).'};
  const systemMask=mask(topology.systemMask),cores=topology.cores.filter(core=>core.group===0).map(core=>({...core,bits:mask(core.mask)&systemMask})).filter(core=>core.bits);
  if(cores.length<4)return {supported:false,reason:'Distribuição experimental requer pelo menos 4 núcleos físicos.'};
  let union=0n;for(const core of cores){if(union&core.bits)throw new Error('Topologia de CPU ambígua.');union|=core.bits;}
  if(union!==systemMask)return {supported:false,reason:'A topologia não cobre todos os processadores disponíveis.'};
  // Lowest EfficiencyClass denotes intrinsically lower performance in the
  // Windows PROCESSOR_RELATIONSHIP contract; ties choose the last whole core.
  const background=[...cores].sort((a,b)=>a.efficiencyClass-b.efficiencyClass||(a.bits>b.bits?-1:1))[0];
  const gameMask=systemMask&~background.bits;if(!gameMask)return {supported:false,reason:'Não há núcleos suficientes para o jogo.'};
  return {supported:true,physicalCores:cores.length,gameCores:cores.length-1,systemMask:hex(systemMask),gameMask:hex(gameMask),backgroundMask:hex(background.bits),backgroundEfficiencyClass:background.efficiencyClass,
    reason:'Reserva um núcleo físico completo para aplicativos selecionados. Pode reduzir desempenho do jogo; compare o benchmark antes/depois.'};
}
export function createCpuAffinity({directory,system,workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-cpu.exe'),runWorker,processes}){
  const native=runWorker||(async args=>{try{const result=await execute(workerPath,args,{windowsHide:true,timeout:15000,maxBuffer:512*1024,encoding:'utf8'});const value=JSON.parse(result.stdout);if(value.status==='error')throw new Error(value.error);return value;}catch(error){throw new Error('O Windows não permitiu consultar/aplicar afinidade de CPU.');}});
  let installationContext;
  async function readSessionContext({refresh=false}={}){if(refresh)installationContext=undefined;installationContext??=Promise.resolve().then(()=>system.refreshSteam()).catch(error=>{installationContext=undefined;throw error;});return installationContext;}
  const processOperation=processes??(async request=>{const game=await readSessionContext();const gameExe=game?.cs2Installed&&typeof game.gamePath==='string'?path.join(game.gamePath,'game','bin','win64','cs2.exe'):undefined;return runProcessOperation(request,{gameExe});});
  function clearSessionContext(){installationContext=undefined;}
  const file=path.join(directory,'affinity-restore.json');let queue=Promise.resolve(),cachedTopology;
  const serial=fn=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
  async function read(){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024)throw new Error('Registro de afinidade inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.version!==1||!Array.isArray(record.entries)||record.entries.length>256)throw new Error('Registro de afinidade inválido.');for(const entry of record.entries){if(!Number.isInteger(entry.pid)||!['cs2',...BACKGROUND_APPS.map(app=>app.id.toLowerCase())].includes(entry.name?.toLowerCase())||typeof entry.startedAt!=='string'||!Number.isFinite(Date.parse(entry.startedAt))||!path.isAbsolute(entry.path))throw new Error('Identidade de afinidade inválida.');mask(entry.before);mask(entry.after);}return record;}catch(error){if(error.code==='ENOENT')return {version:1,entries:[]};throw error;}}
  async function save(record){await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Pasta de afinidade inválida.');const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(record,null,2),{mode:0o600});await fs.rename(temp,file);}
  async function inspect(){try{cachedTopology??=await native(['topology']);return {...planCpuDistribution(cachedTopology),active:(await read()).entries.length>0};}catch(error){return {supported:false,reason:error.message,active:(await read()).entries.length>0};}}
  async function apply({backgroundApps=[]}={}){return serial(async()=>{
    if(!Array.isArray(backgroundApps)||backgroundApps.some(id=>!BACKGROUND_APPS.some(app=>app.id===id)))throw new Error('Aplicativos de CPU inválidos.');
    const plan=await inspect();if(!plan.supported)throw new Error(plan.reason);const game=await readSessionContext();if(!game.cs2Installed)throw new Error('CS2 não encontrado.');const gameExe=canonical(path.join(game.gamePath,'game','bin','win64','cs2.exe'));
    const listing=normalizeProcessInventory(await processOperation({action:'list'})),bounded=limitProcessInventory(listing.rows,row=>row?.name?.toLowerCase()==='cs2'&&typeof row.path==='string'&&canonical(row.path)===gameExe),rows=bounded.rows,record=await read(),warnings=listing.truncated||bounded.truncated?[PROCESS_INVENTORY_WARNING]:[];let applied=0;
    for(const row of rows){if(!row||!Number.isInteger(row.pid)||typeof row.path!=='string'||!path.isAbsolute(row.path)||typeof row.startedAt!=='string')continue;const isGame=row.name?.toLowerCase()==='cs2';if(isGame?canonical(row.path)!==gameExe:!backgroundApps.some(id=>id.toLowerCase()===row.name?.toLowerCase()))continue;
      if(record.entries.some(entry=>entry.pid===row.pid&&entry.startedAt===row.startedAt))continue;
      let current;try{current=await native(['get',String(row.pid)]);if(current.status!=='ok')continue;if(current.startedAt!==row.startedAt||canonical(current.path)!==canonical(row.path))continue;
        if(mask(current.mask)!==mask(current.systemMask)){warnings.push(row.name+': afinidade personalizada preservada.');continue;}
      }catch(error){warnings.push(row.name+': '+error.message);continue;}
      const after=isGame?plan.gameMask:plan.backgroundMask;if(mask(after)===mask(current.mask))continue;
      const entry={pid:row.pid,name:row.name,path:current.path,startedAt:current.startedAt,before:current.mask,after,applied:false};record.entries.push(entry);await save(record);
      try{const changed=await native(['set',String(entry.pid),entry.startedAt,Buffer.from(entry.path).toString('base64'),entry.before,entry.after]);if(changed.status==='changed'){applied++;entry.applied=true;await save(record);}else warnings.push(entry.name+': afinidade preservada ('+changed.status+').');}catch(error){warnings.push(entry.name+': '+error.message);}
    }
    return {applied,totalApplied:record.entries.filter(entry=>entry.applied).length,totalRecorded:record.entries.length,warnings,plan};
  });}
  async function restore(){return serial(async()=>{const record=await read(),pending=[];let restored=0,preserved=0;
    for(const entry of [...record.entries].reverse()){try{const result=await native(['set',String(entry.pid),entry.startedAt,Buffer.from(entry.path).toString('base64'),entry.after,entry.before]);if(result.status==='changed')restored++;else if(['exited','replaced','conflict'].includes(result.status))preserved++;else throw new Error('Restauração de afinidade não confirmada.');}catch{pending.push(entry);}}
    if(pending.length){await save({...record,entries:pending.reverse()});throw new Error(`${pending.length} processos ainda precisam restaurar a afinidade.`);}await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});return {restored,preserved};
  });}
  async function isGameFocused(){const game=await readSessionContext();if(!game.cs2Installed)return false;const expected=path.join(game.gamePath,'game','bin','win64','cs2.exe');return (await native(['focused',Buffer.from(expected).toString('base64')])).focused===true;}
  return {inspect,apply,restore,isGameFocused,readSessionContext,clearSessionContext};
}
