import {readSystemInventory} from './system-worker.mjs';

export const DESKTOP_KEY='SystemParametersInfo';
export const DESKTOP_EFFECTS=Object.freeze([{"id":"clientAnimations","name":"Reduzir animações dos aplicativos"},{"id":"menuAnimations","name":"Menus sem animações"},{"id":"tooltipAnimations","name":"Dicas sem animações"},{"id":"listScrolling","name":"Listas sem rolagem animada"},{"id":"comboAnimations","name":"Listas suspensas sem animações"}]);
export const DESKTOP_ITEMS=Object.freeze([
  ...DESKTOP_EFFECTS.map(item=>({...item,description:'Reduz efeitos visuais de controles compatíveis do Windows. Preferência opcional de resposta visual; não aumenta o FPS do jogo.',key:DESKTOP_KEY,valueName:item.id,after:{exists:true,type:'DWord',data:0}})),
  {id:'mouseAcceleration',name:'Ponteiro sem aceleração',description:'Desativa a aceleração do ponteiro do Windows. Preferência pessoal: não altera DPI, sensibilidade do CS2 ou FPS.',key:DESKTOP_KEY,valueName:'mouseAcceleration',after:{exists:true,type:'String',data:'0,0,0'}},
  {id:'menuDelay',name:'Menus com resposta imediata',description:'Remove a espera para abrir submenus do Windows. Não aumenta FPS e pode facilitar aberturas acidentais de menus.',key:DESKTOP_KEY,valueName:'menuDelay',after:{exists:true,type:'DWord',data:0}},
]);
export function validDesktopValue(name,value){
  if(!value||typeof value!=='object')return false;
  if(DESKTOP_EFFECTS.some(item=>item.id===name))return value.type==='DWord'&&[0,1].includes(value.data);
  if(name==='menuDelay')return value.type==='DWord'&&Number.isInteger(value.data)&&value.data>=0&&value.data<=0xffffffff;
  if(name!=='mouseAcceleration'||value.type!=='String'||typeof value.data!=='string'||!/^\d+,\d+,[012]$/.test(value.data))return false;
  return value.data.split(',').every(part=>Number(part)<=2147483647);
}
export async function runDesktopPreference({action,key,name,value},{read=readSystemInventory}={}){
  if(key!==DESKTOP_KEY||!DESKTOP_ITEMS.some(item=>item.valueName===name)||!['read','write'].includes(action)||action==='write'&&!validDesktopValue(name,value))throw Error('Preferência de interação inválida.');
  const result=await read({operation:'desktopPreference',action,name,...(action==='write'?{value:{type:value.type,data:value.data}}:{})});
  if(action==='read'){if(result?.exists!==true||!validDesktopValue(name,result))throw Error('Leitura da preferência de interação inválida.');return result;}
  if(result?.changed!==true)throw Error('O Windows não confirmou a preferência de interação.');
}
