// Pure CSV/statistics boundary. Column definitions are pinned to the official
// v2.3.1 README-ConsoleApplication.md; --v2_metrics uses the older FrameTime schema.
export const FRAME_UNKNOWN = 'unknown';
export const PRESENTMON_VERSION = '2.3.1';
export const FRAME_SERIES_LIMITS = Object.freeze({maxBytes:64*1024*1024,maxRows:500000,maxFrames:240000,maxStreams:64,maxColumns:128,maxFieldLength:8192,minFrameMs:0.000001,maxDurationMs:3600000});
const UNKNOWN=FRAME_UNKNOWN;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const frameDuration=value=>positive(value)&&value>=FRAME_SERIES_LIMITS.minFrameMs&&value<=FRAME_SERIES_LIMITS.maxDurationMs;
const bool=value=>value===true||value===false?value:UNKNOWN;
const bounded=(value,fallback,min,max)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
const text=value=>String(value??'').trim();
const number=value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text(value))&&Number.isFinite(Number(value))?Number(value):UNKNOWN;
const duration=value=>{const result=number(value);return finite(result)&&result>=0&&result<=FRAME_SERIES_LIMITS.maxDurationMs?result:UNKNOWN;};
const timestamp=value=>{const result=number(value);return finite(result)&&result>=0&&result<=Number.MAX_SAFE_INTEGER/1000?result:UNKNOWN;};
const flag=value=>{const s=text(value).toLowerCase();return s==='1'||s==='true'?true:s==='0'||s==='false'?false:UNKNOWN;};
const missing=value=>['','na','n/a','unknown','null'].includes(text(value).toLowerCase());
const clean=value=>text(value).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160);
const note=(notes,value)=>{if(!notes.includes(value))notes.push(value);};
function withinByteLimit(value,limit){let bytes=0;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);bytes+=c<128?1:c<2048?2:c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff?(i++,4):3;if(bytes>limit)return false;}return true;}

// RFC 4180-style quoting, including embedded newlines and escaped quotes.
// Malformed records are yielded as invalid; a truncated quoted final record is discarded.
function* csvRecords(value,limits){
  let fields=[],field='',quoted=false,closed=false,invalid=false,started=false;
  const append=char=>{if(field.length<limits.maxFieldLength)field+=char;else invalid=true;};
  const finishField=()=>{if(fields.length<limits.maxColumns)fields.push(field);else invalid=true;field='';closed=false;};
  for(let i=0;i<value.length;i++){
    const c=value[i];started=true;
    if(quoted){if(c==='"'){if(value[i+1]==='"'){append('"');i++;}else{quoted=false;closed=true;}}else append(c);continue;}
    if(c==='"'){if(field===''&&!closed)quoted=true;else{invalid=true;append(c);}continue;}
    if(c===','){finishField();continue;}
    if(c==='\n'||c==='\r'){
      if(c==='\r'&&value[i+1]==='\n')i++;
      finishField();if(fields.some(part=>part!==''))yield {fields,invalid};
      fields=[];invalid=false;started=false;continue;
    }
    if(closed&&!/\s/.test(c))invalid=true;
    if(!closed||!/\s/.test(c))append(c);
  }
  if(started||fields.length||field){finishField();yield {fields,invalid:invalid||quoted};}
}

/**
 * All numeric frame timestamps/durations are milliseconds, never QPC ticks.
 * t is rebased to the first valid frame of the chosen stream; timestampOriginMs
 * retains the source origin. Missing/NA optional metrics are the string unknown.
 * The frame metric prefers MsBetweenPresents; FrameTime fallback has a different
 * CPU-frame definition recorded in timingSource/timingDefinition and quality notes.
 */
