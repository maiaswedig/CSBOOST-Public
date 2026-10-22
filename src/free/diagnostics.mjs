import path from 'node:path';
import {readSystemInventory} from './system-worker.mjs';
const row=(id,title,status,message,howToFix)=>({id,title,status,message,howToFix});
const unknown=(id,title,message='Consulta indisponível.')=>row(id,title,'unknown',message,'Confira nas configurações do Windows ou no manual do equipamento.');
async function bounded(operation,timeoutMs){let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Prazo da consulta excedido.')),timeoutMs);})]);}finally{clearTimeout(timer);}}
export function diagnoseMemory(value){
  if(!value?.available||!Array.isArray(value.modules)||!value.modules.length)return unknown('ram-config','Memória');
  if(value.modules.length===1)return row('ram-config','Memória','attention','Um módulo informado: possível canal único. Isso não comprova o modo dos canais.','Confira módulos, slots recomendados e compatibilidade no manual da placa.');
  if(value.modules.some(item=>Number.isFinite(item.reportedSpeed)&&Number.isFinite(item.configuredClockMHz)&&item.reportedSpeed>0&&item.configuredClockMHz>0&&item.configuredClockMHz<item.reportedSpeed*.9))return row('ram-config','Memória','attention','A frequência configurada está abaixo da velocidade informada. XMP/EXPO possivelmente desativado; SMBIOS não confirma o perfil.','Use o fluxo assistido de XMP/EXPO e confira o manual e a estabilidade.');
  return unknown('ram-config','Memória',`${value.modules.length} módulos informados; canais e perfil XMP/EXPO não foram confirmados.`);
}
export function diagnoseDisplay(value){
  const display=value?.supported&&value.displays?.find(item=>item.primary);if(!display||!Number.isFinite(display.current?.refreshHz))return unknown('display-refresh','Taxa do monitor');
  const current=display.current,frequencies=(display.modes??[]).filter(item=>item.width===current.width&&item.height===current.height&&item.orientation===current.orientation&&!item.interlaced&&item.bitsPerPixel===current.bitsPerPixel&&Number.isFinite(item.refreshHz)).map(item=>item.refreshHz);if(!frequencies.length)return unknown('display-refresh','Taxa do monitor');
  const maximum=Math.max(...frequencies),low=current.refreshHz<maximum*.9;return row('display-refresh','Taxa do monitor',low?'attention':'ok',`${current.refreshHz} Hz atuais; até ${maximum} Hz listados na resolução atual. O modo efetivo dentro do CS2 pode ser diferente.`,'Confira Configurações → Sistema → Tela → Tela avançada. Hz não é o FPS renderizado.');
}
export function diagnoseSecurity(value){
  const hvci=value?.hvci,hags=value?.hags;
  const memory=hvci?.exists&&[0,1].includes(hvci.value)?row('vbs-hvci','Integridade da memória',hvci.value===1?'attention':'ok',hvci.value===1?'A preferência de Integridade da Memória está habilitada. O estado efetivo de VBS/HVCI não foi consultado.':'A preferência de Integridade da Memória está desabilitada; o estado efetivo de VBS/HVCI não foi consultado.','Proteção de segurança: o CSBOOST não desativa esse recurso. Consulte Segurança do Windows → Segurança do dispositivo.'):unknown('vbs-hvci','Integridade da memória','Preferência ausente ou desconhecida; isso não informa o estado efetivo de VBS/HVCI.');
  const scheduler=hags?.exists&&[1,2].includes(hags.value)?row('hags','Agendamento de GPU','ok',hags.value===2?'Preferência de agendamento de GPU por hardware habilitada; suporte e estado efetivo dependem do driver e do reinício.':'Preferência de agendamento de GPU por hardware desabilitada.','Compare nas configurações gráficas do Windows; não há escrita automática.'):unknown('hags','Agendamento de GPU','Estado de agendamento não confirmado; ausência de preferência pode usar o padrão do Windows.');return [memory,scheduler];
}
export function createDiagnostics({system,memoryTuning,displays,readInventory=readSystemInventory,timeoutMs=3000}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>3000)throw Error('Prazo de diagnóstico inválido.');
  async function inspect(){
    const settled=await Promise.allSettled([()=>memoryTuning.snapshot(),()=>displays.inspect(),()=>readInventory({operation:'security'}),async()=>{const game=await system.refreshSteam(),drive=path.win32.parse(game.gamePath??'').root.slice(0,2).toUpperCase();if(!/^[A-Z]:$/.test(drive))throw Error('Volume do CS2 não confirmado.');return readInventory({operation:'storage',drive});},async()=>{const game=await system.refreshSteam();if(!game.cs2Installed)throw Error('CS2 não encontrado.');return readInventory({operation:'gpu',gameExe:path.win32.join(game.gamePath,'game','bin','win64','cs2.exe')});}].map(operation=>bounded(operation,timeoutMs)));
    const get=index=>settled[index].status==='fulfilled'?settled[index].value:null;
    const gpuPreference=get(4)?.gpuPreference;
    const storage=get(3),items=[diagnoseMemory(get(0)),diagnoseDisplay(get(1)),...diagnoseSecurity(get(2)),storage?.available&&[3,4,5].includes(storage.mediaType)?row('storage','Armazenamento do CS2',storage.mediaType===3?'attention':'ok',storage.mediaType===3?'O volume do CS2 foi associado a um HD. Isso pode afetar carregamento e streaming; não comprova limitação de FPS.':'O volume do CS2 foi associado a armazenamento de estado sólido.','Para migrar o jogo, use o gerenciador de armazenamento da Steam.'):unknown('storage','Armazenamento do CS2','Não foi possível associar o volume a um único disco físico e tipo de mídia.'),row('gpu-selection','Preferência de GPU',gpuPreference===2?'ok':'unknown',gpuPreference===2?'O Windows está configurado para preferir a GPU de alto desempenho no CS2. Isso não comprova qual GPU está em uso.':'A GPU efetivamente usada pelo CS2 não foi confirmada.','Confira a preferência gráfica do Windows e o adaptador em uso no jogo.')];
    return {readOnly:true,capturedAt:new Date().toISOString(),items,warnings:settled.filter(item=>item.status==='rejected').map(item=>String(item.reason?.message||'Consulta indisponível.').slice(0,180)),blocksBoost:false};
  }
  return {inspect};
}
