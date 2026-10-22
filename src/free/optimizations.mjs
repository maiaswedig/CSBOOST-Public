import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateOwnerToken} from './owned-state.mjs';
import {consumeDiscardToken,appendDiscardAudit} from './discard-confirmation.mjs';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const recordDigest=record=>{const {sha256,...data}=record;return digest(Buffer.from(JSON.stringify(data)));};
const presets = {
  fps: {name:'Priorizar FPS', description:'Gráficos leves, MSAA desativado e VSync desligado. Reduz qualidade visual; mantém sombras dinâmicas e Reflex atuais.'},
  competitive: {name:'Equilíbrio visual', description:'Gráficos leves com MSAA 2×. Mantém sombras dinâmicas e Reflex atuais.'},
};
const resolutions = {'keep':null,'1280x720':[1280,720],'1280x960':[1280,960],'1600x900':[1600,900],'1920x1080':[1920,1080]};
const fields = {
  'setting.mat_vsync':['VSync','0'], 'setting.msaa_samples':['MSAA','0'],
  'setting.r_csgo_cmaa_enable':['CMAA','0'], 'setting.videocfg_shadow_quality':['Qualidade das sombras','0'],
  'setting.videocfg_texture_detail':['Detalhe das texturas','0'], 'setting.videocfg_ao_detail':['Oclusão de ambiente','0'],
  'setting.videocfg_particle_detail':['Detalhe das partículas','0'], 'setting.videocfg_hdr_detail':['HDR (desempenho)','3'],
  'setting.shaderquality':['Detalhe dos shaders','0'], 'setting.r_texturefilteringquality':['Filtragem das texturas','1'],
  'setting.fullscreen':['Tela cheia','1'], 'setting.nowindowborder':['Janela sem bordas','0'],
};
const labels = {...Object.fromEntries(Object.entries(fields).map(([key,[label]])=>[key,label])),
  'setting.defaultres':'Largura','setting.defaultresheight':'Altura','setting.aspectratiomode':'Proporção da tela'};

// CS2 video.cfg is a flat KeyValues object. Reject ambiguous/nested files;
// replace only quoted value spans and preserve every unrelated byte.
export function parseVideoConfig(text){
  const tokens=[];const rx=/\s+|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]|\S+/g;
  for(const match of text.matchAll(rx)){
    if(/^\s|^\/\//.test(match[0]))continue;
    if(!/^"|^[{}]$/.test(match[0]))throw new Error('Formato de vídeo do CS2 não reconhecido.');
    tokens.push({text:match[0],start:match.index,end:match.index+match[0].length});
  }
  const string = token=>{try{return JSON.parse(token.text);}catch{throw new Error('Texto inválido na configuração de vídeo.');}};
  if(tokens.length<3||tokens[0].text!=='"video.cfg"'||tokens[1].text!=='{'||tokens.at(-1).text!=='}')throw new Error('Configuração de vídeo do CS2 inválida.');
  const entries=new Map();
  for(let i=2;i<tokens.length-1;i+=2){
    if(!tokens[i]?.text.startsWith('"')||!tokens[i+1]?.text.startsWith('"'))throw new Error('Configuração de vídeo precisa ter uma única seção simples.');
    const key=string(tokens[i]);if(entries.has(key))throw new Error('Chave de vídeo duplicada: '+key);
    entries.set(key,{value:string(tokens[i+1]),...tokens[i+1]});
  }
  for(const key of ['setting.defaultres','setting.defaultresheight','setting.msaa_samples','setting.mat_vsync'])if(!entries.has(key))throw new Error('Configuração de vídeo incompleta. Abra o CS2 e salve as opções de vídeo primeiro.');
  return entries;
}
export function patchVideoConfig(text,values){
  const entries=parseVideoConfig(text),edits=[];
  for(const [key,value]of Object.entries(values)){const entry=entries.get(key);if(entry&&entry.value!==value)edits.push({...entry,replacement:JSON.stringify(value)});}
  for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);
  return text;
}
export function planVideoPreset(text,{preset='fps',resolution='keep'}={}){
  if(!Object.hasOwn(presets,preset)||!Object.hasOwn(resolutions,resolution))throw new Error('Preset ou resolução inválidos.');
  const entries=parseVideoConfig(text),values=Object.fromEntries(Object.entries(fields).map(([key,[,value]])=>[key,value]));
  if(preset==='competitive')values['setting.msaa_samples']='2';
  if(resolutions[resolution]){const [width,height]=resolutions[resolution];values['setting.defaultres']=String(width);values['setting.defaultresheight']=String(height);values['setting.aspectratiomode']=width/height===4/3?'0':'1';}
  const changes=[],already=[],unsupported=[];
  for(const [key,value]of Object.entries(values)){const entry=entries.get(key);if(!entry){unsupported.push(labels[key]);continue;}const item={key,label:labels[key],before:entry.value,after:value};(entry.value===value?already:changes).push(item);}
  const width=Number(values['setting.defaultres']||entries.get('setting.defaultres').value),height=Number(values['setting.defaultresheight']||entries.get('setting.defaultresheight').value);
  const currentPixels=Number(entries.get('setting.defaultres').value)*Number(entries.get('setting.defaultresheight').value);
  return {preset,resolution,name:presets[preset].name,description:presets[preset].description,changes,already,unsupported,width,height,
    pixelChangePercent:currentPixels>0?(width*height/currentPixels-1)*100:null,sourceSHA256:digest(Buffer.from(text)),text:patchVideoConfig(text,values)};
}
export function steamAccountDirectory(steamId){
  if(typeof steamId!=='string'||!/^\d{17}$/.test(steamId))throw new Error('Identidade Steam inválida.');
  const account=BigInt(steamId)-76561197960265728n;
  if(account<0n||account>4294967295n)throw new Error('Conta Steam não compatível.');
  return account.toString();
}

