const CLASSES=new Set(['gpu-bound','cpu-bound','cap-limited','thermal-or-power','unknown']);
const confidence=value=>['low','medium','high'].includes(value)?value:'low';
const labelFor=value=>({
  'gpu-bound':'Indício de limite pela GPU',
  'cpu-bound':'Indício de limite pela CPU',
  'cap-limited':'Indício de limite por sincronização ou cap',
  'thermal-or-power':'Limitador térmico ou de potência observado',
  unknown:'Não foi possível classificar',
}[value]||'Não foi possível classificar');
const normalized=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US'):'';
const known=value=>typeof value==='string'&&value.trim()&&!/^(unknown|não identificado|na|n\/a)$/i.test(value.trim());
const gpuIsNvidia=value=>/nvidia|geforce|quadro|rtx|gtx/i.test(String(value||''));

function boosterState(items,id){
  const item=items.find(row=>row.id===id);
  if(!item||item.status==='unavailable')return 'indisponível';
  if(item.selected)return 'já incluído na seleção automática';
  if(item.selectable)return 'compatível, mas não selecionado pelo modo automático';
  if(item.status==='already')return 'já corresponde às preferências atuais';
  return 'não recomendado pela política atual deste computador';
}

/**
 * Converts one T13 result into read-only advice. Its output is deliberately
 * separate from the booster rows so it cannot change the automatic selection.
 */
export function recommendFromBottleneck({latest,hardware,topology,items=[]}={}){
  const base={status:'none',title:'Sugestões do diagnóstico',class:'unknown',classLabel:labelFor('unknown'),confidence:'low',measuredAt:null,prioritize:[],avoid:[],notice:'Faça uma medição com captura detalhada para receber recomendações específicas. A seleção automática atual continua conservadora.'};
  if(!latest)return base;
  const diagnosis=latest.diagnosis||latest.benchmark?.context?.frametimes?.bottleneck;
  const benchmark=latest.benchmark||latest;
  if(!diagnosis||!CLASSES.has(diagnosis.class))return {...base,status:'unavailable',notice:'O último resultado não contém uma classificação válida. A seleção automática atual foi mantida.'};
  const recorded=benchmark.hardware||benchmark.context?.hardware;
  if(!known(recorded?.cpu)||!known(recorded?.gpu)||!known(hardware?.cpu)||!known(hardware?.gpu))return {...base,status:'unavailable',class:diagnosis.class,classLabel:labelFor(diagnosis.class),confidence:confidence(diagnosis.confidence),measuredAt:benchmark.context?.finishedAt||benchmark.importedAt||null,notice:'Não foi possível confirmar CPU e GPU nas duas leituras. Faça uma nova medição antes de usar recomendações.'};
  if(normalized(recorded.cpu)!==normalized(hardware.cpu)||normalized(recorded.gpu)!==normalized(hardware.gpu))return {...base,status:'stale',class:diagnosis.class,classLabel:labelFor(diagnosis.class),confidence:confidence(diagnosis.confidence),measuredAt:benchmark.context?.finishedAt||benchmark.importedAt||null,notice:'O hardware desta medição difere do computador atual. Faça um novo benchmark; nenhuma recomendação foi usada.'};
  const result={status:'available',title:diagnosis.class==='thermal-or-power'?'Aviso do diagnóstico':diagnosis.class==='unknown'?'Diagnóstico inconclusivo':'Sugerido pelo diagnóstico',class:diagnosis.class,classLabel:labelFor(diagnosis.class),confidence:confidence(diagnosis.confidence),measuredAt:benchmark.context?.finishedAt||benchmark.importedAt||null,prioritize:[],avoid:[],notice:'Recomendações informativas baseadas na medição; não alteram a seleção nem aplicam boosters.'};
  const add=(title,detail,area,boosterId=null)=>result.prioritize.push({title,detail,area,...(boosterId?{boosterId,state:boosterState(items,boosterId)}:{})});
  switch(diagnosis.class){
    case 'gpu-bound':
      add('Revisar o preset de vídeo para FPS','Confira o preset de vídeo voltado a FPS; preserve as opções que forem importantes para você.','Jogo e Windows','video');
      if(gpuIsNvidia(hardware.gpu))add('Conferir o perfil de energia NVIDIA','Ajuste de perfil específico para a GPU NVIDIA detectada; observe consumo e temperatura.','Jogo e Windows','nvidia');
      else result.notice+=' O perfil de energia NVIDIA não se aplica à GPU detectada.';
      result.avoid.push('Não priorizar o governador de CPU com base neste resultado: a GPU foi o limitador observado.');
      break;
    case 'cpu-bound':
      add('Investigar disputa de processos em segundo plano','Revise o equilíbrio de processos durante uma sessão de jogo na aba FPS+.','FPS+');
      if(topology?.x3d==='no'&&items.some(row=>row.id==='power'&&row.recommended))add('Conferir a política de energia','A recomendação existente só é considerada quando a política permite, a alimentação está confirmada e a CPU não é X3D.','Jogo e Windows','power');
      else if(topology?.x3d!=='no')add('Conferir a topologia da CPU','A topologia X3D está confirmada ou não pôde ser descartada; mantenha a política de energia conservadora e confira a aba Hardware.','Hardware');
      else add('Manter a política de energia atual','O motor não recomendou trocar o plano nas condições atuais deste PC.','Jogo e Windows');
      add('Conferir XMP/EXPO e a memória','Verifique o perfil suportado na BIOS e no manual da placa. A leitura do Windows não confirma se XMP/EXPO está ativo.','Hardware');
      result.avoid.push('Não reduzir a qualidade de vídeo sem necessidade; o diagnóstico aponta a CPU como limitador.');
      break;
    case 'cap-limited':
      add('Conferir limite de FPS, VSync e VRR','Compare fps_max, sincronização, taxa de atualização e VRR do monitor; uma medição limitada por cap não justifica reduzir qualidade gráfica.','Benchmark');
      result.avoid.push('Não alterar qualidade de vídeo por causa deste resultado.');
      break;
    case 'thermal-or-power':
      add('Verificar temperatura, refrigeração e alimentação','Confira ventilação, temperaturas e limites de potência com ferramentas do fabricante. Este aviso descreve uma condição observada; não é um booster.','Hardware');
      result.avoid.push('Não aplicar ajuste automático de clock, tensão ou limite de potência.');
      break;
    case 'unknown':
      add('Manter a seleção automática conservadora','Os dados disponíveis não permitem escolher uma categoria com confiança. Use somente os ajustes compatíveis já selecionados pelo CSBOOST.','Jogo e Windows');
      result.avoid.push('Evitar ajustes de risco ou mudanças de qualidade guiadas por esta medição.');
      break;
  }
  return result;
}
