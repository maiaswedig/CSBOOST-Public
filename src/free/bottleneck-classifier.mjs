const UNKNOWN='unknown';
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const nonnegative=value=>finite(value)&&value>=0;
const tri=value=>value===true||value===false?value:UNKNOWN;

// Initial, adjustable heuristics only. These are not industry thresholds and
// need calibration against repeatable runs on real hardware before automation.
export const BOTTLENECK_THRESHOLDS=Object.freeze({
  minFrames:120,
  minMetricCoverage:.8,
  consistentShare:.85,
  highConfidenceShare:.97,
  gpuBusyMin:.85,
  gpuWaitMax:.1,
  cpuBusyMin:.85,
  gpuHeadroomMax:.6,
  idleBusyMax:.55,
  stableIntervalMax:.025,
  stableIntervalShare:.85,
  capIntervalTolerance:.08,
  minTelemetrySamples:8,
});

const RANGES=Object.freeze({
  minFrames:[30,5000,true],minMetricCoverage:[.5,1],consistentShare:[.5,1],
  highConfidenceShare:[.5,1],gpuBusyMin:[.5,1.5],gpuWaitMax:[0,1],
  cpuBusyMin:[.5,1.5],gpuHeadroomMax:[0,1.5],idleBusyMax:[0,1.5],
  stableIntervalMax:[.001,.2],stableIntervalShare:[.5,1],capIntervalTolerance:[.01,.3],
  minTelemetrySamples:[3,1000,true],
});

function thresholds(options){
  const supplied=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
  return Object.fromEntries(Object.entries(BOTTLENECK_THRESHOLDS).map(([key,fallback])=>{
    const value=supplied[key],range=RANGES[key];
    return [key,typeof value==='number'&&Number.isFinite(value)&&(range[2]?Number.isInteger(value):true)&&value>=range[0]&&value<=range[1]?value:fallback];
  }));
}

function validFrames(series){
  if(!Array.isArray(series?.frames))return [];
  return series.frames.filter(frame=>nonnegative(frame?.msBetweenPresents)&&frame.msBetweenPresents>0&&frame.msBetweenPresents<=3600000);
}

function classifyResult(kind,reasons,confidence='low',context={},limits=BOTTLENECK_THRESHOLDS){
  return {
    version:1,
    class:kind,
    confidence,
    reasons:[...new Set(reasons.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.slice(0,240)))].slice(0,8),
    context,
    methodology:{
      thresholds:{...limits},
      confidenceMeaning:'Nível qualitativo de evidência; não é probabilidade estatística.',
      calibration:'Heurísticas iniciais configuráveis; não são padrão da indústria e exigem calibração em hardware real.',
    },
  };
}

function effectiveCap(value){
  return value&&typeof value==='object'&&value.effective===true&&value.source==='live-game-query'&&finite(value.value)&&value.value>=30&&value.value<=1000?value.value:UNKNOWN;
}

function trustedThrottle(value,limits){
  return value&&typeof value==='object'&&value.status==='available'&&value.providerValidated===true&&value.limitActive===true&&Number.isInteger(value.samples)&&value.samples>=limits.minTelemetrySamples&&['thermal','power','thermal-and-power'].includes(value.limitType)&&typeof value.source==='string'&&value.source.length>0&&value.source.length<=80;
}

function confidenceFor(share,count,limits,truncated){
  if(!truncated&&share>=limits.highConfidenceShare&&count>=limits.minFrames*4)return 'high';
  if(!truncated&&share>=limits.consistentShare)return 'medium';
  return 'low';
}

/**
 * Classifies only a consistent, well-sampled PresentMon frame series.
 * `context.thermalPower` is accepted only under the explicit contract that its
 * provider has already been validated; this app currently has no such provider.
 */
