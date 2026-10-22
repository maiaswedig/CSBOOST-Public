import path from 'node:path';
import {readSystemInventory} from './system-worker.mjs';

export const GPU_VENDOR_IDS=Object.freeze({'1002':'AMD','10de':'NVIDIA','8086':'Intel'});
export const AMD_GRAPHICS_GUIDE='https://www.amd.com/en/resources/support-articles/faqs/DH3-012.html';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const cleanText=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f]/.test(value);
const AMD_SIGNER=/^Advanced Micro Devices(?:,? Inc\.?)?$/i;
function vendorFromName(name){return /\b(?:AMD|Radeon)\b/i.test(name)?'AMD':/\b(?:NVIDIA|GeForce|Quadro)\b/i.test(name)?'NVIDIA':/\b(?:Intel|Arc|Iris|UHD Graphics)\b/i.test(name)?'Intel':'Desconhecido';}
export function normalizeGpuAdapters(value){
  if(!Array.isArray(value)||value.length>16)throw new Error('Inventário de adaptadores gráficos inválido.');
  const seen=new Set(),result=[];
  for(const item of value){
    if(!object(item)||!cleanText(item.name,256)||typeof item.pnpDeviceId!=='string'||item.pnpDeviceId.length>1024||/[\x00-\x1f]/.test(item.pnpDeviceId))throw new Error('Um adaptador gráfico retornou dados inválidos.');
    const match=/\bVEN_([0-9A-F]{4})\b/i.exec(item.pnpDeviceId),vendorId=match?.[1]?.toLowerCase()??null,vendor=vendorId&&GPU_VENDOR_IDS[vendorId]?GPU_VENDOR_IDS[vendorId]:vendorFromName(item.name),key=item.name.trim().toLowerCase()+'|'+vendorId;
    if(seen.has(key))continue;seen.add(key);result.push({name:item.name.trim(),vendor,vendorId});
  }
  return result;
}
function verifiedAdrenalin(value){
  if(value===null)return false;
  if(!object(value)||!cleanText(value.path,32767)||!path.win32.isAbsolute(value.path)||path.win32.basename(value.path).toLowerCase()!=='radeonsoftware.exe'||value.regular!==true||value.reparse!==false||value.signatureStatus!=='Valid'||!cleanText(value.signer,256)||!AMD_SIGNER.test(value.signer)||typeof value.sha256!=='string'||!/^[a-f\d]{64}$/i.test(value.sha256))return false;
  const normalized=path.win32.normalize(value.path).toLowerCase();
  return /^[a-z]:\\program files\\amd\\cnext\\cnext\\radeonsoftware\.exe$/i.test(normalized);
}
function profileFor(vendors){
  return {
    amd:vendors.includes('AMD')?[
      {name:'Radeon Anti-Lag',value:'Ativar quando o benchmark indicar limite de GPU',reason:'A AMD informa que funciona melhor em cenários limitados pela GPU; compare a latência e os quadros no CS2.',optional:true},
      {name:'Radeon Chill',value:'Desativado para o perfil competitivo',reason:'O limitador dinâmico pode reduzir a taxa de quadros e não funciona junto com Anti-Lag/Boost no Adrenalin.',optional:false},
      {name:'Radeon Boost',value:'Desativado inicialmente; testar só com limite de GPU',reason:'Pode aumentar FPS reduzindo a resolução durante movimentos, com perda temporária de nitidez.',optional:true},
      {name:'Aguardar atualização vertical (VSync)',value:'Controlado pelo jogo / desligado para priorizar latência',reason:'Desligar pode causar tearing; mantenha a escolha consistente com a configuração do CS2.',optional:true},
      {name:'Anti-aliasing e filtragem anisotrópica',value:'Usar configuração do aplicativo',reason:'Evita forçar qualidade ou custo do driver sobre as opções escolhidas no CS2.',optional:false},
      {name:'Qualidade de filtragem de textura',value:'Performance (opcional)',reason:'Prioriza desempenho com possível redução de qualidade visual; compare antes/depois.',optional:true},
    ]:[],
    nvidia:vendors.includes('NVIDIA')?[
      {name:'Perfil do CS2',value:'Aplicação direta pelo CSBOOST quando o driver NVAPI reconhecer a opção',reason:'A prévia mostra os valores e a restauração recupera o perfil anterior.',optional:false},
      {name:'Preferência do Windows',value:'GPU de alto desempenho para CS2',reason:'O booster do Windows aplica essa preferência por jogo e mantém backup restaurável.',optional:false},
    ]:[],
  };
}
function describe(raw){
  if(!object(raw)||!Array.isArray(raw.adapters))throw new Error('O inventário gráfico retornou um formato inválido.');
  const adapters=normalizeGpuAdapters(raw.adapters),vendors=[...new Set(adapters.map(item=>item.vendor).filter(vendor=>vendor!=='Desconhecido'))],adrenalinInstalled=verifiedAdrenalin(raw.adrenalin);
  return {available:true,adapters,vendors,primaryVendor:vendors.length===1?vendors[0]:vendors.length?'Misto':'Desconhecido',amd:{detected:vendors.includes('AMD'),adrenalinInstalled,directProfileControl:false,reason:vendors.includes('AMD')?'A preferência de GPU do Windows pode ser aplicada automaticamente. Os controles de imagem do Adrenalin ficam em um perfil por jogo e são preparados no guia oficial.':null},nvidia:{detected:vendors.includes('NVIDIA'),directProfileControl:vendors.includes('NVIDIA')?'requires-nvapi-check':false,reason:vendors.includes('NVIDIA')?'O perfil por jogo NVIDIA é aplicado separadamente pelo módulo NVAPI e só quando o driver confirma compatibilidade.':null},profile:profileFor(vendors),links:{amdGraphics:AMD_GRAPHICS_GUIDE,amdSoftware:'https://www.amd.com/en/products/software/adrenalin.html'}};
}
export function createGpuDiagnostics({runInventory,openPath,isGameRunning=async()=>false,platform=process.platform,arch=process.arch}={}){
  for(const [name,value]of Object.entries({runInventory,openPath}))if(value!==undefined&&typeof value!=='function')throw new Error(`Adaptador gráfico ${name} inválido.`);
  if(typeof isGameRunning!=='function')throw new Error('Monitor de jogo inválido.');
  async function readInventory(){if(platform!=='win32'||arch!=='x64')throw new Error('Diagnóstico de GPU exige Windows de 64 bits.');return runInventory?runInventory():readSystemInventory({operation:'gpuInventory'});}
  async function inventory(){return describe(await readInventory());}
  async function inspect(){try{return await inventory();}catch(error){return {available:false,adapters:[],vendors:[],primaryVendor:'Desconhecido',amd:{detected:false,adrenalinInstalled:false,directProfileControl:false,reason:error.message},nvidia:{detected:false,directProfileControl:false,reason:error.message},profile:{amd:[],nvidia:[]},links:{amdGraphics:AMD_GRAPHICS_GUIDE,amdSoftware:'https://www.amd.com/en/products/software/adrenalin.html'},reason:error.message};}}
  async function launchAdrenalin(){
    if(!openPath)throw new Error('A abertura do AMD Software não está disponível nesta execução.');
    if(await isGameRunning())throw new Error('Feche o CS2 antes de abrir o perfil gráfico do Adrenalin.');
    const initialRaw=await readInventory(),report=describe(initialRaw);
    if(!report.amd.detected)throw new Error('GPU AMD Radeon não detectada.');
    if(!verifiedAdrenalin(initialRaw.adrenalin))throw new Error('AMD Software: Adrenalin não foi encontrado com assinatura AMD válida. Use a página oficial para instalar ou reparar o driver.');
    if(await isGameRunning())throw new Error('Feche o CS2 antes de abrir o perfil gráfico do Adrenalin.');
    const finalRaw=await readInventory(),initial=initialRaw.adrenalin,final=finalRaw.adrenalin;
    if(!describe(finalRaw).amd.detected||!verifiedAdrenalin(final)||path.win32.normalize(final.path).toLowerCase()!==path.win32.normalize(initial.path).toLowerCase()||final.sha256.toLowerCase()!==initial.sha256.toLowerCase())throw new Error('AMD Software mudou desde a verificação inicial; a abertura foi cancelada. Verifique a instalação oficial e tente novamente.');
    const error=await openPath(final.path);if(error)throw new Error(String(error));return {opened:true,message:'AMD Software aberto. Aplique o perfil apenas ao CS2 e compare o benchmark antes/depois.'};
  }
  return {inspect,launchAdrenalin};
}
