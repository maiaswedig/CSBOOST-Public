import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {steamAccountDirectory} from './optimizations.mjs';

const execute=promisify(execFile);
const FILE_NAME='cs2_machine_convars.vcfg';
const MAX_FILE=256*1024;
const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normal=value=>process.platform==='win32'?path.normalize(value).toLowerCase():path.normalize(value);
const validCap=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/.test(value)&&Number(value)<=100000;

// Keep the original token span: every unrelated byte must survive restoration.
export function parseBenchmarkFpsCap(text){
  const tokens=[];
  for(const match of text.matchAll(/\s+|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}]|\S+/g)){
    if(/^\s|^\/\//.test(match[0]))continue;
    if(!/^"|^[{}]$/.test(match[0]))throw new Error('Formato de convars do CS2 não reconhecido.');
    tokens.push({text:match[0],start:match.index,end:match.index+match[0].length});
  }
  let cursor=0;
  const quoted=()=>{const token=tokens[cursor++];if(!token?.text.startsWith('"'))throw new Error('Configuração de convars incompleta.');try{return {...token,value:JSON.parse(token.text)};}catch{throw new Error('Texto de convars inválido.');}};
  function object(){
    if(tokens[cursor++]?.text!=='{')throw new Error('Seção de convars inválida.');
    const entries=new Map();
    while(tokens[cursor]&&tokens[cursor].text!=='}'){
      const key=quoted().value.toLowerCase();if(entries.has(key))throw new Error('Chave de convars duplicada.');
      entries.set(key,tokens[cursor]?.text==='{'?object():quoted());
    }
    if(tokens[cursor++]?.text!=='}')throw new Error('Seção de convars incompleta.');return entries;
  }
  if(quoted().value.toLowerCase()!=='config')throw new Error('Configuração de convars inválida.');
  const config=object();if(cursor!==tokens.length)throw new Error('Configuração de convars ambígua.');
  const convars=config.get('convars'),entry=convars instanceof Map?convars.get('fps_max'):null;
  if(!entry||!validCap(entry.value))throw new Error('Abra o CS2 nesta conta e salve um limite de FPS válido antes do benchmark.');
  return {value:entry.value,start:entry.start,end:entry.end};
}

async function activeSteamAccount(){
  const registry=path.join(process.env.SystemRoot||'C:\\Windows','System32','reg.exe');
  const {stdout}=await execute(registry,['query','HKCU\\Software\\Valve\\Steam\\ActiveProcess','/v','ActiveUser'],{windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8'});
  const value=stdout.match(/ActiveUser\s+REG_DWORD\s+(0x[a-f\d]+|\d+)/i)?.[1];
  if(!value||BigInt(value)===0n||BigInt(value)>4294967295n)throw new Error('Inicie a Steam e entre na mesma conta usada no CSBOOST antes do benchmark.');
  return BigInt(value).toString();
}

/** Captures persisted fps_max, never claims to read the live engine cvar. */
export function createBenchmarkFpsCap({directory,system,getSteamId,readActiveAccount=activeSteamAccount}){
  if(!path.isAbsolute(directory)||typeof system?.refreshSteam!=='function'||typeof system?.isGameRunning!=='function')throw new Error('Dependências do limite de FPS inválidas.');
  const journal=path.join(directory,'benchmark-fps-cap.json');
  let queue=Promise.resolve();const serial=operation=>{const result=queue.then(operation,operation);queue=result.catch(()=>{});return result;};
  async function stopped(){if(await system.isGameRunning())return false;return true;}
  async function locate(account,expectedRoot){
    const installation=await system.refreshSteam();
    if(!installation.cs2Installed||typeof installation.steamPath!=='string'||!path.isAbsolute(installation.steamPath))throw new Error('A instalação Steam/CS2 precisa estar disponível para restaurar o limite de FPS.');
    const root=await fs.realpath(installation.steamPath);
    if(expectedRoot&&normal(root)!==normal(expectedRoot))throw new Error('A instalação da Steam mudou; o backup do limite de FPS foi preservado.');
    let folder=root;
    for(const part of ['userdata',account,'730','local','cfg']){
      folder=path.join(folder,part);const stat=await fs.lstat(folder);
      if(!stat.isDirectory()||stat.isSymbolicLink()||normal(await fs.realpath(folder))!==normal(folder))throw new Error('A pasta de convars precisa pertencer à conta Steam verificada, sem atalhos.');
    }
    const target=path.join(folder,FILE_NAME),stat=await fs.lstat(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE)throw new Error('O arquivo de convars precisa ser regular e ter até 256 KB.');
    return {target,root};
  }
  function decode(bytes){const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))throw new Error('Codificação das convars não reconhecida; nenhum arquivo foi alterado.');return text;}
  async function readJournal(){
    try{
      const stat=await fs.lstat(journal);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>400*1024)throw new Error('Backup do limite de FPS inválido.');
      const record=JSON.parse(await fs.readFile(journal,'utf8'));
      if(record.version!==1||!UUID.test(record.id)||typeof record.account!=='string'||!/^\d{1,10}$/.test(record.account)||BigInt(record.account)>4294967295n||typeof record.steamRoot!=='string'||!path.isAbsolute(record.steamRoot)||typeof record.before!=='string'||record.before.length>350000||!validCap(record.previous)||digest(Buffer.from(record.before,'base64'))!==record.sourceSHA256||parseBenchmarkFpsCap(decode(Buffer.from(record.before,'base64'))).value!==record.previous)throw new Error('Backup do limite de FPS inconsistente.');
      return record;
    }catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  async function currentAccount(){
    const id=await getSteamId?.(),account=steamAccountDirectory(id);
    let active;try{active=await readActiveAccount();}catch{throw new Error('Inicie a Steam e entre na mesma conta usada no CSBOOST antes do benchmark.');}
    if(String(active)!==account)throw new Error('A conta ativa da Steam é diferente da conta do CSBOOST. Entre com a mesma conta antes de medir.');
    return account;
  }
  async function inspect(){
    const retained=await readJournal();
    if(retained)return {available:true,pending:true,previous:retained.previous,current:retained.previous,source:FILE_NAME};
    const account=await currentAccount(),{target}=await locate(account),bytes=await fs.readFile(target),cap=parseBenchmarkFpsCap(decode(bytes));
    return {available:true,pending:false,previous:cap.value,current:cap.value,source:FILE_NAME,meaning:'Limite persistido no disco; autoexec e comandos podem definir outro valor dentro do jogo.'};
  }
  async function capture({id}){return serial(async()=>{
    if(!UUID.test(id))throw new Error('Execução de benchmark inválida.');
    if(!await stopped())throw new Error('Feche o CS2 antes de salvar o limite de FPS.');
    if(await readJournal())throw new Error('Há um limite de FPS anterior aguardando restauração.');
    const account=await currentAccount(),{target,root}=await locate(account),bytes=await fs.readFile(target),cap=parseBenchmarkFpsCap(decode(bytes));
    const record={version:1,id,account,steamRoot:root,previous:cap.value,before:bytes.toString('base64'),sourceSHA256:digest(bytes),capturedAt:new Date().toISOString()};
    await fs.mkdir(directory,{recursive:true});const folder=await fs.lstat(directory);if(!folder.isDirectory()||folder.isSymbolicLink())throw new Error('Pasta de backup de FPS inválida.');
    await fs.writeFile(journal,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
    return {captured:true,previous:cap.value,source:FILE_NAME,meaning:'Limite persistido no disco; a restauração ocorre após fechar o CS2.'};
  });}
  async function restore({id}={}){return serial(async()=>{
    const record=await readJournal();if(!record)return {restored:false,pending:false};
    if(id!==undefined&&record.id!==id)throw new Error('O backup do limite de FPS pertence a outra execução; nenhum arquivo foi alterado.');
    if(!await stopped())return {pending:true,previous:record.previous,reason:'game-running',message:'Feche o CS2 para restaurar o limite de FPS salvo antes do benchmark.'};
    const {target}=await locate(record.account,record.steamRoot),bytes=await fs.readFile(target),text=decode(bytes),current=parseBenchmarkFpsCap(text);
    if(Number(current.value)===Number(record.previous)){await fs.unlink(journal);return {restored:true,changed:false,previous:record.previous};}
    if(Number(current.value)!==0)throw new Error('O limite de FPS foi alterado fora do benchmark; o valor atual e o backup anterior foram preservados.');
    const restored=Buffer.from(text.slice(0,current.start)+JSON.stringify(record.previous)+text.slice(current.end));
    if(!await stopped())return {pending:true,previous:record.previous,reason:'game-running',message:'Feche o CS2 para restaurar o limite de FPS.'};
    const verified=await locate(record.account,record.steamRoot);
    if(digest(await fs.readFile(verified.target))!==digest(bytes))throw new Error('As convars mudaram durante a restauração; tente novamente com o CS2 fechado.');
    const temporary=path.join(path.dirname(target),'.csboost-fps-'+record.id+'.tmp');
    await fs.writeFile(temporary,restored,{flag:'wx',mode:0o600});
    try{if(!await stopped())throw new Error('O CS2 abriu durante a restauração. Feche o jogo e tente novamente.');await fs.rename(temporary,target);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
    if(digest(await fs.readFile(target))!==digest(restored))throw new Error('A restauração do limite de FPS não foi confirmada; o backup foi preservado.');
    await fs.unlink(journal);return {restored:true,changed:true,previous:record.previous};
  });}
  return {inspect,capture,restore};
}