export function classifyBottleneck(series,context={},options={}){
  if(!context||typeof context!=='object'||Array.isArray(context))context={};
  const limits=thresholds(options),frames=validFrames(series),reasons=[];
  const quality=series?.quality||{},hags=Object.prototype.hasOwnProperty.call(context,'hagsEnabled')?tri(context.hagsEnabled):tri(quality.hagsEnabled);
  const vulkan=Object.prototype.hasOwnProperty.call(context,'vulkan')?tri(context.vulkan):tri(quality.vulkan);
  const runtime=typeof series?.presentRuntime==='string'?series.presentRuntime:UNKNOWN;
  const explicitVsync=tri(context.vsync),isLaptop=tri(context.isLaptop);
  const suppliedCap=context.fpsCap&&typeof context.fpsCap==='object'?context.fpsCap:{};
  const cap=effectiveCap(suppliedCap);
  const persistedCap=finite(suppliedCap.persistedValue)&&suppliedCap.persistedValue>=0&&suppliedCap.persistedValue<=100000?suppliedCap.persistedValue:UNKNOWN;
  const syncValues=frames.map(frame=>frame.syncInterval).filter(nonnegative);
  const syncShare=syncValues.length?syncValues.filter(value=>value>0).length/syncValues.length:null;
  const capturedVsync=syncShare===null?UNKNOWN:syncShare>=limits.stableIntervalShare?true:syncShare<=1-limits.stableIntervalShare?false:UNKNOWN;
  const syncVsync=explicitVsync!==UNKNOWN&&capturedVsync!==UNKNOWN&&explicitVsync!==capturedVsync?UNKNOWN:explicitVsync!==UNKNOWN?explicitVsync:capturedVsync;
  const normalizedContext={hagsEnabled:hags,vulkan,runtime,vsync:syncVsync,vsyncEvidence:syncShare===null?'unknown':'captured-sync-interval',fpsCap:cap,persistedFpsCap:persistedCap,isLaptop};
  const unknown=(why,extra=[])=>classifyResult('unknown',[...why,...extra], 'low',normalizedContext,limits);

  if(series?.status!=='available'||frames.length<limits.minFrames)return unknown(['A série não contém quadros suficientes para um diagnóstico.']);
  if(series?.timingDefinition!=='present-interval')return unknown(['A definição do intervalo não permite comparar CPU/GPU com confiança.']);

  const thermal=context.thermalPower;
  if(trustedThrottle(thermal,limits)){
    const label=thermal.limitType==='thermal'?'limitação térmica':thermal.limitType==='power'?'limite de potência':'limitação térmica ou de potência';
    return classifyResult('thermal-or-power',[`Telemetria validada de ${thermal.source} observou ${label} em ${thermal.samples} amostras.`,`Esta classe descreve um limitador observado; não recomenda nem aplica mudanças.`],confidenceFor(1,Math.min(thermal.samples,frames.length),limits,series.truncated===true),normalizedContext,limits);
  }

  if(hags!==false)return unknown([hags===true?'HAGS está ativo; os tempos de GPU desta captura não são confiáveis para classificar CPU/GPU.':'O estado efetivo de HAGS não foi confirmado; razões CPU/GPU e ociosidade não podem ser usadas.']);
  if(vulkan!==false||runtime==='Other')return unknown([runtime==='Other'?'PresentRuntime Other não distingue Vulkan de OpenGL; métricas derivadas foram ocultadas.':'A API gráfica não foi confirmada como D3D11/D3D12; o diagnóstico CPU/GPU foi suspenso.']);
  if(runtime!=='D3D11'&&runtime!=='D3D12')return unknown(['Runtime gráfico não identificado como D3D11 ou D3D12.']);

  const measured=frames.filter(frame=>nonnegative(frame.msCPUBusy)&&nonnegative(frame.msGPUBusy));
  const coverage=measured.length/frames.length;
  if(measured.length<limits.minFrames||coverage<limits.minMetricCoverage)return unknown(['Faltam amostras coerentes de tempo ocupado da CPU e da GPU.']);

  const ratios=measured.map(frame=>({
    cpu:frame.msCPUBusy/frame.msBetweenPresents,
    gpu:frame.msGPUBusy/frame.msBetweenPresents,
    wait:nonnegative(frame.msGPUWait)?frame.msGPUWait/frame.msBetweenPresents:UNKNOWN,
  }));
  const impossible=ratios.filter(row=>row.cpu>2.5||row.gpu>2.5).length/ratios.length;
  if(impossible>=1-limits.minMetricCoverage)return unknown(['Os tempos ocupados contradizem os intervalos de quadro em parcela relevante da série.']);

  const gpuWaitSamples=ratios.filter(row=>row.wait!==UNKNOWN);
  const gpuEvidence=gpuWaitSamples.filter(row=>row.gpu>=limits.gpuBusyMin&&row.wait<=limits.gpuWaitMax&&row.cpu<limits.cpuBusyMin).length;
  const gpuShare=gpuWaitSamples.length?gpuEvidence/gpuWaitSamples.length:0;
  const cpuEvidence=ratios.filter(row=>row.cpu>=limits.cpuBusyMin&&row.gpu<=limits.gpuHeadroomMax).length;
  const cpuShare=cpuEvidence/ratios.length;

  if(gpuWaitSamples.length/ratios.length>=limits.minMetricCoverage&&gpuShare>=limits.consistentShare&&cpuShare>=limits.consistentShare){
    return unknown(['As evidências de CPU e GPU são simultaneamente dominantes; classificação ambígua.']);
  }
  if(gpuWaitSamples.length/ratios.length>=limits.minMetricCoverage&&gpuShare>=limits.consistentShare&&cpuShare<1-limits.consistentShare){
    return classifyResult('gpu-bound',[
      `MsGPUBusy ficou próximo do intervalo e MsGPUWait foi pequeno em ${(gpuShare*100).toFixed(0)}% das amostras elegíveis.`,
      'Indício de limite pela GPU; limiares experimentais, não um padrão universal.',
    ],confidenceFor(gpuShare,gpuWaitSamples.length,limits,series.truncated===true),normalizedContext,limits);
  }
  if(cpuShare>=limits.consistentShare&&gpuShare<1-limits.consistentShare){
    return classifyResult('cpu-bound',[
      `MsCPUBusy dominou com folga observada na GPU em ${(cpuShare*100).toFixed(0)}% das amostras.`,
      'A série não separa saturação de uma thread de disputa entre processos; não coleta tempo por núcleo/thread.',
    ],confidenceFor(cpuShare,ratios.length,limits,series.truncated===true),normalizedContext,limits);
  }

  const intervals=frames.map(frame=>frame.msBetweenPresents),sorted=[...intervals].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  const median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  const stableCount=intervals.filter(value=>Math.abs(value-median)/median<=limits.stableIntervalMax).length;
  const stableShare=stableCount/intervals.length;
  const mean=intervals.reduce((sum,value)=>sum+value,0)/intervals.length;
  const deviation=Math.sqrt(intervals.reduce((sum,value)=>sum+(value-mean)**2,0)/intervals.length);
  const coefficient=deviation/median;
  const idle=ratios.filter(row=>row.cpu<=limits.idleBusyMax&&row.gpu<=limits.idleBusyMax).length/ratios.length;
  const capMatches=cap!==UNKNOWN&&Math.abs(median-1000/cap)/(1000/cap)<=limits.capIntervalTolerance;
  const syncRequestsVsync=syncShare!==null&&syncShare>=limits.stableIntervalShare;
  const capExplanation=capMatches||explicitVsync===true||syncRequestsVsync;
  const contextConflict=explicitVsync!==UNKNOWN&&capturedVsync!==UNKNOWN&&explicitVsync!==capturedVsync;
  if(contextConflict)return unknown(['O V-Sync informado contradiz o SyncInterval observado.']);
  if(coefficient<=limits.stableIntervalMax&&stableShare>=limits.stableIntervalShare&&idle>=limits.consistentShare&&capExplanation){
    const reasons=[`Intervalos agrupados em torno de ${median.toFixed(2)} ms; CPU e GPU ficaram abaixo do limite de ocupação configurado em ${(idle*100).toFixed(0)}% das amostras.`];
    if(syncRequestsVsync)reasons.push('SyncInterval solicitado foi não-zero de forma consistente; isso é evidência de sincronização solicitada, não confirmação isolada de VSync efetivo.');
    if(capMatches)reasons.push(`O intervalo observado coincide com o limite efetivo consultado de ${cap} FPS.`);
    if(persistedCap!==UNKNOWN)reasons.push(`Limite persistido antes do benchmark: ${persistedCap} FPS; ele não comprova o valor ativo dentro do jogo.`);
    if(isLaptop===true)reasons.push('Notebook informado; esta captura não mede limitador térmico ou de potência.');
    return classifyResult('cap-limited',reasons,confidenceFor(Math.min(stableShare,idle),frames.length,limits,series.truncated===true),normalizedContext,limits);
  }

  reasons.push('Os padrões não sustentam uma classificação consistente de limite por CPU, GPU ou cap.');
  if(isLaptop===true)reasons.push('Notebook informado, mas não há telemetria validada de limite térmico ou de potência.');
  else reasons.push('Sem telemetria validada de temperatura/limite de potência; frequência baixa em repouso não foi usada como prova.');
  if(persistedCap!==UNKNOWN)reasons.push(`O limite persistido (${persistedCap} FPS) não confirma o limite ativo durante o teste.`);
  return unknown(reasons);
}
