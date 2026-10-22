import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const MAX_FILE=2*1024*1024,MAX_RECORDS=10,MAX_SAMPLES=960;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clean=(value,max=320)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const metric=(value,min=-1e12,max=1e12)=>finite(value)&&value>=min&&value<=max?value:'unknown';
const integer=(value,min=0,max=1e9)=>Number.isSafeInteger(value)&&value>=min&&value<=max?value:'unknown';

function sanitizeFrameCapture(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const result={status:value.status==='available'?'available':'unavailable',version:clean(value.version,40)||'unknown',frameCount:integer(value.frameCount,0,240000),durationMs:metric(value.durationMs,0,3600000),medianMs:metric(value.medianMs,0,3600000),p95Ms:metric(value.p95Ms,0,3600000),p99Ms:metric(value.p99Ms,0,3600000),meanFps:metric(value.meanFps,0,1e7),onePercentLowFps:metric(value.onePercentLowFps,0,1e7),stutters:integer(value.stutters,0,240000),stutterEligibleFrames:integer(value.stutterEligibleFrames,0,240000),truncated:value.truncated===true,reason:clean(value.reason)};
  const methodology=value.methodology;
  if(methodology&&typeof methodology==='object')result.methodology={stutterFactor:metric(methodology.stutterFactor,1,20),stutterWindow:integer(methodology.stutterWindow,1,4096),stutterMinHistory:integer(methodology.stutterMinHistory,1,4096),timingSource:clean(methodology.timingSource,80)||'unknown',timingDefinition:clean(methodology.timingDefinition,80)||'unknown',stutterDefinition:clean(methodology.stutterDefinition,320)};
  const notes=Array.isArray(value.quality?.notes)?value.quality.notes.filter(item=>typeof item==='string').slice(0,10).map(item=>clean(item,320)):[];
  result.quality={notes};
  const timeline=value.timeline;
  if(Array.isArray(timeline?.samples))result.timeline={samples:timeline.samples.slice(0,MAX_SAMPLES).filter(point=>point&&finite(point.t)&&point.t>=0&&point.t<=3600000&&finite(point.ms)&&point.ms>0&&point.ms<=3600000).map(point=>({t:point.t,ms:point.ms,stutter:point.stutter===true})),maxBuckets:integer(timeline.maxBuckets,1,240)};
  const overhead=value.overhead;
  if(overhead&&typeof overhead==='object')result.overhead={collectorCpuMs:metric(overhead.collectorCpuMs,0,1e9),collectorPeakWorkingSetBytes:metric(overhead.collectorPeakWorkingSetBytes,0,1e12),wallMs:metric(overhead.wallMs,0,3600000),samples:integer(overhead.samples,0,1e8),method:clean(overhead.method,120)||'unknown'};
  return result;
}

function sanitizeRecord(value){
  if(!value||typeof value!=='object'||!UUID.test(value.sessionId)||!['steam','faceit','gamersclub'].includes(value.provider)||!Number.isFinite(Date.parse(value.startedAt))||!Number.isFinite(Date.parse(value.finishedAt)))return null;
  const captureStatus=['available','unavailable','disabled','not-captured'].includes(value.captureStatus)?value.captureStatus:'unavailable';
  return {sessionId:value.sessionId,provider:value.provider,startedAt:new Date(value.startedAt).toISOString(),gameObservedAt:Number.isFinite(Date.parse(value.gameObservedAt))?new Date(value.gameObservedAt).toISOString():null,finishedAt:new Date(value.finishedAt).toISOString(),finishReason:['game-exit','manual-stop','recovery','startup-failed','other'].includes(value.finishReason)?value.finishReason:'other',captureStatus,reason:clean(value.reason),frameCapture:sanitizeFrameCapture(value.frameCapture)};
}

export function createSessionSummaryStore({directory,limit=MAX_RECORDS}={}){
  if(typeof directory!=='string'||!directory)throw Error('Diretório de resumos da sessão inválido.');
  if(!Number.isInteger(limit)||limit<1||limit>MAX_RECORDS)throw Error('Limite de resumos inválido.');
  const file=path.join(directory,'session-summaries.json');let queue=Promise.resolve();
  const exclusive=fn=>(...args)=>{const work=queue.then(()=>fn(...args));queue=work.catch(()=>{});return work;};
  async function ensureDirectory(){await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||path.normalize(await fs.realpath(directory)).toLowerCase()!==path.normalize(directory).toLowerCase())throw Error('Pasta de resumos inválida.');}
  async function read(){await ensureDirectory();try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE)throw Error('Arquivo de resumos inválido.');const data=JSON.parse(await fs.readFile(file,'utf8'));if(data?.version!==1||!Array.isArray(data.records)||data.records.length>MAX_RECORDS)throw Error('Arquivo de resumos inválido.');const records=data.records.map(sanitizeRecord);if(records.some(record=>!record))throw Error('Arquivo de resumos inválido.');return records;}catch(error){if(error.code==='ENOENT')return [];throw error;}}
  async function write(records){await ensureDirectory();const temporary=file+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify({version:1,records:records.slice(0,limit)}));await handle.sync();}finally{await handle.close();}try{await fs.rename(temporary,file);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}}
  const add=exclusive(async value=>{const record=sanitizeRecord(value);if(!record)throw Error('Resumo da sessão inválido.');const records=await read();const next=[record,...records.filter(item=>item.sessionId!==record.sessionId)].slice(0,limit);await write(next);return next[0];});
  const getLast=exclusive(async()=>{const records=await read();return records[0]??null;});
  return {add,getLast};
}
