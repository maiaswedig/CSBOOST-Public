import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createOwnedState} from './owned-state.mjs';
import {proId,publicImageUrl,publicLogoUrl} from './pro-source.mjs';
import {sanitizeTeamSvg} from './team-svg.mjs';

const MAX_INPUT=1024*1024,MAX_OUTPUT=300*1024,TTL=7*86400000,MAX_FILES=192;
const keyOf=value=>crypto.createHash('sha256').update(value).digest('hex');
export function mediaRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Imagem solicitada inválida.');
  const keys=Object.keys(value);
  if(value.kind==='player'&&keys.length===2&&keys.includes('id'))return {kind:'player',id:proId(value.id)};
  if(value.kind==='team'&&keys.length===2&&keys.includes('name')&&typeof value.name==='string'&&value.name.trim()&&value.name.length<=180)return {kind:'team',name:value.name.trim()};
  throw Error('Imagem solicitada inválida.');
}
export function imageKind(bytes){
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg';
  if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}
function webpSize(bytes){
  const chunk=bytes.toString('ascii',12,16);
  if(chunk==='VP8X'&&bytes.length>=30&&!(bytes[20]&2))return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
  if(chunk==='VP8 '&&bytes.length>=30&&bytes.toString('hex',23,26)==='9d012a')return {width:bytes.readUInt16LE(26)&16383,height:bytes.readUInt16LE(28)&16383};
  if(chunk==='VP8L'&&bytes.length>=25&&bytes[20]===47){const bits=bytes.readUInt32LE(21);return {width:1+(bits&16383),height:1+(bits>>>14&16383)};}return null;
}
// The renderer requests identities, never URLs. PNG/JPEG are decoded and resized
// in Electron. WebP has bounded dimensions and uses Chromium's image decoder.
// Team SVGs are rebuilt as closed geometry and used only as an <img> source.
export function createProMedia({directory,resolve,decodeImage,fetchImpl=fetch,now=()=>Date.now(),isBusy=()=>false}){
  const store=createOwnedState(directory),memory=new Map(),jobs=new Map();let active=0;const queue=[];
  const empty=extra=>({available:false,...extra});
  function remember(key,value){memory.delete(key);memory.set(key,{value,at:now()});while(memory.size>MAX_FILES)memory.delete(memory.keys().next().value);return value;}
  async function prune(){
    const entries=await fs.readdir(directory,{withFileTypes:true});const files=[];
    for(const entry of entries)if(entry.isFile()&&/^[a-f0-9]{64}\.json$/.test(entry.name)){const file=path.join(directory,entry.name),stat=await fs.lstat(file);if(stat.isFile()&&!stat.isSymbolicLink())files.push({file,time:stat.mtimeMs});}
    for(const item of files.sort((a,b)=>b.time-a.time).slice(MAX_FILES))await fs.unlink(item.file).catch(()=>{});
  }
  function valid(value,url){if(!(value?.url===url&&typeof value.loadedAt==='number'&&value.loadedAt<=now()+300000&&typeof value.data==='string'&&value.data.length<=MAX_OUTPUT*1.4&&/^[a-zA-Z0-9+/]+=*$/.test(value.data)))return false;const bytes=Buffer.from(value.data,'base64');if(value.mime==='image/svg+xml')return url.endsWith('.svg')&&sanitizeTeamSvg(bytes.toString('utf8'))===bytes.toString('utf8');if(value.mime==='image/webp'){const size=webpSize(bytes);return imageKind(bytes)==='webp'&&size?.width<=2048&&size?.height<=2048;}return imageKind(bytes)==='png';}
  async function load(request){
    if(isBusy())return empty({deferred:true});
    const ref=await resolve(request);if(!(request.kind==='team'?publicLogoUrl:publicImageUrl)(ref?.url))return empty();
    const file=keyOf(ref.url)+'.json';let saved=null;
    try{const raw=await store.read(file);if(valid(raw,ref.url))saved=raw;}catch{}
    const view=(record,offline=false)=>({available:true,dataUrl:'data:'+(record.mime||'image/png')+';base64,'+record.data,sourceUrl:ref.sourceUrl,label:ref.label,offline:offline||!!ref.offline});
    if(saved&&now()-saved.loadedAt<TTL)return view(saved);
    if(isBusy())return saved?view(saved,true):empty({deferred:true});
    try{
      const response=await fetchImpl(ref.url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'image/png,image/jpeg','User-Agent':'CSBOOST/1.24.0'}});
      const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      const svg=request.kind==='team'&&ref.url.endsWith('.svg')&&mime==='image/svg+xml';
      if(!response.ok||!svg&&!['image/png','image/jpeg','image/webp'].includes(mime)||Number(response.headers.get('content-length'))>MAX_INPUT)throw Error('Imagem pública incompatível.');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_INPUT){await reader.cancel();throw Error('Imagem pública grande demais.');}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=Buffer.concat(chunks),kind=imageKind(bytes);if(!svg&&!kind)throw Error('Formato de imagem inválido.');
      if(isBusy())return saved?view(saved,true):empty({deferred:true});
      // The source CDN sometimes labels PNG bytes as WebP. Magic and actual
      // decoding determine the format; the allowed image MIME still gates input.
      const webp=kind==='webp';if(webp){const size=webpSize(bytes);if(!size||size.width>2048||size.height>2048)throw Error('WebP fora dos limites.');}
      const output=svg?Buffer.from(sanitizeTeamSvg(bytes.toString('utf8'))):webp?bytes:Buffer.from(await decodeImage(bytes,request.kind==='player'?240:120));
      if(!svg&&!webp&&imageKind(output)!=='png'||output.length>MAX_OUTPUT)throw Error('Imagem pública fora dos limites.');
      const record={url:ref.url,loadedAt:now(),mime:svg?'image/svg+xml':webp?'image/webp':'image/png',data:output.toString('base64')};
      try{await store.write(file,record);await prune();}catch{}
      return view(record);
    }catch{return saved?view(saved,true):empty();}
  }
  function drain(){while(active<2&&queue.length){const job=queue.shift();active++;Promise.resolve().then(()=>load(job.request)).catch(()=>empty()).then(value=>{if(!value.deferred)remember(job.key,value);job.done(value);}).finally(()=>{active--;jobs.delete(job.key);drain();});}}
  async function get(value){
    const request=mediaRequest(value),key=JSON.stringify(request),cached=memory.get(key);
    if(cached&&now()-cached.at<(cached.value.available?TTL:60000))return cached.value;
    if(isBusy())return empty({deferred:true});
    if(jobs.has(key))return jobs.get(key);
    if(queue.length>=32)return empty({deferred:true});
    const job=new Promise(done=>queue.push({request,key,done}));jobs.set(key,job);drain();return job;
  }
  return {get};
}