export function parsePresentMonCsv(input,options={}){
  const notes=[],quality={hagsEnabled:bool(options.hagsEnabled),vulkan:bool(options.vulkan),notes};
  const result={schemaVersion:1,version:clean(options.version||PRESENTMON_VERSION),status:'unavailable',process:'cs2.exe',processId:UNKNOWN,presentRuntime:UNKNOWN,presentRuntimes:Object.create(null),presentModes:Object.create(null),frames:[],dropped:UNKNOWN,droppedKnown:0,displayUnknownRows:0,invalidRows:0,ignoredRows:0,totalRows:0,truncated:false,timingSource:UNKNOWN,timingDefinition:UNKNOWN,timestampSource:UNKNOWN,timestampOriginMs:UNKNOWN,stream:null,quality};
  const fail=message=>{note(notes,message);return result;};
  if(typeof input!=='string'||!input.trim())return fail('CSV vazio ou indisponível.');
  const limits={...FRAME_SERIES_LIMITS};
  for(const key of ['maxBytes','maxRows','maxFrames'])limits[key]=bounded(options[key],limits[key],1,limits[key]);
  if(!withinByteLimit(input,limits.maxBytes)){result.truncated=true;return fail('CSV excede o limite de bytes; estatísticas não calculadas.');}
  const expectedPid=Number.isSafeInteger(options.processId)&&options.processId>0?options.processId:null;
  if(options.processId!=null&&expectedPid===null)return fail('PID esperado inválido.');
  const records=csvRecords(input.replace(/^\ufeff/,''),limits),first=records.next();
  if(first.done||first.value.invalid)return fail('Cabeçalho CSV ausente ou inválido.');
  const headers=first.value.fields.map(value=>text(value).toLowerCase());
  if(new Set(headers).size!==headers.length)return fail('Cabeçalho CSV contém colunas duplicadas.');
  const find=(...names)=>names.map(name=>headers.indexOf(name.toLowerCase())).find(index=>index>=0)??-1;
  const index={application:find('Application'),pid:find('ProcessID'),swap:find('SwapChainAddress'),runtime:find('PresentRuntime','Runtime'),mode:find('PresentMode'),tearing:find('AllowsTearing'),sync:find('SyncInterval'),frame:find('MsBetweenPresents','FrameTime'),time:find('CPUStartTime','CPUStartQPCTime','TimeInSeconds'),cpu:find('MsCPUBusy','CPUBusy'),cpuWait:find('MsCPUWait','CPUWait'),gpu:find('MsGPUBusy','GPUBusy','MsGPUActive'),gpuWait:find('MsGPUWait','GPUWait'),display:find('DisplayLatency'),click:find('MsClickToPhotonLatency','ClickToPhotonLatency'),displayed:find('DisplayedTime'),dropped:find('Dropped'),frameType:find('FrameType')};
  if(index.application<0||index.frame<0||index.time<0)return fail('Faltam colunas verificáveis de aplicação, intervalo ou tempo.');
  if(expectedPid!==null&&index.pid<0)return fail('CSV sem ProcessID; não é possível confirmar o processo esperado.');
  result.timingSource=first.value.fields[index.frame];result.timingDefinition=headers[index.frame]==='frametime'?'cpu-frame-interval':'present-interval';
  result.timestampSource=first.value.fields[index.time];
  if(result.timingDefinition==='cpu-frame-interval')note(notes,'FrameTime mede o intervalo de início de quadros na CPU; não tem definição idêntica a MsBetweenPresents.');
  if(index.pid<0)note(notes,'ProcessID ausente; identificação limitada ao nome cs2.exe.');
  if(index.swap<0)note(notes,'SwapChainAddress ausente; não é possível distinguir fluxos de apresentação.');
  const streams=new Map();let accepted=0;
  for(const record of records){
    if(result.totalRows>=limits.maxRows||accepted>=limits.maxFrames){result.truncated=true;note(notes,'Limite de linhas ou quadros atingido; a série está parcial.');break;}
    result.totalRows++;
    if(record.invalid||record.fields.length!==headers.length){result.invalidRows++;continue;}
    const values=record.fields,get=key=>index[key]>=0?values[index[key]]:undefined;
    if(!/(?:^|[\\/])cs2\.exe$/i.test(text(get('application')))){result.ignoredRows++;continue;}
    const rawPid=number(get('pid')),pid=Number.isSafeInteger(rawPid)&&rawPid>0?rawPid:UNKNOWN;
    if(index.pid>=0&&pid===UNKNOWN){result.invalidRows++;continue;}
    if(expectedPid!==null&&pid!==expectedPid){result.ignoredRows++;continue;}
    let t=timestamp(get('time'));if(finite(t)&&headers[index.time]==='timeinseconds')t*=1000;
    const ms=duration(get('frame'));
    if(!finite(t)||!frameDuration(ms)){result.invalidRows++;continue;}
    const swap=missing(get('swap'))?UNKNOWN:clean(get('swap')),key=String(pid)+'|'+swap;
    let stream=streams.get(key);
    if(!stream){if(streams.size>=limits.maxStreams){result.invalidRows++;note(notes,'Limite de fluxos de apresentação atingido.');continue;}stream={key,pid,swap,frames:[],lastTime:-Infinity};streams.set(key,stream);}
    if(t<=stream.lastTime){result.invalidRows++;continue;}stream.lastTime=t;
    let displayed=UNKNOWN;
    if(index.dropped>=0){const dropped=flag(get('dropped'));if(dropped!==UNKNOWN)displayed=!dropped;}
    if(index.displayed>=0){const displayedTime=duration(get('displayed'));const observed=finite(displayedTime)?true:text(get('displayed')).toLowerCase()==='na'?false:UNKNOWN;if(displayed===UNKNOWN)displayed=observed;else if(observed!==UNKNOWN&&observed!==displayed){result.invalidRows++;continue;}}
    const rawRuntime=missing(get('runtime'))?UNKNOWN:clean(get('runtime')),mode=missing(get('mode'))?UNKNOWN:clean(get('mode'));
    stream.frames.push({t,msBetweenPresents:ms,msCPUBusy:duration(get('cpu')),msCPUWait:duration(get('cpuWait')),msGPUBusy:duration(get('gpu')),msGPUWait:duration(get('gpuWait')),displayLatency:duration(get('display')),clickToPhoton:duration(get('click')),displayed,presentRuntime:rawRuntime,presentMode:mode,allowsTearing:flag(get('tearing')),syncInterval:duration(get('sync')),frameType:missing(get('frameType'))?UNKNOWN:clean(get('frameType'))});accepted++;
  }
  const ordered=[...streams.values()].filter(stream=>stream.frames.length).sort((a,b)=>b.frames.length-a.frames.length||a.key.localeCompare(b.key));
  if(!ordered.length)return fail('Nenhum quadro válido do processo esperado.');
  const selected=ordered[0];result.frames=selected.frames;result.timestampOriginMs=selected.frames[0].t;for(const frame of result.frames)frame.t-=result.timestampOriginMs;result.processId=selected.pid;result.stream={processId:selected.pid,swapChainAddress:selected.swap,selection:'largest-valid-frame-count',streamCount:ordered.length,excludedFrames:accepted-selected.frames.length};
  if(ordered.length>1){result.ignoredRows+=accepted-selected.frames.length;note(notes,'Vários fluxos encontrados; somente o de maior número de quadros válidos foi analisado.');if(ordered[1].frames.length===selected.frames.length)note(notes,'Empate entre fluxos; seleção determinística por PID e endereço, sem confirmação da janela principal.');}
  for(const frame of result.frames){
    result.presentModes[frame.presentMode]=(result.presentModes[frame.presentMode]||0)+1;
    result.presentRuntimes[frame.presentRuntime]=(result.presentRuntimes[frame.presentRuntime]||0)+1;
    if(frame.displayed===false)result.droppedKnown++;else if(frame.displayed===UNKNOWN)result.displayUnknownRows++;
  }
  result.dropped=result.displayUnknownRows?UNKNOWN:result.droppedKnown;
  const runtimes=Object.keys(result.presentRuntimes);
  if(runtimes.length===1){const runtime=runtimes[0].toLowerCase();result.presentRuntime=runtime==='d3d11'?'D3D11':runtime==='d3d12'?'D3D12':runtime==='other'?'Other':UNKNOWN;}
  if(result.presentRuntime==='D3D11'||result.presentRuntime==='D3D12'){if(quality.vulkan===UNKNOWN)quality.vulkan=false;}
  if(runtimes.some(runtime=>runtime.toLowerCase()==='other'))note(notes,'PresentRuntime Other pode ser Vulkan ou OpenGL; a API exata e alguns tempos derivados não são confirmados.');
  if(runtimes.some(runtime=>runtime.toLowerCase()==='dxgi'))note(notes,'DXGI não distingue D3D11 de D3D12; PresentRuntime permanece desconhecido.');
  if(quality.hagsEnabled===true)note(notes,'HAGS ativo: tempos de execução da GPU podem ser imprecisos; razões CPU/GPU ocultas.');
  if(quality.hagsEnabled===UNKNOWN)note(notes,'Estado efetivo de HAGS desconhecido; razões CPU/GPU ocultas.');
  if(quality.vulkan!==false)note(notes,'Vulkan confirmado ou API não confirmada; razões CPU/GPU ocultas.');
  if(result.invalidRows)note(notes,'Linhas inválidas descartadas; confira a contagem antes de comparar.');
  result.status='available';return result;
}