export function createOptimizations({directory,system,planner=planVideoPreset,additionalLabels={}}){
  const journalLabels={...labels,...additionalLabels};
  let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
  async function locate(steamId){
    const game=await system.refreshSteam();if(!game.cs2Installed||!game.steamPath)throw new Error('Steam e CS2 precisam estar instalados.');
    let folder=await fs.realpath(game.steamPath);
    for(const segment of ['userdata',steamAccountDirectory(steamId),'730','local','cfg']){folder=path.join(folder,segment);let stat;try{stat=await fs.lstat(folder);}catch(error){if(error.code==='ENOENT')throw new Error('Abra o CS2 nesta conta Steam e salve as opções de vídeo antes de otimizar.');throw error;}if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('A pasta de vídeo não pode conter atalhos de diretório.');}
    const target=path.join(folder,'cs2_video.txt');const stat=await fs.lstat(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)throw new Error('cs2_video.txt precisa ser um arquivo regular com até 256 KB.');
    return target;
  }
  function journalFile(steamId){return path.join(directory,steamAccountDirectory(steamId)+'.json');}
  async function journal(steamId){try{const file=journalFile(steamId),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw new Error('Backup de vídeo inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.version!==1||!Array.isArray(record.changes)||typeof record.before!=='string'||digest(Buffer.from(record.before,'base64'))!==record.beforeSHA256)throw new Error('Backup de vídeo inconsistente.');if(record.sha256!==undefined&&record.sha256!==recordDigest(record))throw Error('Backup de vídeo alterado; preserve-o para diagnóstico.');if(record.ownerToken!==undefined)validateOwnerToken(record.ownerToken);for(const item of record.changes)if(!Object.hasOwn(journalLabels,item.key)||typeof item.before!=='string'||typeof item.after!=='string')throw new Error('Backup de vídeo inconsistente.');return record;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function saveJournal(steamId,input){const {sha256,...data}=input;const record={...data,sha256:recordDigest(data)};await writeAtomic(journalFile(steamId),JSON.stringify(record,null,2));}
  async function writeAtomic(target,bytes){const temporary=path.join(path.dirname(target),'.csboost-'+crypto.randomUUID()+'.tmp');await fs.writeFile(temporary,bytes,{flag:'wx'});try{await fs.rename(temporary,target);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}}
  async function assertStopped(){if(await system.isGameRunning())throw new Error('Feche o CS2 antes de alterar ou restaurar as opções de vídeo.');}
  async function inspect(steamId,options){
    const target=await locate(steamId),bytes=await fs.readFile(target),plan=planner(bytes.toString('utf8'),options),backup=await journal(steamId);
    const entries=parseVideoConfig(bytes.toString('utf8'));
    const conflicts=backup?backup.changes.filter(change=>{const value=entries.get(change.key)?.value;return value!==change.after&&value!==change.before;}).map(change=>change.label):[];
    const {text,...preview}=plan;
    return {...preview,running:await system.isGameRunning(),active:backup?{...(backup.ownerToken?{ownerToken:validateOwnerToken(backup.ownerToken)}:{}),canDiscard:!!(backup.sha256&&backup.ownerToken),preset:backup.preset,appliedAt:backup.appliedAt,changedKeys:backup.changes.length,changes:backup.changes,conflicts}:null};
  }
  async function apply(steamId,options){return serial(async()=>{
    const ownerToken=validateOwnerToken(options?.ownerToken);
    await assertStopped();if(await journal(steamId))throw new Error('Restaure o preset anterior antes de aplicar outro.');
    const target=await locate(steamId),bytes=await fs.readFile(target),plan=planner(bytes.toString('utf8'),options);
    if(options?.sourceSHA256!==digest(bytes))throw new Error('As opções de vídeo mudaram. Atualize a prévia antes de aplicar.');
    if(!plan.changes.length)return {...await inspect(steamId,options),changed:false};
    const record={version:1,...(ownerToken?{ownerToken}:{}),preset:plan.preset,appliedAt:new Date().toISOString(),before:bytes.toString('base64'),beforeSHA256:digest(bytes),afterSHA256:digest(Buffer.from(plan.text)),exactRestore:true,changes:plan.changes};
    await fs.mkdir(directory,{recursive:true});const directoryStat=await fs.lstat(directory);if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())throw new Error('Pasta de backup inválida.');
    const prepared={...record,sha256:recordDigest(record)};await fs.writeFile(journalFile(steamId),JSON.stringify(prepared,null,2),{flag:'wx',mode:0o600});
    await assertStopped();if(digest(await fs.readFile(await locate(steamId)))!==record.beforeSHA256)throw new Error('O arquivo de vídeo mudou durante a preparação. Restaure o registro e tente novamente.');
    await writeAtomic(target,plan.text);if(digest(await fs.readFile(target))!==record.afterSHA256)throw new Error('Não foi possível confirmar as opções gravadas. O backup está preservado.');
    return {...await inspect(steamId,options),changed:true};
  });}
  async function restore(steamId){return serial(async()=>{
    await assertStopped();const backup=await journal(steamId);if(!backup)throw new Error('Não há preset gráfico salvo para restaurar nesta conta.');
    const target=await locate(steamId),bytes=await fs.readFile(target),text=bytes.toString('utf8'),entries=parseVideoConfig(text),values={};
    const restoredItems=[],preserved=[];
    for(const change of backup.changes){const current=entries.get(change.key)?.value;if(current===change.before){restoredItems.push(change.label);continue;}if(current!==change.after){preserved.push({id:change.key,motivo:'O valor foi alterado depois do preset.',valorAtual:current??null});continue;}values[change.key]=change.before;restoredItems.push(change.label);}
    const restored=backup.exactRestore!==false&&!preserved.length&&digest(bytes)===backup.afterSHA256?Buffer.from(backup.before,'base64'):Buffer.from(patchVideoConfig(text,values));
    await assertStopped();if(digest(await fs.readFile(await locate(steamId)))!==digest(bytes))throw new Error('O arquivo de vídeo mudou durante a restauração. Tente novamente.');
    await writeAtomic(target,restored);if(digest(await fs.readFile(target))!==digest(restored))throw new Error('O Windows não confirmou a restauração.');
    if(preserved.length){backup.changes=backup.changes.filter(change=>preserved.some(item=>item.id===change.key));backup.exactRestore=false;backup.afterSHA256=digest(restored);await saveJournal(steamId,backup);}else await fs.unlink(journalFile(steamId));return {restored:true,pendingRestore:preserved.length>0,restoredItems,preserved};
  });}
  async function discardBackup(steamId,token){return serial(async()=>{await assertStopped();const record=await journal(steamId);if(!record)throw Error('Não há backup de vídeo para descartar.');if(!record.sha256||!record.ownerToken)throw Error('Este backup antigo não tem hash e identificação de propriedade; restaure-o manualmente.');consumeDiscardToken('video',token,record.ownerToken);const target=await locate(steamId),bytes=await fs.readFile(target),entries=parseVideoConfig(bytes.toString('utf8')),current=record.changes.map(change=>({id:change.key,anterior:change.before,aplicado:change.after,atual:entries.get(change.key)?.value??null}));const latest=await journal(steamId);if(!latest||latest.sha256!==record.sha256)throw Error('O backup mudou durante a confirmação; nada foi descartado.');if(digest(await fs.readFile(await locate(steamId)))!==digest(bytes))throw Error('O arquivo de vídeo mudou durante a confirmação; backup preservado.');await appendDiscardAudit(directory,{module:'video',ownerToken:record.ownerToken,values:current});const final=await journal(steamId);if(!final||final.sha256!==record.sha256||digest(await fs.readFile(await locate(steamId)))!==digest(bytes))throw Error('O backup ou as opções de vídeo mudaram durante a confirmação; nada foi descartado.');await fs.unlink(journalFile(steamId));return {discarded:true,module:'video',items:current.length};});}
  return {inspect,apply,restore,discardBackup};
}
