import fs from 'node:fs/promises';
import path from 'node:path';
import {validateProcessPolicy} from './process-tuning.mjs';
import {readPowerPolicy,powerReasonText} from './power-policy.mjs';
const GUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function createBenchmarkAdapter({directory,system,processTuning,cpuAffinity,getPowerContext,getCpuTopology}){
  const file=path.join(directory,'benchmark-tuning.json');
  async function read(){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Registro de preparação inválido.');const record=JSON.parse(await fs.readFile(file,'utf8'));if(record.version!==1||typeof record.powerChanged!=='boolean'||!(GUID.test(record.originalPowerGuid)||record.originalPowerGuid==='unknown'&&!record.powerChanged)||record.priorRestoreGuid&&!GUID.test(record.priorRestoreGuid))throw new Error('Registro de energia do benchmark inválido.');record.processPolicy=validateProcessPolicy(record.processPolicy);return record;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function save(record){await fs.mkdir(directory,{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(record,null,2));await fs.rename(temp,file);}
  async function prepare({type,preset,processPolicy,userOverride,powerOverride}){
    if(userOverride!==undefined||powerOverride!==undefined)throw Error('Override de energia não disponível; use a política padrão.');
    if(await read())throw new Error('Há preparação anterior de benchmark para restaurar.');
    const policy=validateProcessPolicy(processPolicy);let plans=null;try{plans=await system.getPowerPlans();}catch{}
    const activePlan=typeof plans?.activeGuid==='string'&&GUID.test(plans.activeGuid)?plans.activeGuid:null;
    if(!activePlan)plans=null;
    const power=await readPowerPolicy({route:'benchmark',system,getPowerContext,getCpuTopology,plans});
    // A benchmark must not introduce a power-plan difference between its two
    // sides. Persistent/manual changes remain separately observable in context.
    const powerReason=plans?'benchmark-keep-current':'power-state-unavailable';
    const record={version:1,type,preset,originalPowerGuid:activePlan??'unknown',priorRestoreGuid:GUID.test(plans?.restoreGuid||'')?plans.restoreGuid:null,powerChanged:false,powerPlan:activePlan??'unknown',powerReason,powerPolicy:power.decision,processPolicy:policy,powerMessage:powerReasonText(powerReason)};
    await save(record);
    return {powerChanged:false,powerMessage:record.powerMessage,powerPlan:record.powerPlan,powerReason:record.powerReason,powerPolicy:record.powerPolicy,processPolicy:type==='boosted'&&!policy.automatic?policy:{prioritizeGame:false,backgroundApps:[]},automaticCpu:policy.automatic?'A CPU dinâmica atua na sessão de jogo, não durante esta medição controlada.':null,graphics:'Configuração atual, sem alteração automática de vídeo/driver.'};
  }
  async function onGameStart({type,prepared}){
    if(type!=='boosted')return {priority:null,affinity:null};const policy=validateProcessPolicy(prepared?.processPolicy);
    const report={priority:null,affinity:null};if(policy.prioritizeGame||policy.backgroundApps.length||policy.backgroundMemoryPriorityApps?.length)report.priority=await processTuning.apply(policy);
    if(policy.cpuDistribution)report.affinity=await cpuAffinity.apply({backgroundApps:policy.backgroundApps});return report;
  }
  async function cleanup(){const record=await read();if(!record)return;const errors=[];
    for(const module of [cpuAffinity,processTuning])try{await module.restore();}catch(error){errors.push(error.message);}
    try{if(record.powerChanged){const plans=await system.getPowerPlans();if(![record.originalPowerGuid,'8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'].includes(plans.activeGuid))throw new Error('O plano de energia mudou fora do benchmark. Sua escolha e o backup foram preservados; selecione o plano da medição ou o anterior antes de tentar restaurar.');if(record.priorRestoreGuid)await system.activatePowerPlan(record.originalPowerGuid);else if(plans.restoreGuid)await system.restorePowerPlan();else if(plans.activeGuid!==record.originalPowerGuid)throw new Error('Registro de energia do benchmark precisa de recuperação.');}}catch(error){errors.push(error.message);}
    if(errors.length)throw new Error(errors.join(' '));await fs.unlink(file);
  }
  return {prepare,onGameStart,cleanup,recover:cleanup};
}
