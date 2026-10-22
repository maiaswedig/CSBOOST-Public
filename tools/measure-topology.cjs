const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),worker=path.join(root,'vendor','native','csboost-topology.exe');
function summarize(rows,key){const values=rows.map(row=>row[key]).filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)return null;return {samples:values.length,min:values[0],median:values[Math.floor(values.length/2)],p95:values[Math.min(values.length-1,Math.ceil(values.length*.95)-1)],max:values.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};}
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Medição requer Windows x64.');
const rows=[];let identity;
for(let index=0;index<30;index++){
  const start=performance.now(),text=execFileSync(worker,['--read'],{windowsHide:true,timeout:5000,maxBuffer:2*1024*1024,encoding:'utf8'}),elapsedMs=performance.now()-start;
  const response=JSON.parse(text.replace(/^\uFEFF/,''));if(!response.ok)throw Error(response.error);const value=response.value;
  identity??={cpu:value.cpuName,vendor:value.cpuVendor,groups:value.processorGroups,logicalProcessors:value.activeLogicalProcessors,cpuSetsStatus:value.cpuSetsStatus,cacheStatus:value.cacheStatus};
  rows.push({index,wallMs:elapsedMs,queryMs:value.queryDurationMs,cpuSetQueryMs:value.cpuSetQueryDurationMs??null,cacheQueryMs:value.cacheQueryDurationMs??null,processCpuMs:value.processCpuMs??null,peakWorkingSetBytes:value.peakWorkingSetBytes??null});
}
const report={schemaVersion:1,capturedAt:new Date().toISOString(),kind:'on-demand-read-only-topology-cost',os:{platform:process.platform,release:os.release(),arch:process.arch},identity,workerSHA256:crypto.createHash('sha256').update(fs.readFileSync(worker)).digest('hex'),samples:rows.length,metrics:Object.fromEntries(['wallMs','queryMs','cpuSetQueryMs','cacheQueryMs','processCpuMs','peakWorkingSetBytes'].map(key=>[key,summarize(rows,key)])),rows,limits:['Cada amostra iniciou e encerrou um helper; wall inclui criação de processo, CLR e serialização.','queryMs cobre somente a leitura nativa e análise; cpuSetQueryMs inclui enumeração e parsing de CPU Sets/Parked.','processCpuMs e memória foram consultados antes da serialização final; não são custo incremental por amostra de um worker persistente.','Leitura no contexto da ferramenta; preferências HKCU podem diferir do usuário interativo.','CS2 não foi aberto, não houve captura durante jogo nem comparação de FPS/frametimes.','Nenhum polling foi conectado ao watcher. X3D de dois CCDs e Intel híbrido não testados fisicamente.']};
const target=path.join(root,'analysis','cpu-topology-overhead-1.27.0.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file:target,identity,metrics:report.metrics},null,2));
