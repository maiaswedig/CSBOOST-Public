import {isBrowserPolicy} from './browser-policies.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
const REGISTRY_GAMEBAR='Software\\Microsoft\\GameBar',REGISTRY_DVR='Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',REGISTRY_GPU='Software\\Microsoft\\DirectX\\UserGpuPreferences',REGISTRY_LAYERS='Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
const REGISTRY_TYPES=new Set(['DWord','String']);
function validGameExe(value){return typeof value==='string'&&path.win32.isAbsolute(value)&&!/[\x00-\x1f]/.test(value)&&!value.split(/[\\/]/).includes('..')&&/[\\/]game[\\/]bin[\\/]win64[\\/]cs2\.exe$/i.test(value);}
function validRegistryTarget(request){return isBrowserPolicy(request.key,request.name)||(request.key===REGISTRY_GAMEBAR&&request.name==='AutoGameModeEnabled')||(request.key===REGISTRY_DVR&&request.name==='AppCaptureEnabled')||([REGISTRY_GPU,REGISTRY_LAYERS].includes(request.key)&&validGameExe(request.name));}
function validateRequest(request){
  if(!request||typeof request!=='object'||Array.isArray(request)||typeof request.operation!=='string')return false;
  const op=request.operation,keys=Object.keys(request).sort();
  const exact=expected=>keys.length===expected.length&&expected.every((key,index)=>key===keys[index]);
  if(['memory','security','platform','amdInventory','gpuInventory','systemInfo','externalAudit','networkInfo','browserInventory','discordStatus'].includes(op))return exact(['operation']);
  if(op==='storage')return exact(['drive','operation'])&&typeof request.drive==='string'&&/^[A-Z]:$/.test(request.drive);
  if(op==='gpu')return exact(['gameExe','operation'])&&validGameExe(request.gameExe);
  if(op==='reparseCheck')return exact(['operation','path','recursive'])&&typeof request.path==='string'&&path.win32.isAbsolute(request.path)&&request.path.length<=32767&&!/[\x00-\x1f]/.test(request.path)&&!request.path.split(/[\\/]/).includes('..')&&typeof request.recursive==='boolean';
  if(op==='amdEvents')return exact(['operation','since','until'])&&isTimestamp(request.since)&&isTimestamp(request.until)&&request.since<=request.until;
  if(op==='desktopPreference'){
    if(!['read','write'].includes(request.action)||!["mouseAcceleration","menuDelay","clientAnimations","menuAnimations","tooltipAnimations","listScrolling","comboAnimations"].includes(request.name)||!exact((request.action==='write'?['action','name','operation','value']:['action','name','operation'])))return false;
    if(request.action==='read')return true;
    const v=request.value;if(!v||Object.keys(v).sort().join('|')!=='data|type')return false;
    if(["clientAnimations","menuAnimations","tooltipAnimations","listScrolling","comboAnimations"].includes(request.name))return v.type==='DWord'&&[0,1].includes(v.data);
    return request.name==='menuDelay'?v.type==='DWord'&&Number.isInteger(v.data)&&v.data>=0&&v.data<=0xffffffff:v.type==='String'&&typeof v.data==='string'&&/^\d+,\d+,[012]$/.test(v.data)&&v.data.split(',').every(n=>Number(n)<=2147483647);
  }
  if(op==='registry'){
    if(!['read','write','remove'].includes(request.action)||!validRegistryTarget(request)||!['action','key','name','operation',...(request.action==='write'?['value']:[])].sort().every((key,index)=>key===keys[index])||keys.length!==(request.action==='write'?5:4))return false;
    if(request.action!=='write')return true;
    const value=request.value;if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!=='data|type'||!REGISTRY_TYPES.has(value.type))return false;
    return value.type==='DWord'?Number.isInteger(value.data)&&value.data>=0&&value.data<=0xffffffff:typeof value.data==='string'&&value.data.length<=32767&&!/[\x00]/.test(value.data);
  }
  return false;
}
function isTimestamp(value){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
export async function readSystemInventory(request,{run=execute,workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-system.exe'),platform=process.platform}={}){
  if(!validateRequest(request))throw Error('Consulta nativa inválida.');
  if(platform!=='win32')throw Error('Diagnóstico nativo exige Windows.');
  if(!path.isAbsolute(workerPath)||path.basename(workerPath)!=='csboost-system.exe')throw Error('Worker de sistema inválido.');
  const stat=await fs.lstat(workerPath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Worker de sistema precisa ser um arquivo regular.');
  const timeout=['amdInventory','gpuInventory','amdEvents','systemInfo','reparseCheck'].includes(request.operation)?30000:request.operation==='externalAudit'?12000:3000;
  const {stdout}=await run(workerPath,['--request',Buffer.from(JSON.stringify(request)).toString('base64')],{windowsHide:true,shell:false,timeout,maxBuffer:4*1024*1024,encoding:'utf8'});
  let response;try{response=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw Error('Resposta do diagnóstico inválida.');}
  if(response?.ok!==true||!response.value||typeof response.value!=='object'||Array.isArray(response.value))throw Error('Diagnóstico nativo indisponível.');return response.value;
}
