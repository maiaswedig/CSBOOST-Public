import {readFirmwarePlatform} from './firmware-platform.mjs';

export const HIGH_PERFORMANCE_PLAN='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const routes=['boost','session','benchmark'],sources=['ac','battery','unknown'],factors=['laptop','desktop','unknown'],x3dStates=['yes','no','unknown'];

// Overrides are interpreted only after a caller has obtained explicit advanced
// confirmation. Current product entry points do not expose or accept overrides.
export function decidePowerPlan(ctx){
  if(!ctx||!routes.includes(ctx.route)||!sources.includes(ctx.powerSource)||!factors.includes(ctx.formFactor)||!x3dStates.includes(ctx.x3d)||typeof ctx.highPerformancePlanExists!=='boolean'||![null,'force-high','force-keep'].includes(ctx.userOverride))throw Error('Contexto da política de energia inválido.');
  const result=(allowHighPerformance,reason,confidence='known')=>({route:ctx.route,allowHighPerformance,reason,confidence});
  if(!ctx.highPerformancePlanExists)return result(false,'plan-missing');
  if(ctx.userOverride!==null)return result(ctx.userOverride==='force-high','user-override');
  if(ctx.powerSource!=='ac')return result(false,'power-not-confirmed',ctx.powerSource==='unknown'?'unknown':'known');
  if(ctx.x3d!=='no')return result(false,'x3d-or-unknown',ctx.x3d==='unknown'?'unknown':'known');
  if(ctx.formFactor==='laptop')return result(false,'laptop-default-keep');
  return result(true,'eligible',ctx.formFactor==='unknown'?'unknown':'known');
}

export function powerPolicyContext({route,powerContext,hardware,topology,highPerformancePlanExists,userOverride=null}){
  const powerSource=sources.includes(powerContext?.powerSource)?powerContext.powerSource:powerContext?.onBattery===false?'ac':powerContext?.onBattery===true?'battery':'unknown';
  const formFactor=factors.includes(powerContext?.formFactor)?powerContext.formFactor:factors.includes(hardware?.formFactor)?hardware.formFactor:powerContext?.hasBattery===true?'laptop':powerContext?.hasBattery===false?'desktop':'unknown';
  const cpu=typeof hardware?.cpu==='string'?hardware.cpu.trim():'';
  // Missing topology is never evidence against X3D. A positive model-name
  // heuristic remains useful; an absent/unidentified CPU stays unknown.
  const x3d=topology?.x3d==='yes'||/X3D/i.test(cpu)?'yes':x3dStates.includes(hardware?.x3d)?hardware.x3d:cpu&&!/unknown|unidentified|não identificad|desconhecid/i.test(cpu)?'no':'unknown';
  return {route,powerSource,formFactor,x3d,highPerformancePlanExists,userOverride};
}

export async function readPowerPolicy({route,system,getPowerContext,getCpuTopology,plans}){
  const readContext=getPowerContext??(typeof system?.getPowerContext==='function'?()=>system.getPowerContext():readFirmwarePlatform);
  const values=await Promise.allSettled([Promise.resolve().then(()=>readContext()),Promise.resolve().then(()=>system.getSystemInfo()),Promise.resolve().then(()=>getCpuTopology?.()??null)]);
  const context=powerPolicyContext({route,powerContext:values[0].status==='fulfilled'?values[0].value:null,hardware:values[1].status==='fulfilled'?values[1].value:null,topology:values[2].status==='fulfilled'?values[2].value:null,highPerformancePlanExists:!!plans?.plans?.some(plan=>plan.guid===HIGH_PERFORMANCE_PLAN)});
  return {context,decision:decidePowerPlan(context)};
}

export function powerReasonText(reason){
  return ({'plan-missing':'Plano Alto desempenho não encontrado neste PC.','power-not-confirmed':'Alimentação AC não confirmada; plano atual preservado.','x3d-or-unknown':'CPU X3D ou identificação insuficiente; plano atual preservado.','laptop-default-keep':'Notebook: plano atual preservado para respeitar os limites da plataforma.','eligible':'Alimentação AC confirmada, CPU não X3D e plano Alto desempenho disponível.','power-state-unavailable':'Estado dos planos de energia indisponível; plano atual preservado.','benchmark-keep-current':'Plano atual preservado nos testes Antes e Depois.','preset-keep-current':'Este preset preserva o plano atual.','user-override':'Decisão avançada de energia confirmada pelo usuário.'})[reason]??'Plano atual preservado; política de energia indisponível.';
}
