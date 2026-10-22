import fs from 'node:fs/promises';
import path from 'node:path';
import {compareAmdStability} from './amd-tuning.mjs';
const ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const short=value=>String(value||'Não identificado').slice(0,200);

export function createBenchmarkContext({directory,system,amdTuning,memoryTuning,optimizations,nvidia,getSteamId,now=()=>new Date().toISOString()}){
  function file(id){if(!ID.test(id))throw new Error('Identificação de contexto inválida.');return path.join(directory,id+'.json');}
  async function save(record){await fs.mkdir(directory,{recursive:true});const target=file(record.runId),temp=target+'.tmp';await fs.writeFile(temp,JSON.stringify(record,null,2),{mode:0o600});await fs.rename(temp,target);}
  async function begin({id,type,preset,processPolicy,tuningNote=''}){
    const results=await Promise.allSettled([system.getSystemInfo(),amdTuning.inspect(),amdTuning.readStability(),(async()=>optimizations.inspect(await getSteamId(),{preset:'fps',resolution:'keep'}))(),nvidia.inspect(),memoryTuning?.snapshot()]);
    const value=index=>results[index].status==='fulfilled'?results[index].value:null;
    const hardware=value(0),amd=value(1),video=value(3),gpu=value(4),memory=value(5);
    const record={version:1,runId:id,type,preset,startedAt:now(),tuningNote:String(tuningNote||'').slice(0,300),tuningSource:'user-reported; firmware values not read',
      hardware:hardware?{cpu:short(hardware.cpu),gpu:short(hardware.gpu),ramGB:hardware.ramGB,logicalCores:hardware.logicalCores}:null,
      board:amd?.board?short(amd.board.product):null,bios:amd?.bios?short(amd.bios.version):null,
      memory:memory?.available?{source:memory.source,configurationSHA256:memory.configurationSHA256,moduleCount:memory.moduleCount,totalGB:memory.totalGB,configuredClocksMHz:memory.configuredClocksMHz,xmpEnabled:null,expoEnabled:null}:null,
      videoSHA256:video?.sourceSHA256||null,nvidiaDriver:gpu?.snapshot?.driverVersion??null,
      processPolicy,stabilityBefore:value(2),warnings:results.flatMap((result,index)=>result.status==='rejected'?[['Hardware','AMD','WHEA','Vídeo','NVIDIA','Memória'][index]+': '+short(result.reason.message)]:[])};
    await save(record);return {runId:id,startedAt:record.startedAt};
  }
  async function complete(id,{powerPlan='unknown',powerReason='unknown',powerPolicy=null,frametimes=null}={}){
    const target=file(id),stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)throw new Error('Contexto de benchmark inválido.');
    const record=JSON.parse(await fs.readFile(target,'utf8'));if(record.version!==1||record.runId!==id)throw new Error('Contexto de benchmark inválido.');
    let stability;try{const after=await amdTuning.readStability({since:record.stabilityBefore?.capturedAt||record.startedAt});stability=compareAmdStability(record.stabilityBefore,after);}catch(error){stability={available:false,message:short(error.message)};}
    if(typeof powerPlan!=='string'||powerPlan.length>64||typeof powerReason!=='string'||powerReason.length>100||frametimes&&JSON.stringify(frametimes).length>32000)throw Error('Resumo adicional da medição inválido.');
    const result={version:1,runId:id,type:record.type,preset:record.preset,startedAt:record.startedAt,finishedAt:now(),hardware:record.hardware,board:record.board,bios:record.bios,memory:record.memory??null,videoSHA256:record.videoSHA256,nvidiaDriver:record.nvidiaDriver,processPolicy:record.processPolicy,tuningNote:record.tuningNote,tuningSource:record.tuningSource,stability,warnings:record.warnings,powerPlan,powerReason,powerPolicy,frametimes:frametimes??{status:'unavailable',reason:'Coleta detalhada não realizada.'}};
    await save({...record,completed:result});return result;
  }
  return {begin,complete};
}