const medianSorted=values=>values.length?values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2:UNKNOWN;
const nearestRank=(values,p)=>values.length?values[Math.max(0,Math.ceil(p*values.length)-1)]:UNKNOWN;
function lowerBound(values,value){let low=0,high=values.length;while(low<high){const mid=(low+high)>>>1;if(values[mid]<value)low=mid+1;else high=mid;}return low;}

/** Descriptive statistics only: no bottleneck classifier and no inferred FPS gain. */
export function summarizeFrameSeries(series,options={}){
  const stutterFactor=finite(options.stutterFactor)&&options.stutterFactor>1&&options.stutterFactor<=20?options.stutterFactor:3;
  const stutterWindow=bounded(options.stutterWindow,120,1,4096),stutterMinHistory=bounded(options.stutterMinHistory,Math.min(10,stutterWindow),1,stutterWindow);
  const frames=Array.isArray(series?.frames)?series.frames.slice(0,FRAME_SERIES_LIMITS.maxFrames).filter(frame=>frameDuration(frame?.msBetweenPresents)):[];
  const sourceNotes=Array.isArray(series?.quality?.notes)?series.quality.notes.filter(value=>typeof value==='string').slice(0,32):[];
  const quality={hagsEnabled:bool(series?.quality?.hagsEnabled),vulkan:bool(series?.quality?.vulkan),notes:[...sourceNotes]};
  const summary={schemaVersion:1,status:frames.length?'available':'unavailable',version:clean(series?.version||PRESENTMON_VERSION),process:'cs2.exe',presentRuntime:series?.presentRuntime||UNKNOWN,presentModes:Object.create(null),stream:series?.stream??null,frameCount:frames.length,durationMs:frames.length>1&&finite(frames[0].t)&&finite(frames.at(-1).t)?frames.at(-1).t-frames[0].t:UNKNOWN,medianMs:UNKNOWN,p95Ms:UNKNOWN,p99Ms:UNKNOWN,meanMs:UNKNOWN,meanFps:UNKNOWN,onePercentLowFps:UNKNOWN,onePercentFrameCount:0,stutters:UNKNOWN,stutterEligibleFrames:0,predominantPresentMode:UNKNOWN,allowsTearing:UNKNOWN,allowsTearingCounts:{yes:0,no:0,unknown:0},cpuBusyRatio:UNKNOWN,gpuBusyRatio:UNKNOWN,cpuBusySamples:0,gpuBusySamples:0,dropped:series?.dropped??UNKNOWN,invalidRows:Number.isInteger(series?.invalidRows)?series.invalidRows:0,ignoredRows:Number.isInteger(series?.ignoredRows)?series.ignoredRows:0,truncated:series?.truncated===true,quality,methodology:{timingSource:series?.timingSource||UNKNOWN,timingDefinition:series?.timingDefinition||UNKNOWN,timestamps:'milliseconds relative to first valid frame in selected stream',population:'valid-presented-frames-in-dominant-stream-including-dropped-presents',percentiles:'nearest-rank; median is the mean of the two middle values for even populations',onePercentLow:'arithmetic mean of 1000/ms for ceil(frameCount*0.01) longest frames; distinct from VProf P1',stutterFactor,stutterWindow,stutterMinHistory,stutterDefinition:'frame ms > factor * median of up to window prior frames; current frame excluded; initial minimum history excluded',stutterCalibration:'initial configurable heuristic; not an industry standard',busyRatios:'arithmetic mean of per-frame busy ms / primary interval ms; no clamping; only with HAGS=false, Vulkan=false, and no Other runtime',comparison:'indício, uma execução por lado; diferença observada neste par'}};
  if(!frames.length)return summary;
  const ordered=frames.map(frame=>frame.msBetweenPresents).sort((a,b)=>a-b);
  summary.medianMs=medianSorted(ordered);summary.p95Ms=nearestRank(ordered,.95);summary.p99Ms=nearestRank(ordered,.99);summary.meanMs=ordered.reduce((sum,value)=>sum+value,0)/ordered.length;summary.meanFps=1000/summary.meanMs;
  const worst=Math.max(1,Math.ceil(ordered.length*.01));summary.onePercentFrameCount=worst;summary.onePercentLowFps=ordered.slice(-worst).reduce((sum,ms)=>sum+1000/ms,0)/worst;
  const rolling=[],queue=[],modes=new Map();let stutters=0;
  // Session summaries can opt in to a bounded chart timeline. Benchmark callers
  // keep the compact statistics-only result so their persisted context stays small.
  const validTimeline=frames.every((frame,index)=>finite(frame.t)&&frame.t>=0&&(index===0||frame.t>=frames[index-1].t));
  const bucketCount=options.includeTimeline===true&&validTimeline?Math.min(240,frames.length):0;
  if(options.includeTimeline===true&&!validTimeline)note(quality.notes,'Gráfico indisponível: timestamps ausentes ou fora de ordem.');
  const buckets=bucketCount?Array.from({length:bucketCount},()=>({first:null,min:null,max:null,stutter:null})):null;
  for(let index=0;index<frames.length;index++){
    const frame=frames[index];let isStutter=false;
    if(rolling.length>=stutterMinHistory){summary.stutterEligibleFrames++;isStutter=frame.msBetweenPresents>stutterFactor*medianSorted(rolling);if(isStutter)stutters++;}
    if(buckets){const sample={index,t:frame.t,ms:frame.msBetweenPresents,stutter:isStutter},bucket=buckets[Math.min(bucketCount-1,Math.floor(index*bucketCount/frames.length))];bucket.first??=sample;if(!bucket.min||sample.ms<bucket.min.ms)bucket.min=sample;if(!bucket.max||sample.ms>bucket.max)bucket.max=sample;if(isStutter&&(!bucket.stutter||sample.ms>bucket.stutter.ms))bucket.stutter=sample;}
    rolling.splice(lowerBound(rolling,frame.msBetweenPresents),0,frame.msBetweenPresents);queue.push(frame.msBetweenPresents);
    if(queue.length>stutterWindow){const prior=queue.shift();rolling.splice(lowerBound(rolling,prior),1);}
    const mode=clean(frame.presentMode)||UNKNOWN;modes.set(mode,(modes.get(mode)||0)+1);
    summary.allowsTearingCounts[frame.allowsTearing===true?'yes':frame.allowsTearing===false?'no':'unknown']++;
  }
  summary.stutters=summary.stutterEligibleFrames?stutters:UNKNOWN;
  if(buckets){const selected=new Map();for(const bucket of buckets)for(const sample of [bucket.first,bucket.min,bucket.max,bucket.stutter])if(sample)selected.set(sample.index,{t:sample.t,ms:sample.ms,stutter:sample.stutter});summary.timeline={samples:[...selected.entries()].sort((a,b)=>a[0]-b[0]).map(([,sample])=>sample),maxBuckets:bucketCount};}
  const predominant=[...modes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));summary.predominantPresentMode=predominant[0]?.[0]||UNKNOWN;for(const [mode,count] of modes)summary.presentModes[mode]=count;
  const counts=summary.allowsTearingCounts;
  summary.allowsTearing=counts.unknown?UNKNOWN:counts.yes&&counts.no?'mixed':counts.yes>0;
  const runtimeOther=frames.some(frame=>String(frame.presentRuntime).toLowerCase()==='other');
  if(quality.hagsEnabled===false&&quality.vulkan===false&&!runtimeOther){
    for(const [property,target,count] of [['msCPUBusy','cpuBusyRatio','cpuBusySamples'],['msGPUBusy','gpuBusyRatio','gpuBusySamples']]){
      const values=frames.filter(frame=>finite(frame[property])&&frame[property]>=0).map(frame=>frame[property]/frame.msBetweenPresents);summary[count]=values.length;if(values.length)summary[target]=values.reduce((sum,value)=>sum+value,0)/values.length;
    }
  }else note(quality.notes,'Razões CPU/GPU indisponíveis: HAGS, API ou precisão da instrumentação não confirmados.');
  if(frames.length<100)note(quality.notes,'Menos de 100 quadros: o 1% low usa um único quadro e tem amostra pequena.');
  return summary;
}
