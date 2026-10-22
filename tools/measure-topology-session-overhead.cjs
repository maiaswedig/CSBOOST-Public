'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),root=path.resolve(__dirname,'..'),worker=path.join(root,'vendor','native','csboost-topology.exe'),count=5,cadenceMs=10000;
function summarize(values){const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];return {min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:at(.95),max:sorted.at(-1)};}
async function main(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('A medição do worker requer Windows x64.');
  const stat=fs.lstatSync(worker);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Worker de topologia inválido.');
  const rows=[];
  for(let index=0;index<count;index++){
    const started=process.hrtime.bigint(),{stdout}=await execute(worker,['--read'],{windowsHide:true,shell:false,timeout:5000,maxBuffer:2*1024*1024,encoding:'utf8'}),wallMs=Number(process.hrtime.bigint()-started)/1e6,response=JSON.parse(stdout.replace(/^\uFEFF/,''));
    if(response?.ok!==true||!response.value||!Number.isFinite(response.value.queryDurationMs))throw Error(response?.error||'Resposta inválida do worker.');
    rows.push({wallMs,queryMs:response.value.queryDurationMs,cpuSetQueryMs:response.value.cpuSetQueryDurationMs,cacheQueryMs:response.value.cacheQueryDurationMs,processCpuMs:response.value.processCpuMs,cpuName:response.value.cpuName,activeLogicalProcessors:response.value.activeLogicalProcessors,domainCount:Array.isArray(response.value.cpuSets)?new Set(response.value.cpuSets.map(item=>item.lastLevelCacheIndex)).size:null});
  }
  const metrics=Object.fromEntries(['wallMs','queryMs','cpuSetQueryMs','cacheQueryMs','processCpuMs'].map(key=>[key,summarize(rows.map(row=>row[key]).filter(Number.isFinite))]));
  const report={schemaVersion:1,capturedAt:new Date().toISOString(),kind:'t9-read-only-topology-sampling-cost-baseline',host:{platform:process.platform,release:os.release(),arch:process.arch,cpu:rows[0].cpuName,activeLogicalProcessors:rows[0].activeLogicalProcessors,cacheDomainCount:rows[0].domainCount},sampleCount:rows.length,proposedSessionCadenceMs:cadenceMs,metrics,estimatedHelperCpuShareOfOneLogicalProcessorPercentAtCadence:metrics.processCpuMs.median/cadenceMs*100,rows,limitations:['Amostras feitas com CS2 fechado; não representam o custo durante jogo nem medem FPS/frametimes.','Cada leitura inicia um worker nativo curto; wall inclui inicialização e encerramento do processo.','processCpuMs é o tempo de CPU do helper de uma execução, não prova ausência de interferência no jogo.','X3D de dois CCDs e Intel híbrido não foram validados fisicamente nesta máquina.','O acompanhamento é somente leitura e não aplica afinidade, CPU Sets ou estacionamento.']};
  const target=path.join(root,'analysis','t9-topology-sampling-cost.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file:target,host:report.host,metrics,estimatedHelperCpuShareOfOneLogicalProcessorPercentAtCadence:report.estimatedHelperCpuShareOfOneLogicalProcessorPercentAtCadence},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
