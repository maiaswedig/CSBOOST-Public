import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import crypto from 'node:crypto';
import {validateOwnerToken} from './owned-state.mjs';
import {consumeDiscardToken,appendDiscardAudit} from './discard-confirmation.mjs';
import {renderConfig,validateSettings,buildLaunchArguments} from './profiles.mjs';
import {readSystemInventory} from './system-worker.mjs';

const runFile=promisify(execFile);
const GUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const windowsRoot=process.env.SystemRoot||'C:\\Windows';
const powercfg=path.join(windowsRoot,'System32','powercfg.exe');
const registry=path.join(windowsRoot,'System32','reg.exe');
async function command(file,args){try{return (await runFile(file,args,{windowsHide:true,timeout:15000,maxBuffer:1024*1024,encoding:'utf8'})).stdout;}catch(error){throw new Error(error.stderr?.trim()||`Não foi possível executar ${path.basename(file)}. Verifique as permissões do Windows.`);}}
async function exists(file){try{return(await fs.stat(file)).isFile();}catch{return false;}}
export function parseLibraryPaths(text){
  const result=[];
  const rx=/"path"\s*"((?:\\.|[^"\\])*)"/gi;
  for(const m of text.matchAll(rx)){result.push(m[1].replace(/\\\\/g,'\\').replace(/\\"/g,'"'));}
  const old=/"\d+"\s*"((?:[A-Za-z]:|\\\\)[^"\r\n]*)"/g;
  for(const m of text.matchAll(old))result.push(m[1].replace(/\\\\/g,'\\'));
  return [...new Set(result)];
}
export async function detectSteam(){
  let registryPath;
  try{const value=await command(registry,['query','HKCU\\Software\\Valve\\Steam','/v','SteamPath']);registryPath=value.match(/SteamPath\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();}catch{}
  const candidates=[registryPath,path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Steam'),path.join(process.env.ProgramFiles||'C:\\Program Files','Steam')].filter(Boolean);
  let steamPath;
  for(const candidate of candidates){if(await exists(path.join(candidate,'steam.exe'))){steamPath=await fs.realpath(candidate);break;}}
  if(!steamPath)return {installed:false,cs2Installed:false};
  const libraries=[steamPath];
  try{libraries.push(...parseLibraryPaths(await fs.readFile(path.join(steamPath,'steamapps','libraryfolders.vdf'),'utf8')));}catch{}
  for(const library of [...new Set(libraries)]){
    let installName='Counter-Strike Global Offensive';
    try{installName=(await fs.readFile(path.join(library,'steamapps','appmanifest_730.acf'),'utf8')).match(/"installdir"\s*"([^"\r\n]+)"/i)?.[1]||installName;}catch{}
    if(installName.includes('..')||/[\\/]/.test(installName))continue;
    const gamePath=path.join(library,'steamapps','common',installName);
    if(await exists(path.join(gamePath,'game','bin','win64','cs2.exe')))return {installed:true,steamPath,cs2Installed:true,gamePath:await fs.realpath(gamePath),cfgPath:path.join(await fs.realpath(gamePath),'game','csgo','cfg')};
  }
  return {installed:true,steamPath,cs2Installed:false};
}
export function parsePowerPlans(stdout,activeGuid){
  const plans=[];
  for(const row of stdout.split(/\r?\n/)){const match=row.match(/([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\s+\((.+)\)/i);if(match)plans.push({guid:match[1].toLowerCase(),name:match[2],active:match[1].toLowerCase()===String(activeGuid||'').toLowerCase()});}
  return plans;
}
export function createSystem({dataDirectory,run=command,detect=detectSteam,spawnImpl=spawn,checkGameRunning,readInventory=readSystemInventory}){
  if(typeof dataDirectory!=='string'||!path.isAbsolute(dataDirectory))throw new Error('A pasta de dados do sistema precisa ser absoluta.');
  const powerState=path.join(dataDirectory,'power-restore.json');
  const backups=path.join(dataDirectory,'config-backups');
  const profileJournal=path.join(dataDirectory,'profile-config-restore.json');
  const maxConfigBytes=1024*1024;
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const powerRecordHash=record=>{const {sha256,...data}=record;return hash(Buffer.from(JSON.stringify(data)));};
  const normalized=value=>process.platform==='win32'?path.normalize(value).toLowerCase():path.normalize(value);
  let queue=Promise.resolve();
  const serial=fn=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
  async function regularDirectory(directory,create=false){
    if(typeof directory!=='string'||!path.isAbsolute(directory))throw new Error('A pasta precisa ser um diretório regular absoluto.');
    const absolute=path.resolve(directory),root=path.parse(absolute).root,parts=path.relative(root,absolute).split(path.sep).filter(Boolean);
    let current=root;
    for(const part of parts){current=path.join(current,part);let stat;try{stat=await fs.lstat(current);}catch(error){if(error.code!=='ENOENT'||!create)throw error;try{await fs.mkdir(current);}catch(created){if(created.code!=='EEXIST')throw created;}stat=await fs.lstat(current);}
      if(!stat.isDirectory()||stat.isSymbolicLink()||normalized(await fs.realpath(current))!==normalized(current))throw new Error('A pasta precisa ser um diretório regular, sem links ou redirecionamentos.');
    }
    return absolute;
  }
  async function resolveGameCfg(game){if(!game.cs2Installed)throw new Error('CS2 não encontrado. Instale o jogo pela Steam e atualize a detecção.');if(typeof game.gamePath!=='string'||typeof game.cfgPath!=='string'||!path.isAbsolute(game.gamePath)||!path.isAbsolute(game.cfgPath))throw new Error('A instalação do CS2 não informou uma pasta cfg válida.');await regularDirectory(game.gamePath);await regularDirectory(game.cfgPath);const cfg=await fs.realpath(game.cfgPath),gameRoot=await fs.realpath(game.gamePath),expected=path.join(gameRoot,'game','csgo','cfg');if(normalized(cfg)!==normalized(expected))throw new Error('A pasta cfg precisa ser game/csgo/cfg na instalação do CS2.');return cfg;}
  async function configStat(target){const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink()||st.size>maxConfigBytes||normalized(await fs.realpath(target))!==normalized(path.resolve(target)))throw new Error('O destino csboost.cfg precisa ser um arquivo regular de até 1 MB, sem links.');return st;}
  async function readRegular(file,limit=maxConfigBytes){
    const stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit||normalized(await fs.realpath(file))!==normalized(path.resolve(file)))throw new Error(`O arquivo precisa ser regular, sem links, e respeitar o limite de ${limit===1048576?'1 MB':limit===65536?'64 KB':limit+' bytes'}.`);
    const handle=await fs.open(file,'r');
    try{
      const opened=await handle.stat();if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size>limit)throw new Error('O arquivo mudou durante a leitura.');
      const bytes=Buffer.alloc(limit+1);let position=0;
      while(position<bytes.length){const {bytesRead}=await handle.read(bytes,position,bytes.length-position,position);if(!bytesRead)break;position+=bytesRead;}
      if(position>limit)throw new Error('O arquivo excede o limite de 1 MB.');
      const final=await fs.lstat(file);if(!final.isFile()||final.isSymbolicLink()||final.dev!==stat.dev||final.ino!==stat.ino||final.size!==position||normalized(await fs.realpath(file))!==normalized(path.resolve(file)))throw new Error('O arquivo mudou durante a leitura.');
      return bytes.subarray(0,position);
    }finally{await handle.close();}
  }
  async function optionalConfig(target){try{return await readRegular(target);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  function configSummary(bytes){return bytes===null?{exists:false,size:0,sha256:null}:{exists:true,size:bytes.length,sha256:hash(bytes)};}
  function sameConfig(bytes,expected){return expected.exists?bytes!==null&&bytes.length===expected.size&&hash(bytes)===expected.sha256:bytes===null;}
  async function gameConfigPaths(){const game=await detect(),cfgPath=await resolveGameCfg(game);return {gamePath:await fs.realpath(game.gamePath),cfgPath,target:path.join(cfgPath,'csboost.cfg')};}
  async function readProfileJournal(){
    let bytes;try{await regularDirectory(dataDirectory);bytes=await readRegular(profileJournal,65536);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    let record;try{record=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('O registro de restauração da configuração é inválido; preserve o arquivo para diagnóstico.');}
    const validSummary=(value,allowAbsent=false)=>value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.exists==='boolean'&&Number.isInteger(value.size)&&value.size>=0&&value.size<=maxConfigBytes&&(value.exists?typeof value.sha256==='string'&&/^[a-f\d]{64}$/.test(value.sha256):allowAbsent&&value.size===0&&value.sha256===null);
    if(!record||record.format!==1||typeof record.id!=='string'||!GUID.test(record.id)||!['prepared','active','restoring'].includes(record.state)||typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt))||typeof record.updatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt))||typeof record.gamePath!=='string'||!path.isAbsolute(record.gamePath)||typeof record.cfgPath!=='string'||!path.isAbsolute(record.cfgPath)||record.targetName!=='csboost.cfg'||!validSummary(record.before,true)||!validSummary(record.after)||record.previousAfter!==null&&!validSummary(record.previousAfter)||(record.before.exists?typeof record.backupName!=='string'||!/^\d{10,20}-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.cfg$/i.test(record.backupName):record.backupName!==null))throw new Error('O registro de restauração da configuração é inválido; preserve o arquivo para diagnóstico.');
    return {record,journalHash:hash(bytes)};
  }
  async function writeProfileJournal(record,expectedHash=null){
    await regularDirectory(dataDirectory,true);const bytes=Buffer.from(JSON.stringify(record,null,2),'utf8');
    if(expectedHash===null){const handle=await fs.open(profileJournal,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}return hash(bytes);}
    if(hash(await readRegular(profileJournal,65536))!==expectedHash)throw new Error('O registro de restauração foi alterado externamente; nenhuma configuração será sobrescrita.');
    const temporary=profileJournal+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    try{await regularDirectory(dataDirectory);if(hash(await readRegular(profileJournal,65536))!==expectedHash)throw new Error('O registro de restauração foi alterado externamente.');await fs.rename(temporary,profileJournal);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
    return hash(bytes);
  }
  function assertSameInstallation(record,paths){if(normalized(record.gamePath)!==normalized(paths.gamePath)||normalized(record.cfgPath)!==normalized(paths.cfgPath))throw new Error('A instalação do CS2 mudou desde a aplicação. A cópia anterior foi preservada; restauração automática indisponível.');}
  async function originalBackup(record){
    if(!record.before.exists)return null;
    let bytes;try{await regularDirectory(backups);bytes=await readRegular(path.join(backups,record.backupName));}catch(error){if(error.code==='ENOENT')throw new Error('A cópia original da configuração está ausente; o arquivo atual e o registro foram preservados.');throw error;}
    if(!sameConfig(bytes,record.before))throw new Error('A cópia original da configuração foi alterada ou está incompleta; restauração bloqueada.');
    return bytes;
  }
  async function replaceConfig(paths,bytes,expected){
    const temporary=path.join(paths.cfgPath,'.csboost-'+crypto.randomUUID()+'.tmp'),handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    try{
      const fresh=await gameConfigPaths();if(normalized(fresh.target)!==normalized(paths.target))throw new Error('A instalação do CS2 mudou durante a aplicação.');
      if(!sameConfig(await optionalConfig(paths.target),expected))throw new Error('Conflito: csboost.cfg mudou externamente. Sua alteração e a cópia original foram preservadas.');
      await fs.rename(temporary,paths.target);
    }catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
  }
  async function removeProfileJournal(expectedHash){await regularDirectory(dataDirectory);if(hash(await readRegular(profileJournal,65536))!==expectedHash)throw new Error('O registro de restauração mudou externamente; preserve-o para diagnóstico.');await fs.unlink(profileJournal);}
  async function systemInfo(){let gpu='Não identificado';if(process.platform==='win32'){try{const value=await readInventory({operation:'systemInfo'}),names=Array.isArray(value?.gpuNames)?value.gpuNames.filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim()):[];gpu=names.join(', ')||gpu;}catch{}}return {cpu:os.cpus()[0]?.model.trim()||'Não identificado',logicalCores:os.cpus().length,ramGB:Math.round(os.totalmem()/1024**3*10)/10,platform:process.platform,gpu,os:`Windows ${os.release()}`};}
  async function readPowerRecord(){try{const bytes=await readRegular(powerState,65536),record=JSON.parse(bytes.toString('utf8'));if(!record||typeof record.guid!=='string'||!GUID.test(record.guid)||record.appliedGuid!==undefined&&(typeof record.appliedGuid!=='string'||!GUID.test(record.appliedGuid))||record.changedAt!==undefined&&!Number.isFinite(Date.parse(record.changedAt)))throw Error();if(record.sha256!==undefined&&record.sha256!==powerRecordHash(record))throw Error();if(record.ownerToken!==undefined)validateOwnerToken(record.ownerToken);return {record,bytesHash:hash(bytes)};}catch(error){if(error.code==='ENOENT')return null;throw new Error('Registro de energia inválido ou alterado; preserve o arquivo e confira a restauração.');}}
  async function writePowerRecord(input,{initial=false,expectedHash=null}={}){await regularDirectory(dataDirectory,true);const {sha256,...data}=input,record={...data,sha256:powerRecordHash(data)},bytes=Buffer.from(JSON.stringify(record,null,2));if(initial){const handle=await fs.open(powerState,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}return record;}const current=await readRegular(powerState,65536);if(expectedHash&&hash(current)!==expectedHash)throw Error('O registro de energia mudou externamente; nada foi alterado.');const temp=powerState+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}try{await fs.rename(temp,powerState);}catch(error){await fs.unlink(temp).catch(()=>{});throw error;}return record;}
  async function powerPlans(){const activeText=await run(powercfg,['/getactivescheme']);const activeGuid=activeText.match(/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}/i)?.[0]?.toLowerCase();if(!activeGuid)throw new Error('O Windows não informou o plano de energia ativo.');const plans=parsePowerPlans(await run(powercfg,['/list']),activeGuid),stored=await readPowerRecord(),record=stored?.record;const restoreGuid=record?.guid?.toLowerCase()??null,appliedGuid=record?.appliedGuid?.toLowerCase()??null,ownerToken=validateOwnerToken(record?.ownerToken);return {plans,activeGuid,restoreGuid,appliedGuid,canDiscard:!!(record?.sha256&&record?.ownerToken),...(ownerToken?{ownerToken}:{})};}
  async function activatePowerPlan(guid,options={}){return serial(async()=>{const requestedOwner=validateOwnerToken(options.ownerToken);if(typeof guid!=='string'||!GUID.test(guid))throw new Error('Plano de energia inválido.');const desired=guid.toLowerCase(),state=await powerPlans();if(!state.plans.some(p=>p.guid===desired))throw new Error('Esse plano não está instalado neste computador.');if(state.activeGuid===desired)return state;await fs.mkdir(dataDirectory,{recursive:true});const stored=await readPowerRecord();if(stored){if(state.activeGuid!==stored.record.guid.toLowerCase()&&state.activeGuid!==stored.record.appliedGuid?.toLowerCase())throw Error('O plano foi alterado fora do CSBOOST. Restaure ou descarte o backup antes de aplicar outro.');await writePowerRecord({...stored.record,appliedGuid:desired,...(stored.record.ownerToken?{}:requestedOwner?{ownerToken:requestedOwner}:{})},{expectedHash:stored.bytesHash});}else await writePowerRecord({guid:state.activeGuid,appliedGuid:desired,...(requestedOwner?{ownerToken:requestedOwner}:{}),changedAt:new Date().toISOString()},{initial:true});await run(powercfg,['/setactive',desired]);const result=await powerPlans();if(result.activeGuid!==desired)throw new Error('O Windows não confirmou a ativação do plano de energia.');return result;});}
  async function restorePowerPlan(){return serial(async()=>{const state=await powerPlans();if(!state.restoreGuid)throw new Error('Não há plano anterior salvo pelo CSBOOST.');if(!state.plans.some(p=>p.guid===state.restoreGuid))throw new Error('O plano anterior não está mais instalado.');if(state.activeGuid!==state.restoreGuid&&(!state.appliedGuid||state.activeGuid!==state.appliedGuid))return {restored:false,pendingRestore:true,restoredItems:[],preserved:[{id:'activePlan',motivo:'O plano ativo foi alterado fora do CSBOOST.',valorAtual:state.activeGuid}],message:'O plano atual foi mantido. O backup continua disponível.'};if(state.activeGuid!==state.restoreGuid){await run(powercfg,['/setactive',state.restoreGuid]);const result=await powerPlans();if(result.activeGuid!==state.restoreGuid)throw new Error('O Windows não confirmou a restauração do plano anterior.');}const stored=await readPowerRecord();if(!stored)throw Error('O registro de energia foi removido durante a restauração.');if(hash(await readRegular(powerState,65536))!==stored.bytesHash)throw Error('O registro de energia mudou durante a restauração; backup preservado.');await fs.unlink(powerState);return {...await powerPlans(),restoreGuid:null,appliedGuid:null,restored:true,pendingRestore:false};});}
  async function discardPowerBackup(token){return serial(async()=>{const state=await powerPlans(),stored=await readPowerRecord();if(!stored||!state.restoreGuid)throw Error('Não há backup de energia para descartar.');if(!stored.record.sha256||!stored.record.ownerToken)throw Error('Este backup antigo não tem hash e identificação de propriedade; restaure-o manualmente.');consumeDiscardToken('power',token,stored.record.ownerToken);const values=[{id:'activePlan',anterior:stored.record.guid,aplicado:stored.record.appliedGuid??null,atual:state.activeGuid}],latest=await readPowerRecord(),live=await powerPlans();if(!latest||latest.bytesHash!==stored.bytesHash||live.activeGuid!==state.activeGuid)throw Error('O plano ou backup mudou durante a confirmação; nada foi descartado.');await appendDiscardAudit(dataDirectory,{module:'power',ownerToken:stored.record.ownerToken,values});const final=await readPowerRecord(),verified=await powerPlans();if(!final||final.bytesHash!==stored.bytesHash||verified.activeGuid!==state.activeGuid)throw Error('O plano ou backup mudou durante a confirmação; nada foi descartado.');await fs.unlink(powerState);return {discarded:true,module:'power',items:1};});}
  async function applyProfile(profile){return serial(async()=>{
    const bytes=Buffer.from(renderConfig(profile),'utf8');if(bytes.length>maxConfigBytes)throw new Error('A configuração excede o limite de 1 MB.');
    const paths=await gameConfigPaths(),current=await optionalConfig(paths.target),retained=await readProfileJournal();
    let record,journalHash=retained?.journalHash??null;
    if(retained){
      record=retained.record;assertSameInstallation(record,paths);await originalBackup(record);
      if(record.state!=='active')throw new Error('Há uma aplicação/restauração interrompida. Restaure a configuração antes de aplicar outro perfil.');
      if(!sameConfig(current,record.after))throw new Error('Conflito: csboost.cfg foi alterado externamente. Sua alteração e a cópia original foram preservadas.');
    }
    const previous=configSummary(current),next=configSummary(bytes);
    if(sameConfig(current,next))return {path:paths.target,backupPath:record?.backupName?path.join(backups,record.backupName):null,launchArgument:'+exec csboost.cfg',changed:false,pendingRestore:!!record};
    if(!record){
      let backupName=null;
      if(current!==null){
        await regularDirectory(backups,true);backupName=Date.now()+'-'+crypto.randomUUID()+'.cfg';
        const handle=await fs.open(path.join(backups,backupName),'wx',0o600);try{await handle.writeFile(current);await handle.sync();}finally{await handle.close();}
      }
      record={format:1,id:crypto.randomUUID(),state:'prepared',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),gamePath:paths.gamePath,cfgPath:paths.cfgPath,targetName:'csboost.cfg',before:previous,backupName,after:next,previousAfter:null};
    }else record={...record,state:'prepared',updatedAt:new Date().toISOString(),after:next,previousAfter:record.after};
    journalHash=await writeProfileJournal(record,journalHash);
    await replaceConfig(paths,bytes,previous);
    if(!sameConfig(await optionalConfig(paths.target),next))throw new Error('O Windows não confirmou os bytes da configuração aplicada. A recuperação permanece pendente.');
    await writeProfileJournal({...record,state:'active',updatedAt:new Date().toISOString(),previousAfter:null},journalHash);
    return {path:paths.target,backupPath:record.backupName?path.join(backups,record.backupName):null,launchArgument:'+exec csboost.cfg',changed:true,pendingRestore:true};
  });}
  async function getProfileConfigState(){return serial(async()=>{
    let pendingRestore=false,paths=null,backupPath=null;
    try{
      pendingRestore=await fs.lstat(profileJournal).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
      paths=await gameConfigPaths();const retained=await readProfileJournal(),current=await optionalConfig(paths.target);
      if(!retained)return {supported:true,path:paths.target,exists:current!==null,managed:false,pendingRestore:false,canRestore:false,conflict:false,reason:'Não há alteração de csboost.cfg com restauração registrada nesta edição.',backupPath:null,status:current===null?'absent':'unmanaged',gameRunning:null};
      const record=retained.record;assertSameInstallation(record,paths);backupPath=record.backupName?path.join(backups,record.backupName):null;await originalBackup(record);
      const alreadyOriginal=sameConfig(current,record.before),owned=sameConfig(current,record.after)||(record.previousAfter!==null&&sameConfig(current,record.previousAfter));
      const conflict=!alreadyOriginal&&!owned;
      const gameRunning=await isGameRunning();
      return {supported:true,path:paths.target,exists:current!==null,managed:true,pendingRestore:true,canRestore:!conflict&&!gameRunning,conflict,reason:conflict?'Conflito: csboost.cfg foi alterado/removido externamente. Sua alteração e a cópia original foram preservadas.':gameRunning?'Feche o CS2 antes de restaurar o arquivo.':alreadyOriginal?'O estado original já está presente; a restauração apenas concluirá o registro pendente.':null,backupPath,status:conflict?'conflict':record.state,gameRunning,alreadyOriginal,originallyExisted:record.before.exists};
    }catch(error){return {supported:false,path:paths?.target??null,exists:null,managed:pendingRestore,pendingRestore,canRestore:false,conflict:pendingRestore,reason:error.message,backupPath,status:pendingRestore?'recovery-required':'unavailable',gameRunning:null};}
  });}
  async function restoreProfileConfig(){return serial(async()=>{
    const paths=await gameConfigPaths(),retained=await readProfileJournal();
    if(!retained)return {restored:false,removed:false,path:paths.target,backupPath:null,pendingRestore:false,message:'Não há configuração anterior registrada pelo CSBOOST.'};
    if(await isGameRunning())throw new Error('Feche o CS2 antes de restaurar o arquivo de configuração.');
    const record=retained.record;assertSameInstallation(record,paths);const original=await originalBackup(record),current=await optionalConfig(paths.target);
    const alreadyOriginal=sameConfig(current,record.before),owned=sameConfig(current,record.after)||(record.previousAfter!==null&&sameConfig(current,record.previousAfter));
    if(!alreadyOriginal&&!owned)throw new Error('Conflito: csboost.cfg foi alterado/removido externamente. Sua alteração e a cópia original foram preservadas.');
    const restoring={...record,state:'restoring',updatedAt:new Date().toISOString()},journalHash=await writeProfileJournal(restoring,retained.journalHash);
    if(!alreadyOriginal){
      if(await isGameRunning())throw new Error('O CS2 foi aberto durante a restauração. Feche o jogo e tente novamente; o registro foi preservado.');
      if(record.before.exists)await replaceConfig(paths,original,configSummary(current));
      else{
        const fresh=await gameConfigPaths(),latest=await optionalConfig(paths.target);if(normalized(fresh.target)!==normalized(paths.target)||!sameConfig(latest,record.after)&&!(record.previousAfter!==null&&sameConfig(latest,record.previousAfter)))throw new Error('Conflito: a configuração mudou antes da remoção.');
        await fs.unlink(paths.target);
      }
    }
    if(!sameConfig(await optionalConfig(paths.target),record.before))throw new Error('O Windows não confirmou a restauração do arquivo. O backup e o registro foram preservados.');
    await removeProfileJournal(journalHash);
    return {restored:!alreadyOriginal,removed:!record.before.exists&&!alreadyOriginal,path:paths.target,backupPath:record.backupName?path.join(backups,record.backupName):null,pendingRestore:false,message:alreadyOriginal?'O arquivo já estava no estado original; registro de recuperação concluído.':record.before.exists?'Os bytes originais de csboost.cfg foram restaurados.':'O arquivo csboost.cfg criado pelo CSBOOST foi removido.'};
  });}
  async function launchCS2(options={}){if(!options||typeof options!=='object'||Array.isArray(options)||(typeof options.withConfig!=='undefined'&&typeof options.withConfig!=='boolean')||(typeof options.benchmark!=='undefined'&&typeof options.benchmark!=='boolean')||(typeof options.benchmarkRun!=='undefined'&&typeof options.benchmarkRun!=='boolean')||(options.benchmarkRun&&options.withConfig))throw new Error('Opção de inicialização inválida.');const game=await detect();if(!game.installed||!game.cs2Installed)throw new Error('Steam e CS2 precisam estar instalados.');const args=['-applaunch','730'];if(options.benchmarkRun)args.push('-novid','-condebug','+fps_max','0','+exec','csboost-benchmark.cfg');else if(options.benchmark)args.push('-condebug');if(options.withConfig){const cfg=await resolveGameCfg(game);try{await configStat(path.join(cfg,'csboost.cfg'));}catch(error){if(error.code==='ENOENT')throw new Error('Aplique um perfil antes de iniciar com a configuração CSBOOST.');throw error;}if(options.settings){const settings=validateSettings(options.settings);const text=await fs.readFile(path.join(cfg,'csboost.cfg'),'utf8');if(text!==renderConfig({settings}))throw new Error('Aplique o perfil selecionado antes de iniciar com ele.');args.push(...buildLaunchArguments(settings));}args.push('+exec','csboost.cfg');}await new Promise((resolve,reject)=>{const child=spawnImpl(path.join(game.steamPath,'steam.exe'),args,{windowsHide:true,detached:true,stdio:'ignore',shell:false});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});});return {requested:true,message:'Inicialização solicitada à Steam.'};}
  async function isGameRunning(){if(checkGameRunning){const running=await checkGameRunning();if(typeof running!=='boolean')throw Error('Estado do CS2 desconhecido.');return running;}const stdout=await run(path.join(windowsRoot,'System32','tasklist.exe'),['/FI','IMAGENAME eq cs2.exe','/FO','CSV','/NH']);return stdout.split(/\r?\n/).some(line=>/^\x22cs2\.exe\x22,/i.test(line.trim()));}return {getSystemInfo:systemInfo,refreshSteam:detect,getPowerPlans:powerPlans,activatePowerPlan,restorePowerPlan,discardPowerBackup,applyProfile,getProfileConfigState,restoreProfileConfig,launchCS2,isGameRunning};
}
