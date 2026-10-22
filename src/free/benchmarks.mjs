import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {powerReasonText} from './power-policy.mjs';

const ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function parseBenchmarkLog(text){
  const regex=/\[VProf\]\s*FPS:\s*Avg=([0-9.]+),\s*P1=([0-9.]+)/g;
  const results=[];
  for(const match of text.matchAll(regex)){
    const averageFps=Number(match[1]),onePercentLow=Number(match[2]);
    if(!Number.isFinite(averageFps)||averageFps<=0||averageFps>10000||!Number.isFinite(onePercentLow)||onePercentLow<0||onePercentLow>averageFps)continue;
    results.push({averageFps,onePercentLow,frameTimeMs:1000/averageFps});
  }
  if(!results.length)throw new Error('O arquivo não contém um resultado VProf válido (FPS: Avg=…, P1=…). Execute um benchmark real no CS2 e importe o console.log gerado com -condebug.');
  const result=results.at(-1);
  const summaries=[...text.matchAll(/\[VProf\]\s*Summary of (\d+) frames and (\d+) 1-second intervals/g)];
  const summary=summaries.at(-1);
  return {...result,frames:summary?Number(summary[1]):null,durationSeconds:summary?Number(summary[2]):null,observations:results.length};
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
const UNKNOWN='unknown',unavailable='Indisponível';
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const knownText=value=>typeof value==='string'&&value.trim()&&!['unknown','na','n/a'].includes(value.trim().toLowerCase());
const knownPlan=value=>typeof value==='string'&&ID.test(value)?value.toLowerCase():UNKNOWN;
function frameSummary(context){
  const value=context?.frametimes;if(!value||typeof value!=='object'||Array.isArray(value))return {status:'unavailable',reason:'Coleta detalhada não registrada nesta execução.'};
  const result={...value,status:value.status==='available'?'available':'unavailable'};
  if(value.quality?.hagsEnabled!==false||value.quality?.vulkan!==false||value.presentRuntime==='Other'){
    result.cpuBusyRatio=UNKNOWN;result.gpuBusyRatio=UNKNOWN;
    if(result.bottleneck&&result.bottleneck.class!=='thermal-or-power')result.bottleneck={...result.bottleneck,class:'unknown',confidence:'low',reasons:[value.quality?.hagsEnabled!==false?'HAGS ativo ou não confirmado; classificação CPU/GPU/cap suspensa.':'API gráfica não confirmada; classificação CPU/GPU/cap suspensa.']};
  }
  return result;
}
const formatMetric=(value,suffix='',digits=2)=>numeric(value)?value.toFixed(digits)+suffix:unavailable;
const formatText=value=>knownText(value)?value:unavailable;
const tearingText=value=>value===true?'Sim':value===false?'Não':value==='mixed'?'Variável':unavailable;
function renderFrameDetails(summary){
  const value=summary?.status==='available'?summary:{};
  const row=(label,result)=>'<div><dt>'+escape(label)+'</dt><dd>'+escape(result)+'</dd></div>';
  const methodology=value.methodology;
  const stutter=methodology&&numeric(methodology.stutterFactor)&&numeric(methodology.stutterWindow)&&numeric(methodology.stutterMinHistory)?' Critério experimental: intervalo > '+methodology.stutterFactor+'× a mediana dos até '+methodology.stutterWindow+' quadros anteriores, após '+methodology.stutterMinHistory+' quadros iniciais.':' Critério de picos experimental; consulte a metodologia da captura.';
  const notes=Array.isArray(summary?.quality?.notes)?summary.quality.notes.filter(value=>typeof value==='string').slice(0,32):[];
  const diagnosis=value.bottleneck&&typeof value.bottleneck==='object'?value.bottleneck:null;
  const labels={'gpu-bound':'Indício de limite pela GPU','cpu-bound':'Indício de limite pela CPU','cap-limited':'Indício de limite por sincronização/cap','thermal-or-power':'Limitador térmico/de potência observado',unknown:'Não foi possível classificar'};
  const reasons=Array.isArray(diagnosis?.reasons)?diagnosis.reasons.filter(reason=>typeof reason==='string').slice(0,8).map(reason=>'<li>'+escape(reason)+'</li>').join(''):'';
  const diagnosisHtml=diagnosis?'<h4>Diagnóstico de gargalo</h4><p>'+escape(labels[diagnosis.class]||labels.unknown)+' · evidência '+escape(['low','medium','high'].includes(diagnosis.confidence)?diagnosis.confidence:'low')+'</p><ul>'+reasons+'</ul><small>Heurística experimental; limiares precisam de calibração em hardware real. Não aplica ajustes nem promete ganho de FPS.</small>':'';
  return '<h3>Quadros · PresentMon ETW</h3>'+(summary?.status!=='available'?'<p>'+escape(unavailable+': '+(summary?.reason||'sem série válida nesta execução.'))+'</p>':'')+'<dl>'+row('Quadros válidos',formatMetric(value.frameCount,'',0))+row('FPS médio · ETW (derivado)',formatMetric(value.meanFps,' FPS'))+row('Intervalo mediano',formatMetric(value.medianMs,' ms'))+row('P95 do intervalo',formatMetric(value.p95Ms,' ms'))+row('P99 do intervalo',formatMetric(value.p99Ms,' ms'))+row('1% low · ETW',formatMetric(value.onePercentLowFps,' FPS'))+row('Picos de intervalo',formatMetric(value.stutters,'',0))+row('Modo de apresentação',formatText(value.predominantPresentMode))+row('Tearing permitido',tearingText(value.allowsTearing))+row('Razão CPU / intervalo',formatMetric(value.cpuBusyRatio,'×'))+row('Razão GPU / intervalo',formatMetric(value.gpuBusyRatio,'×'))+'</dl>'+diagnosisHtml+'<p>Indício, uma execução por lado. FPS médio e P1 do VProf são fontes separadas. Fontes diferentes; definições diferentes.</p><small>Mediana do intervalo de quadros; P95/P99 por posto mais próximo. 1% low ETW: média de 1000/ms dos ceil(N × 0,01) quadros mais longos, diferente do P1 VProf.'+escape(stutter)+' Série: '+escape(formatText(methodology?.timingSource))+'.</small>'+notes.map(note=>'<p>'+escape(note)+'</p>').join('');
}
function renderPowerDetails(plan,reason){const guid=knownPlan(plan),name=({'381b4222-f694-41f0-9685-ff5bb260df2e':'Equilibrado','8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c':'Alto desempenho','a1841308-3541-4fab-bc81-f71556f20b4a':'Economia de energia'})[guid]??(guid===UNKNOWN?unavailable:guid);return '<h3>Energia registrada</h3><p>Plano efetivamente usado: '+escape(name)+'.</p><p>'+escape(knownText(reason)?powerReasonText(reason):unavailable)+'</p>';}
// Linear interpolation (R7). These summarize selected runs, not confidence intervals.
function dispersion(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const quantile=p=>{const index=(sorted.length-1)*p,lower=Math.floor(index);return sorted[lower]+(sorted[Math.ceil(index)]-sorted[lower])*(index-lower);};
  const center=median(sorted),q1=quantile(.25),q3=quantile(.75);
  return {minimum:sorted[0],maximum:sorted.at(-1),q1,q3,iqr:q3-q1,mad:median(sorted.map(value=>Math.abs(value-center)))};
}
function describeDifference(before,after){
  const overlaps=before.minimum<=after.maximum&&after.minimum<=before.maximum;
  return {observedRangesOverlap:overlaps,conclusion:overlaps?'Diferença inconclusiva: faixas observadas sobrepostas.':'Faixas observadas separadas; isso não estabelece significância estatística.',absoluteRange:{minimum:after.minimum-before.maximum,maximum:after.maximum-before.minimum},percentRange:before.minimum>0?{minimum:(after.minimum/before.maximum-1)*100,maximum:(after.maximum/before.minimum-1)*100}:null,rangeMethod:'Extremos observados entre as execuções; não é intervalo de confiança.'};
}
export function summarizeBenchmarkRuns(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>10||rows.some(row=>!row||!Number.isFinite(row.averageFps)||row.averageFps<=0||!Number.isFinite(row.onePercentLow)||row.onePercentLow<0||typeof row.sourceSHA256!=='string'))throw Error('Medição inválida.');
  const plans=rows.map(row=>knownPlan(row.context?.powerPlan)),reasons=rows.map(row=>row.context?.powerReason);
  return {runs:rows.length,averageFps:median(rows.map(r=>r.averageFps)),onePercentLow:median(rows.map(r=>r.onePercentLow)),minimumAverage:Math.min(...rows.map(r=>r.averageFps)),maximumAverage:Math.max(...rows.map(r=>r.averageFps)),dispersion:{averageFps:dispersion(rows.map(r=>r.averageFps)),onePercentLow:dispersion(rows.map(r=>r.onePercentLow))},sources:rows.map(r=>({id:r.id,sourceName:r.sourceName,sourceSHA256:r.sourceSHA256})),frametimes:rows.length===1?frameSummary(rows[0].context):{status:'unavailable',reason:'Consulte cada execução individual: resumos de frametimes não podem ser mesclados sem as séries originais.'},powerPlan:plans.every(plan=>plan===plans[0])?plans[0]:UNKNOWN,powerReason:reasons.every(reason=>knownText(reason)&&reason===reasons[0])?reasons[0]:UNKNOWN};
}
export function compareBenchmarkRuns(baseline,optimized,{frameDivergenceThreshold=.1}={}){
  if(!Array.isArray(baseline)||!Array.isArray(optimized)||!baseline.length||!optimized.length||baseline.length>10||optimized.length>10)throw new Error('Selecione entre 1 e 10 medições para cada grupo.');
  const sources=new Set();
  for(const row of [...baseline,...optimized]){if(!row||!Number.isFinite(row.averageFps)||row.averageFps<=0||!Number.isFinite(row.onePercentLow)||row.onePercentLow<0||typeof row.sourceSHA256!=='string')throw new Error('Medição inválida.');if(sources.has(row.sourceSHA256))throw new Error('O mesmo arquivo de origem não pode ser usado duas vezes na comparação.');sources.add(row.sourceSHA256);}
  const before=summarizeBenchmarkRuns(baseline),after=summarizeBenchmarkRuns(optimized);
  const delta=(a,b)=>({absolute:b-a,percent:a>0?(b/a-1)*100:null});
  const warnings=['A comparação resume os arquivos selecionados. Use o mesmo mapa, cenário e tempo de teste; os logs não certificam essas condições.','O próprio aplicativo e outros programas influenciam a medição. As faixas e a dispersão descrevem apenas as execuções selecionadas; não demonstram significância estatística.'];
  if(baseline.length===1||optimized.length===1)warnings.push('Um grupo tem apenas uma execução: dispersão zero não comprova repetibilidade.');
  const contexts=[...baseline,...optimized].map(row=>row.context).filter(Boolean);
  if(contexts.some(context=>context.collectorInterrupted))warnings.push('Uma medição foi recuperada após interrupção do coletor, sem validação contínua do foco. Repita essa execução antes de concluir ganhos de otimização.');
  if(contexts.some(context=>context.stability?.available&&context.stability.count>0))warnings.push('Há eventos WHEA registrados durante uma medição. Eles não identificam sozinhos a causa; confira a estabilidade antes de adotar o ajuste.');
  if(new Set(contexts.map(context=>context.videoSHA256).filter(Boolean)).size>1)warnings.push('As configurações gráficas registradas diferem entre medições. Considere essa mudança ao avaliar PBO/CO.');
  if(new Set(contexts.map(context=>JSON.stringify(context.hardware))).size>1)warnings.push('O hardware registrado difere entre medições.');
  if(new Set(contexts.map(context=>context.memory?.configurationSHA256).filter(Boolean)).size>1)warnings.push('A configuração de memória, placa ou BIOS registrada difere entre medições. A frequência SMBIOS não confirma ativação de XMP/EXPO.');
  if(contexts.some(context=>context.memory)&&contexts.some(context=>!context.memory))warnings.push('Uma medição não inclui leitura de memória. Não é possível conferir a configuração RAM de todos os testes.');
  if(contexts.some(context=>context.tuningNote))warnings.push('Anotações de PBO/CO e memória são informadas pelo usuário; o aplicativo não leu os perfis do firmware.');
  if(new Set(contexts.map(context=>knownPlan(context.powerPlan)).filter(value=>value!==UNKNOWN)).size>1)warnings.push('Os planos de energia efetivamente registrados diferem entre as medições. Confira o mesmo plano Antes e Depois.');
  const captureSignature=row=>{const value=row.context?.frametimes;return value?String(value.status||'unavailable')+':'+String(typeof value.enabled==='boolean'?value.enabled:UNKNOWN):'not-recorded';};
  if(new Set([...baseline,...optimized].map(captureSignature)).size>1)warnings.push('A coleta detalhada de quadros tem presença, ativação ou disponibilidade diferente entre as medições; o custo e as janelas de observação podem diferir.');
  const divergence=numeric(frameDivergenceThreshold)&&frameDivergenceThreshold>0&&frameDivergenceThreshold<=1?frameDivergenceThreshold:.1;
  for(const [label,group]of [['Antes',baseline],['Depois',optimized]])if(group.some(row=>row.context?.frametimes?.status==='available'&&numeric(row.context.frametimes.meanFps)&&row.context.frametimes.meanFps>0&&Math.abs(row.context.frametimes.meanFps/row.averageFps-1)>divergence))warnings.push(label+': FPS do VProf e do PresentMon divergem além do limiar de conferência. Fontes diferentes; definições diferentes, e a janela de captura pode variar.');
  for(const [name,group]of [['Antes',before],['Depois',after]])if((group.maximumAverage-group.minimumAverage)/group.averageFps>0.05)warnings.push(name+': variação superior a 5% entre os FPS médios. Repita o teste em condições estáveis.');
  const single=baseline.length===1||optimized.length===1;
  const difference=key=>({...delta(before[key],after[key]),...describeDifference(before.dispersion[key],after.dispersion[key]),...(single?{conclusion:'Diferença observada nestes testes; uma execução por grupo não permite avaliar repetibilidade.'}:{})});
  return {before,after,averageFps:difference('averageFps'),onePercentLow:difference('onePercentLow'),warnings,frameDivergenceThreshold:divergence,method:baseline.length===1&&optimized.length===1?'Uma medição Antes e uma Depois; diferença observada, sem estimativa da variação entre execuções':'Mediana das execuções selecionadas; IQR e MAD descritivos (quartis por interpolação linear)',comparedAt:new Date().toISOString()};
}
export function createBenchmarks(directory){
  function file(id){if(typeof id!=='string'||!ID.test(id))throw new Error('Resultado inválido.');return path.join(directory,id+'.json');}
  async function read(id){const target=file(id);const st=await fs.lstat(target);if(!st.isFile()||st.isSymbolicLink()||st.size>256*1024)throw new Error('Resultado precisa ser um arquivo regular.');const data=JSON.parse(await fs.readFile(target,'utf8'));if(data.id!==id||!Number.isFinite(data.averageFps)||data.averageFps<=0||!Number.isFinite(data.onePercentLow)||data.onePercentLow<0||typeof data.importedAt!=='string')throw new Error('Resultado inválido.');return data;}
  async function list(){await fs.mkdir(directory,{recursive:true});const rows=[];for(const name of await fs.readdir(directory)){if(!name.endsWith('.json')||!ID.test(name.slice(0,-5)))continue;rows.push(await read(name.slice(0,-5)));}return rows.sort((a,b)=>b.importedAt.localeCompare(a.importedAt));}
  async function importFile(source,{context}={}){if(context!==undefined&&(!context||context.version!==1||JSON.stringify(context).length>64*1024))throw new Error('Contexto de medição inválido.');const stat=await fs.lstat(source);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw new Error('Escolha um arquivo de log regular com até 32 MB.');const bytes=await fs.readFile(source);const result={id:crypto.randomUUID(),...parseBenchmarkLog(bytes.toString('utf8')),importedAt:new Date().toISOString(),sourceName:path.basename(source),sourceSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),...(context?{context}:{})};await fs.mkdir(directory,{recursive:true});await fs.writeFile(file(result.id),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});return result;}
  function renderHtml(report){return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CSBOOST — benchmark</title><style>body{background:#141416;color:#eee;font:16px system-ui;max-width:800px;margin:80px auto;padding:24px}h1{font-size:36px}main{background:#202024;padding:32px;border-radius:20px}b{font-size:28px;color:#9be5bd}dl{display:grid;grid-template-columns:1fr 1fr;gap:24px}dt{color:#aaa}dd{margin:8px 0}small{color:#999;overflow-wrap:anywhere}</style><h1>CSBOOST</h1><main><h2>Resultado real importado do CS2</h2><dl><div><dt>FPS médio</dt><dd><b>${report.averageFps.toFixed(1)}</b></dd></div><div><dt>1% low (P1)</dt><dd><b>${report.onePercentLow.toFixed(1)}</b></dd></div><div><dt>Tempo de quadro médio derivado</dt><dd>${report.frameTimeMs.toFixed(2)} ms</dd></div><div><dt>Arquivo</dt><dd>${escape(report.sourceName)}</dd></div></dl><small>Importado em ${escape(report.importedAt)}<br>SHA-256 ${escape(report.sourceSHA256)}<br>P1 não é o FPS mínimo absoluto. O relatório registra a saída importada, sem certificar o ambiente ou ganhos de otimização.</small></main></html>`;}
  async function compare({baselineIds,optimizedIds}={}){if(!Array.isArray(baselineIds)||!Array.isArray(optimizedIds)||baselineIds.length>10||optimizedIds.length>10)throw new Error('Grupos de comparação inválidos.');return compareBenchmarkRuns(await Promise.all(baselineIds.map(read)),await Promise.all(optimizedIds.map(read)));}
  function renderComparisonHtml(result){
    const signed=value=>(value>0?'+':'')+value.toFixed(1);
    const single=result.before.runs===1&&result.after.runs===1;
    const range=stats=>stats.minimum.toFixed(1)+'–'+stats.maximum.toFixed(1)+' FPS';
    const row=(label,key)=>{const before=result.before.dispersion[key],after=result.after.dispersion[key],delta=result[key];const stats=(group,stats)=>group[key].toFixed(1)+(single?'':'<br>Faixa: '+range(stats)+'<br>IQR '+stats.iqr.toFixed(1)+' · MAD '+stats.mad.toFixed(1));return '<tr><td>'+label+'</td><td>'+stats(result.before,before)+'</td><td>'+stats(result.after,after)+'</td><td>'+(delta.percent===null?'Percentual indisponível':signed(delta.percent)+'%')+(single?'':'<br>Faixa descritiva: '+(delta.percentRange?signed(delta.percentRange.minimum)+'% a '+signed(delta.percentRange.maximum)+'%':'indisponível'))+'<br>'+escape(delta.conclusion)+'</td></tr>';};
    return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CSBOOST — comparação de FPS</title><style>body{font:16px system-ui;background:#141416;color:#eee;max-width:1000px;margin:60px auto;padding:24px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:16px;border-bottom:1px solid #444}p,li{line-height:1.7}small{overflow-wrap:anywhere}dl{display:grid;grid-template-columns:1fr 1fr;gap:16px}dt{color:#aaa}dd{margin:8px 0}</style><h1>CSBOOST — antes e depois</h1><p>'+escape(result.method)+' · '+escape(result.comparedAt)+'</p>'+(single?'<p>Um teste Antes e um Depois. A variação entre execuções não foi medida.</p>':'<p>IQR: amplitude entre os quartis 25% e 75%. MAD: mediana dos desvios absolutos em relação à mediana. Faixas usam mínimos e máximos observados, não intervalos de confiança.</p>')+'<table><tr><th>Métrica</th><th>Antes'+(single?'':' (mediana e dispersão)')+'</th><th>Depois'+(single?'':' (mediana e dispersão)')+'</th><th>Diferença observada</th></tr>'+row('FPS médio · VProf','averageFps')+row('P1 · VProf','onePercentLow')+'</table><ul>'+result.warnings.map(w=>'<li>'+escape(w)+'</li>').join('')+'</ul>'+[['Antes',result.before],['Depois',result.after]].map(([label,group])=>'<h2>'+label+': '+group.runs+(group.runs===1?' execução':' execuções')+'</h2>'+renderFrameDetails(group.frametimes)+renderPowerDetails(group.powerPlan,group.powerReason)+group.sources.map(source=>'<p>'+escape(source.sourceName)+'<br><small>SHA-256 '+escape(source.sourceSHA256)+'</small></p>').join('')).join('')+'</html>';
  }
  function renderWithContext(report){
    const context=report.context;
    const measured=renderFrameDetails(frameSummary(context))+renderPowerDetails(context?.powerPlan,context?.powerReason);
    const html=renderHtml(report).replace('1% low (P1)','P1 · VProf');
    if(!context)return html.replace('</main>',measured+'</main>');
    const stability=context.stability?.available?`${context.stability.count} eventos WHEA durante o teste. Ausência de eventos não certifica estabilidade.`:'Leitura WHEA indisponível.';
    return html.replace('</main>',`${measured}<h3>Contexto registrado</h3>${context.collectorInterrupted?'<p>Coleta recuperada após interrupção. O foco contínuo do jogo não foi validado; repita esta medição antes de concluir ganhos.</p>':''}<p>${escape(context.type==='baseline'?'Antes':'Depois')} · ${escape(context.hardware?.cpu||'CPU não identificada')} · ${escape(context.hardware?.gpu||'GPU não identificada')}</p><p>Placa: ${escape(context.board||'Não identificada')} · BIOS: ${escape(context.bios||'Não identificada')}</p>${context.tuningNote?'<p>Anotação informada pelo usuário: '+escape(context.tuningNote)+'</p>':''}<p>${escape(stability)}</p>${context.memory?'<p>RAM: '+escape(context.memory.moduleCount)+' módulos · '+escape((context.memory.configuredClocksMHz||[]).map(value=>value===null?'Não informado':value+' MHz (SMBIOS)').join(' / '))+'. Perfil XMP/EXPO não confirmado.</p>':''}<small>Os valores de PBO/CO e os perfis de memória não foram lidos do firmware.</small></main>`);
  }
  async function exportHistory(format){
    const reports=await list();
    if(format==='json')return JSON.stringify({format:'csboost-benchmarks',version:1,exportedAt:new Date().toISOString(),reports},null,2);
    if(format!=='csv')throw new Error('Formato de histórico inválido.');
    const cell=value=>{let text=String(value??'');if(typeof value==='string'&&/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    const rows=[['Data','Tipo','Preset','FPS médio','P1 (VProf)','Duração (s)','CPU','GPU','Arquivo de origem','SHA-256','ETW estado','ETW quadros','ETW mediana (ms)','ETW P95 (ms)','ETW P99 (ms)','ETW 1% low (FPS)','ETW picos','ETW modo predominante','ETW tearing','ETW razão CPU','ETW razão GPU','ETW gargalo','ETW confiança qualitativa','ETW razões do gargalo','Plano efetivamente usado','Motivo da política de energia','ETW série','ETW definição dos picos']];
    for(const row of reports){const summary=frameSummary(row.context),frame=summary.status==='available'?summary:{},metric=key=>numeric(frame[key])?frame[key]:unavailable,diagnosis=frame.bottleneck||{};rows.push([row.importedAt,row.context?.type||'importado',row.context?.preset||'',row.averageFps,row.onePercentLow,row.durationSeconds,row.context?.hardware?.cpu||'',row.context?.hardware?.gpu||'',row.sourceName,row.sourceSHA256,summary.status,metric('frameCount'),metric('medianMs'),metric('p95Ms'),metric('p99Ms'),metric('onePercentLowFps'),metric('stutters'),formatText(frame.predominantPresentMode),tearingText(frame.allowsTearing),metric('cpuBusyRatio'),metric('gpuBusyRatio'),formatText(diagnosis.class),formatText(diagnosis.confidence),Array.isArray(diagnosis.reasons)?diagnosis.reasons.join(' | '):unavailable,knownPlan(row.context?.powerPlan)===UNKNOWN?unavailable:knownPlan(row.context.powerPlan),formatText(row.context?.powerReason),formatText(frame.methodology?.timingSource),formatText(frame.methodology?.stutterDefinition)]);}
    return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
  }
  return {list,read,importFile,renderHtml:renderWithContext,compare,renderComparisonHtml,exportHistory};
}
