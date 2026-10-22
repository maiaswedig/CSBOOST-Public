import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute=promisify(execFile);
const DISPLAY_ID=/^\\\\\.\\DISPLAY[1-9]\d{0,9}$/i;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const copy=value=>JSON.parse(JSON.stringify(value));
const capabilities=()=>({
  customResolution:{supported:false,reason:'Criar timings personalizados no driver ainda não foi implementado/validado. A seleção usa apenas modos compatíveis informados pelo Windows.'},
  vibrance:{supported:false,reason:'Controle de vibração digital por jogo, com leitura e restauração da cor anterior, ainda não foi implementado/validado nesta edição.'},
});

function mode(input){
  if(!object(input)||!integer(input.width,320,32768)||!integer(input.height,200,32768)||!integer(input.bitsPerPixel,8,64)||typeof input.interlaced!=='boolean'||!integer(input.orientation,0,3)||(input.refreshHz!==null&&!integer(input.refreshHz,2,2000)))throw new Error('O Windows retornou um modo de monitor inválido.');
  return {width:input.width,height:input.height,refreshHz:input.refreshHz,bitsPerPixel:input.bitsPerPixel,interlaced:input.interlaced,orientation:input.orientation};
}
const modeKey=value=>[value.width,value.height,value.refreshHz??0,value.bitsPerPixel,value.interlaced?1:0,value.orientation].join(':');
const compareModes=(a,b)=>a.width-b.width||a.height-b.height||(a.refreshHz??0)-(b.refreshHz??0)||a.bitsPerPixel-b.bitsPerPixel||Number(a.interlaced)-Number(b.interlaced)||a.orientation-b.orientation;
const profileCompatible=value=>value.width>=640&&value.width<=7680&&value.height>=480&&value.height<=4320&&value.bitsPerPixel===32&&!value.interlaced;

export function validateDisplayInventory(input){
  if(!object(input)||input.source!=='EnumDisplaySettingsExW'||typeof input.enumeratedAt!=='string'||!Number.isFinite(Date.parse(input.enumeratedAt))||!Array.isArray(input.displays)||input.displays.length<1||input.displays.length>32)throw new Error('O Windows não retornou um inventário válido de monitores.');
  const ids=new Set();
  const displays=input.displays.map(display=>{
    if(!object(display)||typeof display.id!=='string'||!DISPLAY_ID.test(display.id)||ids.has(display.id.toUpperCase())||typeof display.adapterName!=='string'||display.adapterName.length>128||typeof display.monitorName!=='string'||display.monitorName.length>8192||typeof display.primary!=='boolean'||!Array.isArray(display.monitorNames)||display.monitorNames.length>64||display.monitorNames.some(name=>typeof name!=='string'||name.length>128)||!Array.isArray(display.modes)||display.modes.length>4096)throw new Error('O Windows retornou um monitor inválido.');
    ids.add(display.id.toUpperCase());
    const current=mode(display.current),unique=new Map();
    for(const raw of display.modes){const value=mode(raw);unique.set(modeKey(value),value);}
    return {id:display.id.toUpperCase(),adapterName:display.adapterName,monitorName:display.monitorName,monitorNames:[...new Set(display.monitorNames)].sort(),primary:display.primary,current,modes:[...unique.values()].sort(compareModes)};
  }).sort((a,b)=>Number(b.primary)-Number(a.primary)||a.id.localeCompare(b.id));
  return {source:'EnumDisplaySettingsExW',enumeratedAt:input.enumeratedAt,displays};
}
export function displayFingerprint(input){
  const value=validateDisplayInventory(input);
  return crypto.createHash('sha256').update(JSON.stringify({source:value.source,displays:value.displays})).digest('hex');
}

