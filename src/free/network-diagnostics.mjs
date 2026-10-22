import {readSystemInventory} from './system-worker.mjs';
export function summarizeNetwork(raw){
  if(!raw||!Array.isArray(raw.adapters)||raw.adapters.length>64)throw Error('Inventário de rede inválido.');
  const adapters=raw.adapters.map((row,index)=>{
    if(!row||!['ethernet','wifi','other'].includes(row.type)||typeof row.up!=='boolean')throw Error('Adaptador de rede inválido.');
    return {label:`Conexão ${index+1}`,type:row.type,up:row.up,linkMbps:typeof row.speedBps==='number'&&Number.isSafeInteger(row.speedBps)&&row.speedBps>0?row.speedBps/1e6:'unknown',gateway:typeof row.gateway==='boolean'?row.gateway:'unknown'};
  });
  const active=adapters.filter(row=>row.up),notes=[];
  if(!active.length)notes.push('Nenhuma interface ativa foi encontrada. Confira cabo, Wi-Fi e modo avião.');
  if(active.some(row=>row.type==='wifi'))notes.push('Há Wi-Fi ativo. Se houver instabilidade, compare uma partida usando cabo no mesmo roteador.');
  if(active.filter(row=>row.gateway===true).length>1)notes.push('Mais de uma conexão informa gateway. Não foi determinada a rota usada pelo jogo; confira VPN e adaptadores virtuais.');
  if(active.some(row=>row.type==='ethernet'&&row.linkMbps!=='unknown'&&row.linkMbps<=100))notes.push('Uma interface Ethernet negocia até 100 Mbps. Confira cabo/porta se ambos deveriam suportar mais; essa leitura não demonstra problema de ping.');
  notes.push('Velocidade do enlace não é velocidade da internet nem ping. Não foram medidos latência, perda de pacotes ou a rota do CS2.');
  return {readOnly:true,adapters,notes};
}
export async function readNetworkDiagnostics({read=readSystemInventory}={}){return summarizeNetwork(await read({operation:'networkInfo'}));}
