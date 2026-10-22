import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {consumeDiscardToken,appendDiscardAudit} from './discard-confirmation.mjs';
import {readSystemInventory} from './system-worker.mjs';

const FORMAT=1,MAX_ENTRIES=4096,MAX_BYTES=4*2**30;
const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i,SHA=/^[a-f\d]{64}$/;
const MESSAGE='Reparação opcional do cache de shaders do CS2. O próximo início pode recompilar shaders e apresentar travamentos temporários; limpar cache não garante mais FPS. Os arquivos movidos para backup continuam ocupando espaço.';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const same=(a,b)=>normalize(a)===normalize(b);
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const states=['prepared','active','restoring','recovery-required'];
function relative(value){return typeof value==='string'&&value.length>0&&value.length<=512&&!/[\\\x00-\x1f:*?"<>|]/.test(value)&&value.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[ .]$/.test(part));}
function targetId(value){return ['steam-primary','cs2-library'].includes(value);}
function manifest(value){
  if(!object(value)||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)throw new Error('Manifesto do cache inválido.');
  let bytes=0,files=0,folders=0;
  const entries=value.entries.map(entry=>{
    if(!object(entry)||!relative(entry.path)||!['file','directory'].includes(entry.type))throw new Error('Entrada do cache inválida.');
    if(entry.type==='file'){if(!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!SHA.test(entry.sha256))throw new Error('Arquivo do cache inválido.');bytes+=entry.bytes;files++;return {path:entry.path,type:'file',bytes:entry.bytes,sha256:entry.sha256};}
    folders++;return {path:entry.path,type:'directory'};
  }).sort((a,b)=>a.path.localeCompare(b.path));
  if(bytes>MAX_BYTES||new Set(entries.map(entry=>process.platform==='win32'?entry.path.toLowerCase():entry.path)).size!==entries.length)throw new Error('Manifesto do cache excede os limites ou contém aliases.');
  const directories=new Set(entries.filter(entry=>entry.type==='directory').map(entry=>entry.path));
  for(const entry of entries){const components=entry.path.split('/');while(components.length>1){components.pop();if(!directories.has(components.join('/')))throw new Error('Manifesto do cache sem diretório pai.');}}
  const clean={entries,bytes,files,folders};return {...clean,fingerprint:digest(clean)};
}
export function createShaderCache({directory,system,isGameRunning=system?.isGameRunning,runReparseCheck,renameDirectory=fs.rename,now=()=>new Date().toISOString()}={}){
  if(typeof directory!=='string'||!path.isAbsolute(directory)||!system||typeof system.refreshSteam!=='function'||typeof isGameRunning!=='function'||typeof now!=='function'||typeof renameDirectory!=='function'||(runReparseCheck!==undefined&&typeof runReparseCheck!=='function'))throw new Error('Configuração de cache inválida.');
  const journalPath=path.join(directory,'shader-cache-restore.json');let queue=Promise.resolve();
  const serial=operation=>{const next=queue.then(operation,operation);queue=next.catch(()=>{});return next;};
  async function reparseCheck(file,recursive=false){
    if(runReparseCheck){if(await runReparseCheck({path:file,recursive})!==true)throw new Error('Reparse point ou caminho do cache não validado.');return;}
    if(process.platform!=='win32')return;
    try{if((await readSystemInventory({operation:'reparseCheck',path:file,recursive})).ok!==true)throw new Error();}catch{throw new Error('Não foi possível verificar reparse points e permissões do cache.');}
  }
  async function canonical(file,{type='directory',missing=false}={}){
    const absolute=path.resolve(file),root=path.parse(absolute).root;let current=root;
    for(const component of absolute.slice(root.length).split(path.sep).filter(Boolean)){
      current=path.join(current,component);let stat;try{stat=await fs.lstat(current);}catch(error){if(error.code==='ENOENT'&&missing&&same(current,absolute)){await reparseCheck(path.dirname(absolute));return null;}throw error;}
      if(stat.isSymbolicLink()||(!same(current,absolute)&&!stat.isDirectory()))throw new Error('O cache exige caminhos regulares sem links ou reparse points.');
    }
    const stat=await fs.lstat(absolute);
    if(stat.isSymbolicLink()||(type==='directory'?!stat.isDirectory():!stat.isFile())||!same(await fs.realpath(absolute),absolute))throw new Error('O caminho do cache não é um destino regular canônico.');
    await reparseCheck(absolute);return absolute;
  }
  async function storage(){await canonical(path.dirname(directory));if(!await canonical(directory,{missing:true}))await fs.mkdir(directory);await canonical(directory);}
  async function regularJson(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw new Error('Registro de recuperação do cache inválido.');await canonical(file,{type:'file'});return JSON.parse(await fs.readFile(file,'utf8'));}
  async function save(value,{initial=false,file=journalPath}={}){
    await storage();const text=JSON.stringify(value,null,2);if(Buffer.byteLength(text)>8*1024*1024)throw new Error('Registro do cache excede o limite.');
    if(initial){const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}return;}
    await regularJson(file);const temp=file+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
    try{await fs.rename(temp,file);}catch(error){await fs.unlink(temp).catch(()=>{});throw error;}
  }
  async function catalog(){
    const game=await system.refreshSteam();if(!game?.installed||!game.cs2Installed||typeof game.steamPath!=='string'||typeof game.gamePath!=='string'||!path.isAbsolute(game.steamPath)||!path.isAbsolute(game.gamePath))throw new Error('Steam e CS2 precisam estar instalados para reparar o cache.');
    const steam=await canonical(game.steamPath),gameRoot=await canonical(game.gamePath);
    await canonical(path.join(steam,'steam.exe'),{type:'file'});await canonical(path.join(gameRoot,'game','bin','win64','cs2.exe'),{type:'file'});
    const common=path.dirname(gameRoot),steamapps=path.dirname(common),library=path.dirname(steamapps);
    if(path.basename(common).toLowerCase()!=='common'||path.basename(steamapps).toLowerCase()!=='steamapps'||same(gameRoot,common)||!same(path.join(library,'steamapps','common',path.basename(gameRoot)),gameRoot))throw new Error('A instalação do CS2 não pertence a uma biblioteca Steam reconhecida.');
    await canonical(path.join(library,'steamapps','appmanifest_730.acf'),{type:'file'});
    const result=[];
    for(const item of [{id:'cs2-library',root:library},{id:'steam-primary',root:steam}]){
      if(result.some(target=>same(target.libraryRoot,item.root)))continue;
      await canonical(path.join(item.root,'steamapps'));
      const parent=path.join(item.root,'steamapps','shadercache');let exists;try{exists=await canonical(parent,{missing:true});}catch(error){throw new Error(`Biblioteca Steam não validada: ${error.message}`);}
      result.push({id:item.id,libraryRoot:item.root,parentPath:parent,targetPath:path.join(parent,'730'),parentExists:!!exists});
    }
    return result;
  }
  async function hashFile(file,expected){
    const hash=crypto.createHash('sha256'),handle=await fs.open(file,'r');
    try{const before=await handle.stat();if(!before.isFile()||before.size!==expected.size||before.mtimeMs!==expected.mtimeMs||before.ino!==expected.ino)throw new Error('Um arquivo do cache mudou durante a leitura.');const buffer=Buffer.allocUnsafe(1024*1024);let position=0;while(position<before.size){const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,before.size-position),position);if(!bytesRead)throw new Error('Um arquivo do cache foi truncado durante a leitura.');hash.update(buffer.subarray(0,bytesRead));position+=bytesRead;}const after=await handle.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new Error('Um arquivo do cache mudou durante a leitura.');return hash.digest('hex');}finally{await handle.close();}
  }
  async function scan(root,{missing=false}={}){
    if(!await canonical(root,{missing}))return null;await reparseCheck(root,true);
    const entries=[],todo=[{full:root,prefix:''}];let bytes=0;
    while(todo.length){const {full,prefix}=todo.pop();for(const name of await fs.readdir(full)){
      const rel=prefix?prefix+'/'+name:name;if(!relative(rel))throw new Error('Nome de arquivo do cache não suportado.');if(entries.length>=MAX_ENTRIES)throw new Error('Cache excede o limite de 4096 entradas.');
      const file=path.join(full,name),stat=await fs.lstat(file);if(stat.isSymbolicLink())throw new Error('Links e reparse points não são permitidos no cache.');
      if(stat.isDirectory()){entries.push({path:rel,type:'directory'});todo.push({full:file,prefix:rel});}
      else if(stat.isFile()){bytes+=stat.size;if(bytes>MAX_BYTES)throw new Error('Cache excede o limite de 4 GB para esta operação.');entries.push({path:rel,type:'file',bytes:stat.size,sha256:await hashFile(file,stat)});}
      else throw new Error('O cache contém uma entrada de arquivo não suportada.');
    }}
    await reparseCheck(root,true);return manifest({entries});
  }
  async function readJournal(targets){
    let value;try{value=await regularJson(journalPath);}catch(error){if(error.code==='ENOENT')return null;throw error;}
    if(!object(value)||value.format!==FORMAT||!UUID.test(value.id)||!states.includes(value.state)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt))||!Array.isArray(value.targets)||!value.targets.length||value.targets.length>2||new Set(value.targets.map(item=>item.id)).size!==value.targets.length)throw new Error('Registro de recuperação do cache inválido.');
    value.targets=value.targets.map(item=>{
      if(!object(item)||typeof item.libraryRoot!=='string'||!path.isAbsolute(item.libraryRoot))throw new Error('Entrada de recuperação do cache inválida.');
      const target=targets.find(target=>target.id===item.id);if(!object(item)||!targetId(item.id)||!target||!same(item.libraryRoot,target.libraryRoot)||!['planned','cleared','restoring','restored'].includes(item.phase))throw new Error('A recuperação não corresponde à biblioteca Steam atual.');
      const before=manifest(item.before);if(before.fingerprint!==item.before.fingerprint)throw new Error('O manifesto de recuperação do cache foi alterado.');
      const current=item.current?manifest(item.current):null;if(current&&current.fingerprint!==item.current.fingerprint)throw new Error('O manifesto do novo cache foi alterado.');
      return {...item,before,current};
    });return value;
  }
  function paths(target,id){if(!UUID.test(id))throw new Error('Identidade de quarentena inválida.');return {backup:path.join(target.parentPath,'.csboost-cache-original-'+id),preserved:path.join(target.parentPath,'.csboost-cache-new-'+id)};}
  function previewDigest(targets){return digest(targets.map(target=>({id:target.id,libraryRoot:target.libraryRoot,targetPath:target.targetPath,snapshot:target.snapshot})));}
  async function closed(){if(await isGameRunning())throw new Error('Feche o CS2 antes de mover ou restaurar o cache de shaders.');}
  async function preview(){
    try{
      const targets=await catalog(),journal=await readJournal(targets),running=await isGameRunning(),items=[];
      for(const target of targets){const snapshot=target.parentExists?await scan(target.targetPath,{missing:true}):null;items.push({...target,exists:!!snapshot,snapshot,files:snapshot?.files??0,folders:snapshot?.folders??0,bytes:snapshot?.bytes??0});}
      const files=items.reduce((sum,item)=>sum+item.files,0),bytes=items.reduce((sum,item)=>sum+item.bytes,0);
      return {available:true,recoveryId:journal?.id??null,canDiscardRecovery:!running&&journal?.state==='recovery-required',canClear:!running&&!journal&&files>0,canRestore:!!journal&&!running,pendingRestore:!!journal,restoreState:journal?.state??null,targets:items,files,bytes,previewFingerprint:previewDigest(items),reason:running?'Feche o CS2 para mover ou restaurar o cache.':journal?'Existe uma quarentena com recuperação pendente.':files===0?'Nenhum arquivo de cache do CS2 foi encontrado nos alvos verificados.':null,message:MESSAGE};
    }catch(error){const pendingRestore=await fs.lstat(journalPath).then(()=>true,failure=>failure.code==='ENOENT'?false:null);return {available:false,canClear:false,canRestore:false,pendingRestore,targets:[],files:null,bytes:null,previewFingerprint:null,reason:error.message,message:MESSAGE};}
  }
  async function checkedRename(source,destination,target){
    if(!same(path.dirname(source),target.parentPath)||!same(path.dirname(destination),target.parentPath)||![source,destination].every(file=>path.basename(file)==='730'||/^\.csboost-cache-(?:original|new)-[a-f\d-]+$/i.test(path.basename(file))))throw new Error('Movimento fora do catálogo de cache recusado.');
    await canonical(target.parentPath);await canonical(source);if(await canonical(destination,{missing:true}))throw new Error('O destino do cache já existe; nenhum conteúdo será sobrescrito.');await closed();await renameDirectory(source,destination);
  }
  async function clear(request){return serial(async()=>{
    if(!object(request)||Object.keys(request).some(key=>key!=='previewFingerprint')||typeof request.previewFingerprint!=='string'||!SHA.test(request.previewFingerprint))throw new Error('Abra a prévia do cache antes de reparar.');
    await closed();const info=await preview();if(!info.available)throw new Error(info.reason);if(info.pendingRestore)throw new Error('Restaure a quarentena anterior antes de reparar outro cache.');if(!info.canClear)throw new Error(info.reason);if(info.previewFingerprint!==request.previewFingerprint)throw new Error('O cache mudou desde a prévia. Atualize antes de reparar.');
    const journal={format:FORMAT,id:crypto.randomUUID(),state:'prepared',createdAt:now(),targets:info.targets.filter(target=>target.snapshot?.files>0).map(target=>({id:target.id,libraryRoot:target.libraryRoot,phase:'planned',before:target.snapshot,current:null}))};
    await save(journal,{initial:true});
    try{for(const entry of journal.targets){const target=info.targets.find(target=>target.id===entry.id),{backup}=paths(target,journal.id);if((await scan(target.targetPath)).fingerprint!==entry.before.fingerprint)throw new Error('O cache mudou antes do movimento.');await checkedRename(target.targetPath,backup,target);entry.phase='cleared';await save(journal);if((await scan(backup)).fingerprint!==entry.before.fingerprint)throw new Error('O cache mudou durante o movimento; a quarentena foi preservada para recuperação.');}journal.state='active';await save(journal);
    }catch(error){journal.state='recovery-required';journal.error=error.message;await save(journal).catch(()=>{});throw new Error(`Reparação do cache interrompida: ${error.message} Os arquivos e o registro de recuperação foram preservados.`);}
    return {changed:true,pendingRestore:true,restoreState:'active',files:info.files,bytes:info.bytes,quarantines:journal.targets.map(entry=>({id:entry.id,path:paths(info.targets.find(target=>target.id===entry.id),journal.id).backup})),message:MESSAGE};
  });}
  async function restore(){return serial(async()=>{
    await closed();const targets=await catalog(),journal=await readJournal(targets);if(!journal)return {restored:false,pendingRestore:false,targets:[],message:'Nenhuma quarentena de cache pendente.'};
    journal.state='restoring';delete journal.error;await save(journal);const results=[],preservedEntries=[];
    for(const entry of journal.targets){
      try{
        const target=targets.find(target=>target.id===entry.id),{backup,preserved}=paths(target,journal.id);await canonical(target.parentPath);
        const old=await scan(backup,{missing:true});let current=await scan(target.targetPath,{missing:true}),newCache=await scan(preserved,{missing:true});
        if(entry.phase==='restored'){if(!current)throw new Error('O cache já restaurado não está mais no destino.');results.push({id:entry.id,path:target.targetPath,preservedNewCache:newCache?preserved:null,alreadyRestored:true});continue;}
        if(!old){if(current?.fingerprint===entry.before.fingerprint){entry.phase='restored';await save(journal);results.push({id:entry.id,path:target.targetPath,preservedNewCache:newCache?preserved:null,alreadyRestored:true});continue;}throw new Error('A quarentena original está ausente ou não corresponde ao cache atual.');}
        if(old.fingerprint!==entry.before.fingerprint)throw new Error('O conteúdo da quarentena original foi alterado; restauração automática recusada.');
        if(newCache&&(!entry.current||newCache.fingerprint!==entry.current.fingerprint))throw new Error('O backup do cache novo foi alterado ou não pertence a esta recuperação.');
        if(current?.fingerprint===entry.before.fingerprint){entry.phase='restored';await save(journal);results.push({id:entry.id,path:target.targetPath,preservedNewCache:newCache?preserved:null,originalBackupRetained:backup,alreadyRestored:true});continue;}
        if(current){
          if(newCache)throw new Error('Outro cache foi criado após uma recuperação interrompida. Ambos foram preservados; revise os caminhos antes de continuar.');
          entry.current=current;entry.phase='restoring';await save(journal);await checkedRename(target.targetPath,preserved,target);newCache=await scan(preserved);if(newCache.fingerprint!==current.fingerprint)throw new Error('O cache novo mudou durante a preservação.');current=null;await save(journal);
        }
        await checkedRename(backup,target.targetPath,target);if((await scan(target.targetPath)).fingerprint!==entry.before.fingerprint)throw new Error('O cache restaurado mudou durante a verificação.');entry.phase='restored';await save(journal);results.push({id:entry.id,path:target.targetPath,preservedNewCache:newCache?preserved:null,alreadyRestored:false});
      }catch(error){preservedEntries.push({id:entry.id,motivo:error.message});}
    }
    if(preservedEntries.length){journal.targets=journal.targets.filter(entry=>preservedEntries.some(item=>item.id===entry.id));journal.state='recovery-required';journal.conflicts=preservedEntries;delete journal.error;await save(journal);return {restored:results.length>0,pendingRestore:true,targets:results,preserved:preservedEntries,message:'Os alvos sem conflito foram restaurados. Os demais e seus backups continuam guardados para nova tentativa.'};}
    const receiptPath=path.join(directory,'shader-cache-'+journal.id+'-restored.json');try{await save({...journal,restoredAt:now(),results},{initial:true,file:receiptPath});}catch(error){if(error.code!=='EEXIST')throw error;const receipt=await regularJson(receiptPath);if(receipt.id!==journal.id||receipt.format!==FORMAT)throw new Error('O recibo de recuperação já existente não é válido.');}
    await canonical(journalPath,{type:'file'});await fs.unlink(journalPath);return {restored:true,pendingRestore:false,targets:results,preserved:[],receiptPath,message:'Cache original restaurado. Qualquer cache novo encontrado foi mantido em um backup separado, sem sobrescrever seus arquivos.'};
  });}
  // Detach only a validated recovery journal. All cache directories remain intact.
  async function discardRecovery(token){return serial(async()=>{
    await closed();const targets=await catalog(),journal=await readJournal(targets);
    if(!journal||journal.state!=='recovery-required')throw Error('Não há recuperação em conflito para encerrar.');
    const fingerprint=digest(journal),ownerToken='boost:'+journal.id;
    consumeDiscardToken('shader-cache',token,ownerToken);
    const preservedPaths=journal.targets.map(entry=>{const target=targets.find(target=>target.id===entry.id);return {id:entry.id,current:target.targetPath,...paths(target,journal.id)};});
    const receiptPath=path.join(directory,'shader-cache-'+journal.id+'-detached.json');
    try{await save({...journal,detachedFingerprint:fingerprint,detachedAt:now(),preservedPaths},{initial:true,file:receiptPath});}
    catch(error){if(error.code!=='EEXIST')throw error;const receipt=await regularJson(receiptPath);if(receipt.id!==journal.id||receipt.detachedFingerprint!==fingerprint)throw Error('O recibo de recuperação não corresponde ao diário atual.');}
    await appendDiscardAudit(directory,{module:'shader-cache',ownerToken,recoveryId:journal.id,preservedPaths,reason:'Recuperação automática encerrada por confirmação; todos os caches preservados.'});
    await closed();const latest=await readJournal(await catalog());if(!latest||digest(latest)!==fingerprint)throw Error('A recuperação mudou durante a confirmação; diário preservado.');
    await canonical(journalPath,{type:'file'});await fs.unlink(journalPath);
    return {discarded:true,pendingRestore:false,preservedPaths,receiptPath};
  });}
  return {inspect:preview,preview,clear,restore,discardRecovery,journalPath};
}
