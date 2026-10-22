export const PROCESS_INVENTORY_LIMIT=256;
const MAX_INVENTORY_INPUT=4096;
export const PROCESS_INVENTORY_WARNING='Inventário parcial: o limite de 256 processos foi atingido. O CSBOOST continua com os processos listados e ignora os demais nesta leitura.';
const EXTERNAL_GOVERNOR_LABELS=Object.freeze({ProcessLasso:'Process Lasso',ProcessGovernor:'ProcessGovernor'});

export function externalGovernorConflict(value){
  const names=[...new Set((Array.isArray(value?.externalGovernorNames)?value.externalGovernorNames:[]).filter(name=>Object.hasOwn(EXTERNAL_GOVERNOR_LABELS,name)))];
  if(value?.externalGovernor!==true&&names.length===0)return null;
  const labels=names.map(name=>EXTERNAL_GOVERNOR_LABELS[name]);
  const manager=labels.length?labels.join(' e '):'Um gerenciador externo de processos';
  return {names,message:`Conflito com ${manager}: o CSBOOST pausou as regras automáticas de prioridade e liberou apenas os ajustes próprios que ainda estavam no valor aplicado. Não fará novos ajustes enquanto o conflito continuar.`};
}

export function normalizeProcessInventory(value){
  const legacy=Array.isArray(value),rows=legacy?value:value?.rows;
  if(!Array.isArray(rows)||rows.length>MAX_INVENTORY_INPUT)throw new Error('Lista de processos inválida.');
  const reported=legacy?false:value.truncated??false;
  if(typeof reported!=='boolean')throw new Error('Sinalização do inventário inválida.');
  const rawNames=legacy?[]:value.externalGovernorNames??[];
  if(!Array.isArray(rawNames)||rawNames.length>8||rawNames.some(name=>typeof name!=='string'||!Object.hasOwn(EXTERNAL_GOVERNOR_LABELS,name)))throw new Error('Lista de gerenciadores externos inválida.');
  const externalGovernor=legacy?false:value.externalGovernor??rawNames.length>0;
  if(typeof externalGovernor!=='boolean')throw new Error('Sinalização de gerenciador externo inválida.');
  const normalized={rows,truncated:reported||rows.length>PROCESS_INVENTORY_LIMIT};
  if(!legacy&&('externalGovernor' in value||'externalGovernorNames' in value))Object.assign(normalized,{externalGovernor:externalGovernor||rawNames.length>0,externalGovernorNames:[...new Set(rawNames)]});
  return normalized;
}

export function limitProcessInventory(rows,prefer){
  if(!Array.isArray(rows)||rows.length>MAX_INVENTORY_INPUT)throw new Error('Lista de processos inválida.');
  if(rows.length<=PROCESS_INVENTORY_LIMIT)return {rows,truncated:false};
  const limited=rows.slice(0,PROCESS_INVENTORY_LIMIT);
  const preferred=typeof prefer==='function'?rows.find(prefer):null;
  if(preferred&&!limited.includes(preferred))limited[PROCESS_INVENTORY_LIMIT-1]=preferred;
  return {rows:limited,truncated:true};
}
