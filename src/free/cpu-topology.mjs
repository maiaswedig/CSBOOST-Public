import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute=promisify(execFile),integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=value=>value===null||typeof value==='string'&&value.length<=512&&!/[\x00-\x1f]/.test(value);
const mask=value=>{if(typeof value!=='string'||!(/^[a-f\d]{1,16}$/i).test(value)||BigInt('0x'+value)===0n)throw Error('Máscara de cache inválida.');return BigInt('0x'+value);};
const validation={dualCcdX3d:'not-validated',intelHybrid:'not-validated'};
const unknownHealth=()=>({frequencyDomainParked:'unknown',cs2RunningOnCacheDomain:'unknown',vCacheOptimizer:'unknown',xboxGameBar:'unknown',reason:'Sem validação física dos domínios e evidência de execução do CS2; nenhuma preferência de CCD foi presumida.'});
function base(capturedAt){return {schemaVersion:1,readOnly:true,experimental:true,automationEligible:false,mode:'advanced-experimental',capturedAt,source:'GetSystemCpuSetInformation/RelationCache',supported:false,x3d:'unknown',x3dEvidence:'insufficient',cpuName:null,cpuVendor:null,processorGroups:null,activeLogicalProcessors:null,domains:[],efficiencyClasses:[],cacheAsymmetry:'unknown',heterogeneousClasses:'unknown',gameMode:'unknown',health:unknownHealth(),polling:{enabled:false,mode:'on-demand',gameSessionSampling:false},physicalValidation:{...validation},queryDurationMs:null,warnings:[]};}
function validate(raw){
  if(!object(raw)||raw.schemaVersion!==1||raw.source!=='GetSystemCpuSetInformation/RelationCache'||!text(raw.cpuName)||!text(raw.cpuVendor)||!['available','unknown'].includes(raw.cpuSetsStatus)||!['available','unknown'].includes(raw.cacheStatus)||!['enabled','disabled','unknown'].includes(raw.gameMode)||!Array.isArray(raw.cpuSets)||raw.cpuSets.length>4096||!Array.isArray(raw.caches)||raw.caches.length>4096||!Array.isArray(raw.warnings)||raw.warnings.length>32||raw.warnings.some(item=>typeof item!=='string'||item.length>512)||raw.processorGroups!==null&&!integer(raw.processorGroups,1,64)||raw.activeLogicalProcessors!==null&&!integer(raw.activeLogicalProcessors,1,4096)||!Number.isFinite(raw.queryDurationMs)||raw.queryDurationMs<0)throw Error('Inventário de topologia inválido.');
  const ids=new Set(),logical=new Set();
  for(const row of raw.cpuSets){
    if(!object(row)||!integer(row.id,0,0xffffffff)||!integer(row.group,0,63)||!integer(row.logicalProcessorIndex,0,63)||!['coreIndex','lastLevelCacheIndex','numaNodeIndex','efficiencyClass'].every(key=>integer(row[key],0,255))||!['parked','allocated','allocatedToTargetProcess','realTime'].every(key=>typeof row[key]==='boolean'))throw Error('CPU Set inválido.');
    const key=row.group+':'+row.logicalProcessorIndex;if(ids.has(row.id)||logical.has(key))throw Error('CPU Sets duplicados.');ids.add(row.id);logical.add(key);
  }
  for(const cache of raw.caches){if(!object(cache)||cache.level!==3||!integer(cache.sizeBytes,1,0xffffffff)||!integer(cache.cacheType,0,3)||!Array.isArray(cache.groups)||!cache.groups.length||cache.groups.length>64)throw Error('Relação L3 inválida.');const groups=new Set();for(const entry of cache.groups){if(!object(entry)||!integer(entry.group,0,63)||groups.has(entry.group))throw Error('Grupo de cache inválido.');mask(entry.mask);groups.add(entry.group);}}
  return raw;
}
export function describeCpuTopology(input,{capturedAt=new Date().toISOString()}={}){
  const raw=validate(input),result={...base(capturedAt),cpuName:raw.cpuName,cpuVendor:raw.cpuVendor,processorGroups:raw.processorGroups,activeLogicalProcessors:raw.activeLogicalProcessors,gameMode:raw.gameMode,queryDurationMs:raw.queryDurationMs,warnings:[...raw.warnings]};
  const namedX3d=raw.cpuVendor==='AuthenticAMD'&&/\bRyzen\b.*X3D\b/i.test(raw.cpuName??'');
  if(namedX3d){result.x3d='yes';result.x3dEvidence='cpu-name-x3d';}
  if(raw.processorGroups!==null&&raw.processorGroups!==1||raw.activeLogicalProcessors!==null&&raw.activeLogicalProcessors>64||new Set(raw.cpuSets.map(row=>row.group)).size>1){result.reason='unsupported-processor-groups';result.message='Diagnóstico não aplicável: requer um grupo e até 64 processadores lógicos.';return result;}
  if(raw.cpuSetsStatus!=='available'||raw.processorGroups!==1||raw.activeLogicalProcessors===null||!raw.cpuSets.length||raw.cpuSets.length!==raw.activeLogicalProcessors||raw.cpuSets.some(row=>row.group!==0)){result.reason='topology-incomplete';result.message='Topologia incompleta ou indisponível; nenhum domínio foi presumido.';return result;}
  const domains=new Map();for(const row of raw.cpuSets){const key=row.group+':'+row.lastLevelCacheIndex;if(!domains.has(key))domains.set(key,[]);domains.get(key).push({...row});}
  result.domains=[...domains].map(([id,sets])=>{
    sets.sort((a,b)=>a.logicalProcessorIndex-b.logicalProcessorIndex);let bits=0n;for(const row of sets)bits|=1n<<BigInt(row.logicalProcessorIndex);
    // Exact group + complete mask equality only. A subset/superset, split
    // relationship or multiple candidates is ambiguous, even if sizes agree.
    const candidates=raw.cacheStatus==='available'?raw.caches.filter(cache=>cache.groups.length===1&&cache.groups[0].group===sets[0].group&&mask(cache.groups[0].mask)===bits):[];
    const matched=candidates.length===1;return {id,group:sets[0].group,lastLevelCacheIndex:sets[0].lastLevelCacheIndex,logicalProcessors:sets.length,physicalCores:new Set(sets.map(row=>row.coreIndex)).size,mask:bits.toString(16),l3Bytes:matched?candidates[0].sizeBytes:null,l3Match:matched?'exact':'unknown',role:'unknown',parkedLogicalProcessors:sets.filter(row=>row.parked).length,parked:sets.every(row=>row.parked)?'yes':sets.every(row=>!row.parked)?'no':'partial',efficiencyClasses:[...new Set(sets.map(row=>row.efficiencyClass))].sort((a,b)=>a-b),cpuSets:sets};
  }).sort((a,b)=>a.group-b.group||a.lastLevelCacheIndex-b.lastLevelCacheIndex);
  result.supported=true;result.reason='read-only-experimental';result.message='Topologia lida sob demanda. Domínios não identificam CCD, P-cores ou afinidade ideal; nenhuma configuração foi alterada.';
  result.efficiencyClasses=[...new Set(raw.cpuSets.map(row=>row.efficiencyClass))].sort((a,b)=>a-b);result.heterogeneousClasses=result.efficiencyClasses.length>1?'yes':'no';
  const completeCache=result.domains.every(domain=>domain.l3Match==='exact');result.cacheAsymmetry=completeCache?(new Set(result.domains.map(domain=>domain.l3Bytes)).size>1?'yes':'no'):'unknown';
  const knownConventional=raw.cpuVendor==='AuthenticAMD'&&/\bAMD Ryzen [3579] \d{4,5}(?:X|XT|G|GT|GE|F|T)?(?:\s|$)/i.test(raw.cpuName??'')||raw.cpuVendor==='GenuineIntel'&&/\bIntel\b.*\b(?:Core|Xeon|Pentium|Celeron|Processor)\b/i.test(raw.cpuName??'');
  if(!namedX3d&&knownConventional&&completeCache&&result.domains.length===1&&!/\b(?:virtual|qemu|kvm|vmware|hyper-v)\b/i.test(raw.cpuName??'')){result.x3d='no';result.x3dEvidence='recognized-non-x3d-name-complete-single-cache';}
  if(result.cacheAsymmetry==='yes')result.warnings.push('Caches L3 de tamanhos diferentes não provam 3D V-Cache ou o papel de cada domínio.');
  if(!completeCache)result.warnings.push('Sem correspondência L3 única e exata por grupo/máscara; tamanhos não confirmados.');
  result.warnings.push('Testes físicos em X3D de dois CCDs e Intel híbrida pendentes. Não habilita automação de afinidade, CPU Sets ou estacionamento.');return result;
}
export function createCpuTopology({workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-topology.exe'),runWorker,platform=process.platform,arch=process.arch,now=()=>new Date().toISOString()}={}){
  if(typeof workerPath!=='string'||!path.isAbsolute(workerPath)||path.basename(workerPath)!=='csboost-topology.exe'||runWorker!==undefined&&typeof runWorker!=='function'||typeof now!=='function')throw Error('Adaptador de topologia inválido.');
  async function read(){if(runWorker)return runWorker({operation:'read'});if(platform!=='win32'||arch!=='x64')throw Error('Diagnóstico de topologia exige Windows x64.');const stat=await fs.lstat(workerPath);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Worker de topologia precisa ser um arquivo regular.');const {stdout}=await execute(workerPath,['--read'],{windowsHide:true,shell:false,timeout:5000,maxBuffer:2*1024*1024,encoding:'utf8'});const response=JSON.parse(stdout.replace(/^\uFEFF/,''));if(!object(response)||response.ok!==true)throw Error(typeof response?.error==='string'?response.error:'Leitura de topologia indisponível.');return response.value;}
  let inspection=null,sampleTimer=null,sampleInFlight=null,sampleGeneration=0;
  const sampling={enabled:false,intervalMs:null,samples:0,lastCapturedAt:null,lastError:null,frequencyDomainParked:'unknown',domains:[],supported:false,x3d:'unknown'};
  const samplingSnapshot=()=>({...sampling,domains:sampling.domains.map(domain=>({...domain}))});
  async function inspect(){
    if(inspection)return inspection;
    const capturedAt=now();
    inspection=(async()=>{let result;try{result=describeCpuTopology(await read(),{capturedAt});}catch(error){result={...base(capturedAt),reason:'topology-unavailable',message:'Não foi possível ler a topologia; estados desconhecidos foram preservados.',warnings:[String(error?.message||'Consulta indisponível.').slice(0,512)]};}const live=samplingSnapshot();result.polling={enabled:live.enabled,mode:live.enabled?'game-session':'on-demand',gameSessionSampling:live.enabled,intervalMs:live.intervalMs};result.sessionSampling=live;if(live.samples>0)result.health.frequencyDomainParked=live.frequencyDomainParked;return result;})();
    try{return await inspection;}finally{inspection=null;}
  }
  const parkedSummary=domains=>{
    if(!Array.isArray(domains)||!domains.length||domains.some(domain=>!['yes','no','partial'].includes(domain.parked)))return 'unknown';
    if(domains.every(domain=>domain.parked==='yes'))return 'yes';
    if(domains.every(domain=>domain.parked==='no'))return 'no';
    return 'partial';
  };
  async function sample(generation){
    if(sampleInFlight)return sampleInFlight;
    sampleInFlight=(async()=>{
      const result=await inspect();
      if(!sampling.enabled||generation!==sampleGeneration)return samplingSnapshot();
      sampling.samples++;sampling.lastCapturedAt=result.capturedAt;sampling.lastError=result.supported?null:result.message||'Topologia indisponível.';sampling.supported=result.supported===true;sampling.x3d=result.x3d||'unknown';
      sampling.domains=(result.domains||[]).slice(0,64).map(domain=>({id:domain.id,group:domain.group,lastLevelCacheIndex:domain.lastLevelCacheIndex,parked:domain.parked,parkedLogicalProcessors:domain.parkedLogicalProcessors,logicalProcessors:domain.logicalProcessors,l3Bytes:domain.l3Bytes}));
      sampling.frequencyDomainParked=parkedSummary(sampling.domains);
      return samplingSnapshot();
    })();
    try{return await sampleInFlight;}finally{sampleInFlight=null;}
  }
  function startSessionSampling({intervalMs=10000}={}){
    if(!integer(intervalMs,1000,60000))throw Error('Intervalo de amostragem da topologia inválido.');
    if(sampling.enabled&&sampling.intervalMs===intervalMs)return samplingSnapshot();
    if(sampleTimer)clearInterval(sampleTimer);
    sampleGeneration++;sampling.enabled=true;sampling.intervalMs=intervalMs;sampling.lastError=null;const generation=sampleGeneration;
    // The native helper is a short-lived process. A conservative cadence keeps
    // the diagnostic from competing with the game for CPU time.
    sample(generation).catch(error=>{if(sampling.enabled&&generation===sampleGeneration)sampling.lastError=String(error?.message||'Amostragem indisponível.').slice(0,300);});
    sampleTimer=setInterval(()=>{sample(generation).catch(error=>{if(sampling.enabled&&generation===sampleGeneration)sampling.lastError=String(error?.message||'Amostragem indisponível.').slice(0,300);});},intervalMs);sampleTimer.unref?.();
    return samplingSnapshot();
  }
  async function stopSessionSampling(){
    sampleGeneration++;if(sampleTimer)clearInterval(sampleTimer);sampleTimer=null;sampling.enabled=false;sampling.intervalMs=null;
    if(sampleInFlight)await sampleInFlight.catch(()=>{});
    return samplingSnapshot();
  }
  function sessionSampling(){return samplingSnapshot();}
  return {inspect,startSessionSampling,stopSessionSampling,sessionSampling};
}
