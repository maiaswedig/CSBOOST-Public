'use strict';
// DOM-only views. All data is supplied by the main app; no IPC, polling,
// system mutations, HTML strings or inferred performance conclusions here.
(() => {
window.createMeasurementViews=function createMeasurementViews({el,append,numberText,svg}){
  if(typeof el!=='function'||typeof append!=='function'||typeof numberText!=='function')throw Error('Ajudantes de visualização indisponíveis.');
  const unavailable='Indisponível',numeric=value=>typeof value==='number'&&Number.isFinite(value);
  const formatted=(value,suffix='')=>numeric(value)?numberText(value)+suffix:unavailable;
  const clean=value=>typeof value==='string'&&value.trim()&&value!=='unknown'?value.slice(0,512):unavailable;
  const tri=value=>value===true||value==='yes'?'Sim':value===false||value==='no'?'Não':value==='mixed'||value==='partial'?'Misto':unavailable;
  function paragraph(parent,text){parent.append(el('p','field-help',text));}
  function rows(values){const list=el('ul','details-list');for(const[label,value,tip]of values){const name=el('span','',label);if(tip){name.title=tip;name.setAttribute('aria-label',label+'. '+tip);}list.append(append(el('li'),name,el('strong','',value)));}return list;}
  function notes(parent,values){if(Array.isArray(values))for(const text of values.filter(value=>typeof value==='string'&&value.trim()).slice(0,10))paragraph(parent,text.slice(0,512));}
  function bottleneckCard(data){
    const labels={'gpu-bound':'Indício de limite pela GPU','cpu-bound':'Indício de limite pela CPU','cap-limited':'Indício de limite por sincronização/cap','thermal-or-power':'Limitador térmico/de potência observado',unknown:'Não foi possível classificar'};
    const confidence={high:'Evidência alta',medium:'Evidência média',low:'Evidência baixa'};
    const panel=el('div','bottleneck-diagnosis');panel.setAttribute('aria-label','Diagnóstico experimental de gargalo');
    const kind=Object.prototype.hasOwnProperty.call(labels,data?.class)?data.class:'unknown';
    append(panel,el('h4','','Diagnóstico de gargalo'),el('p','bottleneck-class',labels[kind]));
    paragraph(panel,'Confiança: '+(confidence[data?.confidence]||confidence.low)+' · nível qualitativo, não probabilidade estatística.');
    const list=el('ul','bottleneck-reasons');
    for(const reason of (Array.isArray(data?.reasons)?data.reasons:[]).filter(value=>typeof value==='string'&&value.trim()).slice(0,8))list.append(el('li','',reason.slice(0,240)));
    if(list.children.length)panel.append(list);else paragraph(panel,'Sem razões mensuráveis registradas.');
    paragraph(panel,'Heurística experimental configurável; thresholds ainda precisam de calibração em hardware real. Este diagnóstico não aplica ajustes nem promete ganho de FPS.');
    return panel;
  }
  function frameSummary(summary){
    const panel=el('section','panel content-card frame-summary');panel.setAttribute('aria-label','Frametimes ETW');
    append(panel,el('h3','','Frametimes · ETW'),el('p','settings-description','Indício, uma execução por lado. Diferença observada neste par.'));
    if(summary?.status!=='available'){
      paragraph(panel,'Indisponível. A medição VProf continua separada, quando disponível.');
      if(summary?.reason)paragraph(panel,clean(summary.reason));notes(panel,summary?.quality?.notes);return panel;
    }
    const method=summary.methodology||{},factor=numeric(method.stutterFactor)&&method.stutterFactor>1?method.stutterFactor:3;
    const percentileTip='Percentil por posição mais próxima (nearest rank) nos intervalos válidos. P95/P99: 95%/99% dos intervalos são menores ou iguais ao valor. Não é FPS.';
    const onePercentTip='Média aritmética de 1000 / intervalo em ms dos ceil(N × 0,01) quadros com maior intervalo. É o 1% low desta série ETW; não equivale ao P1 VProf.';
    append(panel,rows([
      ['Quadros válidos',formatted(summary.frameCount)],
      ['Duração observada',numeric(summary.durationMs)?formatted(summary.durationMs/1000,' s'):unavailable],
      ['Intervalo mediano',formatted(summary.medianMs,' ms'),'Mediana dos intervalos entre quadros; com quantidade par, média dos dois valores centrais. A fonte temporal aparece na metodologia.'],
      ['P95 do intervalo',formatted(summary.p95Ms,' ms'),percentileTip],
      ['P99 do intervalo',formatted(summary.p99Ms,' ms'),percentileTip],
      ['1% low · ETW',formatted(summary.onePercentLowFps,' FPS'),onePercentTip],
      ['Picos de intervalo',formatted(summary.stutters),'Quadros acima de '+numberText(factor)+' × a mediana móvel dos quadros anteriores; o quadro atual não participa da mediana. Heurística experimental ajustável, sem padrão universal.'],
      ['Modo de apresentação',clean(summary.predominantPresentMode)],
      ['Tearing permitido',tri(summary.allowsTearing),'Valor informado pela captura; não confirma tearing visível nem funcionamento de VRR.']
    ]));
    const quality=summary.quality||{},busyTrusted=quality.hagsEnabled===false&&quality.vulkan===false;
    append(panel,rows([
      ['Razão CPU / intervalo',busyTrusted?formatted(summary.cpuBusyRatio,'×'):unavailable,'Média de tempo ocupado de CPU / intervalo por quadro. É uma razão de tempos, não uso global de CPU nem diagnóstico de gargalo.'],
      ['Razão GPU / intervalo',busyTrusted?formatted(summary.gpuBusyRatio,'×'):unavailable,'Média de tempo ocupado de GPU / intervalo por quadro, sem limitar a 100%. Oculta quando HAGS ou API não estão confirmados.']
    ]));
    if(!busyTrusted)paragraph(panel,'Razões CPU/GPU indisponíveis: HAGS ou precisão da API de apresentação não confirmados.');
    if(summary.bottleneck)panel.append(bottleneckCard(summary.bottleneck));
    const definitions=el('details','content-gap measurement-definitions');definitions.append(el('summary','','Definições e qualidade da captura'));
    paragraph(definitions,'1% low ETW: média de FPS dos 1% de intervalos mais longos, usando pelo menos um quadro. FPS médio e P1 do VProf são fontes separadas.');
    paragraph(definitions,'Picos: fator '+numberText(factor)+'× sobre mediana móvel; parâmetro configurável no motor, inicialmente 3×, experimental. Não é um padrão da indústria.');
    const historyWindow=method.stutterWindow,min=method.stutterMinHistory;
    if(numeric(historyWindow)&&numeric(min))paragraph(definitions,'Janela de até '+numberText(historyWindow)+' quadros anteriores; exige pelo menos '+numberText(min)+' quadros de histórico.');
    const timing=clean(method.timingSource);paragraph(definitions,timing===unavailable?'Fonte temporal: Indisponível.':'Fonte temporal: '+timing+'.'+(method.timingDefinition==='cpu-frame-interval'?' Intervalo de início de quadro na CPU; definição diferente de MsBetweenPresents.':method.timingDefinition==='present-interval'?' Intervalo entre apresentações.':''));
    paragraph(definitions,'HAGS informado: '+(quality.hagsEnabled===true?'Habilitado':quality.hagsEnabled===false?'Desabilitado':unavailable)+'. API Vulkan: '+tri(quality.vulkan)+'.');
    if(summary.truncated===true)paragraph(definitions,'Série parcial: o limite de captura foi atingido.');
    if(numeric(summary.invalidRows)&&summary.invalidRows>0)paragraph(definitions,'Linhas inválidas descartadas: '+numberText(summary.invalidRows)+'.');
    notes(definitions,quality.notes);panel.append(definitions);return panel;
  }
  function sessionSummary(record){
    const panel=el('section','panel content-card session-summary');panel.setAttribute('aria-label','Resumo pós-sessão do CS2');
    append(panel,el('h3','','Resumo da última sessão'));
    if(!record){paragraph(panel,'O resumo aparecerá aqui quando uma sessão monitorada terminar.');return panel;}
    const provider={steam:'Steam',faceit:'FACEIT',gamersclub:'Gamers Club'}[record.provider]||'CS2';
    const start=Date.parse(record.gameObservedAt||record.startedAt),end=Date.parse(record.finishedAt),duration=Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,(end-start)/1000):null;
    const ended=record.finishReason==='manual-stop'?'Acompanhamento encerrado manualmente. O CS2 pode ainda estar aberto.':record.finishReason==='recovery'?'Sessão finalizada durante recuperação do CSBOOST.':record.finishReason==='game-exit'?'Jogo encerrado.':record.finishReason==='startup-failed'?'A sessão não chegou a iniciar o jogo.':'Acompanhamento encerrado.';
    paragraph(panel,provider+(Number.isFinite(start)?' · CS2 observado '+new Date(start).toLocaleString('pt-BR'):'')+(duration!==null?' · '+numberText(duration)+' s observados':''));
    paragraph(panel,ended);
    if(record.captureStatus==='disabled'||record.captureStatus==='not-captured'){
      paragraph(panel,record.captureStatus==='disabled'?'Frametimes detalhados estavam desativados nesta sessão. Você pode habilitá-los em Configurações avançadas de medição.':'Nenhum quadro foi coletado porque o jogo não chegou a iniciar.');
      if(record.reason)paragraph(panel,clean(record.reason));return panel;
    }
    const summary=record.frameCapture;
    if(record.captureStatus!=='available'||summary?.status!=='available'){
      paragraph(panel,'Não foi possível gerar estatísticas confiáveis de frametime nesta sessão.');if(record.reason)paragraph(panel,clean(record.reason));else if(summary?.reason)paragraph(panel,clean(summary.reason));return panel;
    }
    append(panel,rows([
      ['Duração dos quadros observados',numeric(summary.durationMs)?formatted(summary.durationMs/1000,' s'):'Indisponível'],
      ['Quadros válidos',formatted(summary.frameCount)],
      ['Intervalo mediano',formatted(summary.medianMs,' ms'),'Mediana dos intervalos de apresentação observados nesta captura.'],
      ['P95 do intervalo',formatted(summary.p95Ms,' ms'),'95% dos intervalos medidos ficaram neste valor ou abaixo.'],
      ['P99 do intervalo',formatted(summary.p99Ms,' ms'),'99% dos intervalos medidos ficaram neste valor ou abaixo.'],
      ['1% low · ETW',formatted(summary.onePercentLowFps,' FPS'),'Média de FPS dos 1% dos intervalos mais longos desta captura. Não equivale ao P1 do VProf.'],
      ['Picos de frametime',formatted(summary.stutters),'Heurística: intervalo acima do fator multiplicado pela mediana dos quadros anteriores.']
    ]));
    const points=Array.isArray(summary.timeline?.samples)?summary.timeline.samples.filter(point=>numeric(point?.t)&&point.t>=0&&numeric(point?.ms)&&point.ms>0).slice(0,960):[];
    if(points.length>=2&&typeof svg==='function'){
      const width=960,height=260,left=58,right=18,top=15,bottom=40,plotWidth=width-left-right,plotHeight=height-top-bottom,maxT=Math.max(points.at(-1).t,1),maxMs=Math.max(...points.map(point=>point.ms),1),chart=svg('svg',{class:'session-frametime-chart',viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Gráfico dos intervalos entre quadros durante a sessão'});
      chart.append(svg('title',{},'Frametime observado durante a sessão'),svg('desc',{},'Cada ponto representa uma amostra agregada da captura. Os marcadores destacados indicam picos conforme a heurística configurada.'));
      for(let tick=0;tick<=4;tick++){const y=top+plotHeight*tick/4,value=maxMs*(4-tick)/4;chart.append(svg('line',{x1:left,y1:y,x2:width-right,y2:y,class:'frametime-gridline'}),svg('text',{x:left-8,y:y+4,'text-anchor':'end',class:'frametime-axis-label'},numberText(value)+' ms'));}
      const coordinate=point=>[left+Math.min(1,point.t/maxT)*plotWidth,top+(1-Math.min(1,point.ms/maxMs))*plotHeight];
      const line=points.map(point=>coordinate(point).map(value=>value.toFixed(2)).join(',')).join(' ');chart.append(svg('polyline',{points:line,class:'frametime-series'}));
      for(const point of points.filter(point=>point.stutter===true).slice(0,240)){const[x,y]=coordinate(point);const marker=svg('circle',{cx:x,cy:y,r:3.2,class:'frametime-stutter'});marker.append(svg('title',{},'Pico: '+numberText(point.ms)+' ms'));chart.append(marker);}
      chart.append(svg('text',{x:left,y:height-10,class:'frametime-axis-label'},'Início'),svg('text',{x:width-right,y:height-10,'text-anchor':'end',class:'frametime-axis-label'},numberText(maxT/1000)+' s'));
      const chartPanel=el('div','session-chart-wrap');chartPanel.append(chart);panel.append(chartPanel);
      append(panel,el('p','field-help','Linha: frametime · Pontos destacados: picos heurísticos. O gráfico resume até 240 grupos de quadros para manter o relatório leve.'));
    }else paragraph(panel,'O gráfico não está disponível porque a captura não produziu pontos suficientes.');
    const method=summary.methodology||{},definitions=el('details','content-gap session-summary-definitions');definitions.append(el('summary','','Como ler este resumo'));
    paragraph(definitions,'P95 e P99 são percentis de intervalos em milissegundos, não FPS. O 1% low ETW é calculado separadamente do VProf.');
    const factor=numeric(method.stutterFactor)&&method.stutterFactor>1?method.stutterFactor:3,window=numeric(method.stutterWindow)?method.stutterWindow:120,min=numeric(method.stutterMinHistory)?method.stutterMinHistory:10;
    paragraph(definitions,'Picos: intervalo acima de '+numberText(factor)+'× a mediana móvel de até '+numberText(window)+' quadros anteriores; exige '+numberText(min)+' quadros de histórico. É uma heurística experimental, não um padrão universal.');
    const timing=clean(method.timingSource);paragraph(definitions,'Fonte temporal: '+timing+'. A coleta começa quando o CSBOOST detecta o jogo e dura no máximo 6 minutos por sessão.');
    paragraph(definitions,'O gráfico e as métricas são um indício desta captura; uma sessão isolada não demonstra causa nem ganho de desempenho.');
    if(summary.truncated===true)paragraph(definitions,'A série atingiu um limite de processamento; o resultado representa apenas os quadros processados.');
    if(summary.overhead&&typeof summary.overhead==='object'){
      const overhead=summary.overhead;paragraph(definitions,'Custo medido somente do processo coletor; estes números não estimam impacto no FPS.');append(definitions,rows([
        ['CPU do coletor',formatted(overhead.collectorCpuMs,' ms')],
        ['Pico de memória do coletor',numeric(overhead.collectorPeakWorkingSetBytes)?formatted(overhead.collectorPeakWorkingSetBytes/2**20,' MiB'):'Indisponível'],
        ['Duração do coletor',formatted(overhead.wallMs,' ms')]
      ]));
    }
    panel.append(definitions);return panel;
  }
  function topologyCard(info){
    const panel=el('section','panel content-card topology-card');panel.setAttribute('aria-label','Topologia de CPU');
    append(panel,el('h3','','Topologia da CPU'),el('p','settings-description','Diagnóstico avançado experimental · somente leitura.'));
    const data=info||{},x3d=data.x3d==='yes'?'Identificado pelo nome da CPU':data.x3d==='no'?'Sem indicação nos dados conferidos':unavailable;
    append(panel,rows([
      ['Processador',clean(data.cpuName)],
      ['Processadores lógicos',formatted(data.activeLogicalProcessors)],
      ['3D V-Cache',x3d],
      ['Modo de Jogo · preferência',data.gameMode==='enabled'?'Habilitada':data.gameMode==='disabled'?'Desabilitada':unavailable]
    ]));
    if(data.supported!==true){paragraph(panel,data.reason==='unsupported-processor-groups'?'Indisponível: o diagnóstico exige um grupo e até 64 processadores lógicos.':clean(data.message)===unavailable?'Topologia indisponível nesta consulta.':clean(data.message));}
    const domains=Array.isArray(data.domains)?data.domains.slice(0,64):[];
    for(const[index,domain]of domains.entries()){
      panel.append(el('h4','content-gap','Domínio de cache '+(index+1)));
      const parked=numeric(domain.parkedLogicalProcessors)&&numeric(domain.logicalProcessors)?numberText(domain.parkedLogicalProcessors)+' / '+numberText(domain.logicalProcessors):unavailable;
      const classes=Array.isArray(domain.efficiencyClasses)&&domain.efficiencyClasses.length&&domain.efficiencyClasses.every(numeric)?domain.efficiencyClasses.map(numberText).join(', '):unavailable;
      append(panel,rows([
        ['Núcleos físicos',formatted(domain.physicalCores)],
        ['Processadores lógicos',formatted(domain.logicalProcessors)],
        ['Cache L3 confirmado',domain.l3Match==='exact'&&numeric(domain.l3Bytes)?formatted(domain.l3Bytes/2**20,' MiB'):unavailable,'Tamanho associado por correspondência exata de grupo e máscara, sem presumir o papel do CCD.'],
        ['Classes de eficiência',classes,'Classes numéricas informadas pelo Windows. Não identificam sozinhas núcleos P/E nem uma afinidade ideal.'],
        ['Lógicos estacionados · agora',parked,'Instantâneo Parked nesta consulta. Não comprova o motivo do estacionamento ou onde o CS2 está executando.']
      ]));
    }
    const health=data.health||{},sampling=data.sessionSampling||{},sampleTime=typeof sampling.lastCapturedAt==='string'&&Number.isFinite(Date.parse(sampling.lastCapturedAt))?new Date(sampling.lastCapturedAt).toLocaleTimeString('pt-BR'):'Indisponível';append(panel,rows([
      ['Estacionamento agregado por domínio',tri(health.frequencyDomainParked),'Resumo da última amostra por domínio de cache durante a sessão; não identifica CCD nem prioridade de frequência.'],
      ['CS2 no domínio com V-Cache',health.cs2RunningOnCacheDomain==='likely'?'Indício':health.cs2RunningOnCacheDomain==='unlikely'?'Indício contrário':unavailable,'A consulta do Windows não associa esta leitura ao processo do CS2; nenhum CCD foi presumido.'],
      ['Driver 3D V-Cache',unavailable,'O serviço não foi identificado em uma máquina X3D com o driver instalado; o nome permanece desconhecido.'],
      ['Classificação Xbox Game Bar',unavailable,'A preferência de Modo de Jogo lida acima não comprova o estado efetivo da Game Bar.'],
      ['Amostragem na sessão',sampling.enabled?'Ativa · '+formatted(sampling.intervalMs/1000,' s'):'Inativa'],
      ['Última amostra',sampleTime],
      ['Leituras na sessão',formatted(sampling.samples)]
    ]));
    paragraph(panel,'Nenhuma afinidade, CPU Set ou política de estacionamento foi alterada. A presença e a saúde do 3D V-Cache não foram certificadas por esta consulta.');
    paragraph(panel,'Validação física em X3D de dois CCDs e Intel híbrida pendente. Este diagnóstico não libera automação.');
    const guidance=el('details','content-gap topology-guidance');guidance.append(el('summary','','Verificações manuais recomendadas'));
    paragraph(guidance,'Mantenha o driver de chipset AMD ou Intel atualizado pelo suporte oficial do fabricante da placa-mãe ou do computador. O CSBOOST não instala drivers automaticamente.');
    paragraph(guidance,'Confira manualmente Configurações do Windows → Jogos → Modo de Jogo e a configuração da Xbox Game Bar. A preferência de Modo de Jogo lida aqui não comprova o estado efetivo da Game Bar.');
    paragraph(guidance,'Em Ryzen X3D com dois CCDs, consulte a documentação da placa-mãe e compare o comportamento em uso com o Gerenciador de Tarefas ou Ryzen Master. O CSBOOST não presume qual CCD deve executar o CS2.');
    panel.append(guidance);
    const advanced=el('details','content-gap topology-technical');advanced.append(el('summary','','Detalhes técnicos da consulta'));
    append(advanced,rows([['Grupos Windows',formatted(data.processorGroups)],['Duração da consulta nativa',formatted(data.queryDurationMs,' ms')]]));
    for(const[index,domain]of domains.entries())paragraph(advanced,'Domínio '+(index+1)+': grupo '+formatted(domain.group)+'; índice de cache '+formatted(domain.lastLevelCacheIndex)+'; máscara '+clean(domain.mask)+'.');
    notes(advanced,data.warnings);panel.append(advanced);return panel;
  }
  return {frameSummary,sessionSummary,topologyCard};
};
})();