export function createDisplays({workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-display.exe'),runWorker}={}){
  if(typeof workerPath!=='string'||!path.isAbsolute(workerPath)||path.basename(workerPath)!=='csboost-display.exe')throw new Error('Caminho do worker de monitores inválido.');
  if(runWorker!==undefined&&typeof runWorker!=='function')throw new Error('Adaptador de monitores inválido.');
  async function read(){
    if(runWorker)return validateDisplayInventory(await runWorker({operation:'read'}));
    if(process.platform!=='win32'||process.arch!=='x64')throw new Error('Inventário de monitores exige Windows de 64 bits.');
    const stat=await fs.lstat(workerPath).catch(()=>null);
    if(!stat?.isFile()||stat.isSymbolicLink())throw new Error('O worker de monitores não está incluído nesta build.');
    let stdout;
    try{({stdout}=await execute(workerPath,['--request',Buffer.from(JSON.stringify({operation:'read'}),'utf8').toString('base64')],{windowsHide:true,timeout:3000,maxBuffer:16*1024*1024,encoding:'utf8',shell:false}));}
    catch(error){
      try{const response=JSON.parse(error.stdout?.replace(/^\uFEFF/,''));if(typeof response.error==='string')throw new Error(response.error);}catch(parsed){if(parsed instanceof SyntaxError)throw new Error('O Windows não permitiu consultar os modos de monitor.');throw parsed;}
      throw new Error('O Windows não permitiu consultar os modos de monitor.');
    }
    let response;try{response=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw new Error('O worker de monitores não retornou uma resposta válida.');}
    if(!object(response)||response.ok!==true)throw new Error(typeof response?.error==='string'?response.error:'O Windows recusou o inventário de monitores.');
    return validateDisplayInventory(response.value);
  }
  async function inspect(){
    try{
      const inventory=await read();
      return {supported:true,source:'windows-supported-display-modes',enumeratedAt:inventory.enumeratedAt,displays:inventory.displays.map(display=>({...display,modes:display.modes.map(value=>({...value,selectable:profileCompatible(value)&&value.orientation===display.current.orientation}))})),fingerprint:displayFingerprint(inventory),...capabilities(),message:'Modos compatíveis informados pelo Windows, em pixels físicos. A consulta não altera monitor/driver; Hz é o valor inteiro retornado pelo Windows.'};
    }catch(error){return {supported:false,source:'windows-supported-display-modes',displays:[],fingerprint:null,...capabilities(),reason:error.message};}
  }
  async function resolveSelection(request){
    if(!object(request)||typeof request.displayId!=='string'||!DISPLAY_ID.test(request.displayId)||!integer(request.width,640,7680)||!integer(request.height,480,4320)||(request.refreshHz!==undefined&&!integer(request.refreshHz,2,2000))||typeof request.previewFingerprint!=='string'||!/^[a-f\d]{64}$/.test(request.previewFingerprint))throw new Error('Atualize o inventário e escolha um modo de monitor listado.');
    const inventory=await read();
    if(displayFingerprint(inventory)!==request.previewFingerprint)throw new Error('Os monitores ou modos disponíveis mudaram desde a consulta. Atualize a lista antes de selecionar.');
    const display=inventory.displays.find(value=>value.id.toUpperCase()===request.displayId.toUpperCase());
    if(!display)throw new Error('O monitor selecionado não está ativo nesta sessão.');
    const candidates=display.modes.filter(value=>value.width===request.width&&value.height===request.height&&profileCompatible(value)&&value.orientation===display.current.orientation&&(request.refreshHz===undefined||value.refreshHz===request.refreshHz));
    if(!candidates.length)throw new Error('Esse modo não foi informado como compatível/progressivo de 32 bits para o monitor selecionado. Resoluções personalizadas não são criadas automaticamente.');
    const chosen=[...candidates].sort((a,b)=>(b.refreshHz??0)-(a.refreshHz??0))[0];
    return {displayId:display.id,monitorName:display.monitorName,...copy(chosen),fingerprint:displayFingerprint(inventory),profileVideo:{width:chosen.width,height:chosen.height,mode:'fullscreen',...(chosen.refreshHz===null?{}:{refreshHz:chosen.refreshHz})},selectionOnly:true,message:'Modo validado para preencher o perfil do CS2. A seleção não alterou o desktop, driver ou monitor. O jogo decide o modo efetivo ao iniciar.'};
  }
  return {inspect,resolveSelection};
}
