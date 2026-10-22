import {readSystemInventory} from './system-worker.mjs';
import {readBootTimerOptions} from './boot-timer-diagnostics.mjs';

const BUILTIN_POWER_PLANS=new Set([
  '381b4222-f694-41f0-9685-ff5bb260df2e', // Balanced
  'a1841308-3541-4fab-bc81-f71556f20b4a', // Power saver
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', // High performance
  'e9a42b02-d5df-448d-aa00-03f14749eb61', // Ultimate performance
]);
const SOURCE=Object.freeze({
  plans:{label:'Microsoft Learn · opções de powercfg e esquemas de energia',url:'https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/powercfg-command-line-options'},
  mmcss:{label:'Microsoft Learn · Multimedia Class Scheduler (MMCSS)',url:'https://learn.microsoft.com/en-us/windows/win32/procthread/multimedia-class-scheduler-service'},
  powerPolicy:{label:'Microsoft Learn · política de desativação do Power Throttling',url:'https://learn.microsoft.com/pt-br/windows/client-management/mdm/policy-csp-admx-power'},
  priority:{label:'Microsoft Learn · Win32_OperatingSystem / ForegroundApplicationBoost',url:'https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem'},
  game:{label:'Microsoft Learn · preferências documentadas de Game Bar e Modo de Jogo',url:'https://learn.microsoft.com/en-us/windows/apps/develop/settings/settings-windows-11'},
  gameDvrPolicy:{label:'Microsoft Learn · política AllowGameDVR',url:'https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-applicationmanagement'},
  services:{label:'Microsoft Learn · classe WMI Win32_Service',url:'https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-service'},
  bootTimers:{label:'Microsoft Learn · BCDEdit /set',url:'https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/bcdedit--set'},
  network:{label:'Microsoft Q&A · referência histórica NetworkThrottlingIndex',url:'https://learn.microsoft.com/en-us/answers/questions/2420607/ping-problems'},
  ownership:{label:'Registro local de propriedade do CSBOOST; comparação exata antes/depois',url:null},
});
const EXPECTED_SERVICE_NAMES=Object.freeze(['SysMain','WSearch','DiagTrack','DoSvc','BITS','GamingServices','GamingServicesNet','XblAuthManager','XblGameSave','XboxNetApiSvc','GameInputSvc']);
const powerGuid=value=>typeof value==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)?value.toLowerCase():null;
const safeText=value=>typeof value==='string'?value.slice(0,500):'';
const isDword=value=>value&&value.available===true&&value.exists===true&&value.type==='DWord'&&Number.isInteger(value.value)&&value.value>=0&&value.value<=0xffffffff;
const indicator=(id,title,status,confidence,message,{evidence=null,source,limitation=null}={})=>({id,title,status,confidence,message,evidence,source,limitation});
const unknown=(id,title,message,source,limitation)=>indicator(id,title,'unknown','low',message,{source,limitation});

function planIndicators(result){
  const plans=result?.plans,activeGuid=powerGuid(result?.activeGuid);
  if(!Array.isArray(plans)||!activeGuid)return [
    unknown('power-plans','Planos de energia','Não foi possível enumerar os planos e confirmar o ativo.',SOURCE.plans,'A leitura falhou; nenhum plano foi alterado.'),
    unknown('hidden-power-plan','Visibilidade de planos','O Windows não expôs um indicador confiável de plano oculto nesta consulta.',SOURCE.plans,'A enumeração de esquemas não confirma a visibilidade de cada opção nas telas do Windows.'),
  ];
  const normalized=plans.map(plan=>({...plan,guid:powerGuid(plan?.guid)})).filter(plan=>plan.guid);
  if(!normalized.length)return [
    unknown('power-plans','Planos de energia','A resposta não contém planos válidos.',SOURCE.plans,'A enumeração retornou dados incompletos.'),
    unknown('hidden-power-plan','Visibilidade de planos','Não foi possível avaliar a visibilidade dos planos.',SOURCE.plans,'A enumeração retornou dados incompletos.'),
  ];
  const custom=normalized.filter(plan=>!BUILTIN_POWER_PLANS.has(plan.guid));
  const active=normalized.find(plan=>plan.guid===activeGuid);
  const activeKnown=BUILTIN_POWER_PLANS.has(activeGuid);
  const message=custom.length
    ? `${custom.length} plano(s) com GUID fora dos quatro esquemas internos conhecidos foram encontrados. Isso pode ser um plano OEM ou personalizado; não identifica quem o criou.`
    : 'A lista retornada contém somente os quatro GUIDs internos conhecidos do Windows.';
  const rows=[indicator('power-plans','Planos de energia',custom.length?'found':'not-found',custom.length?'high':'medium',message,{evidence:{active:active?.name??'Plano ativo não listado',activeGuid,plans:normalized.map(plan=>({name:safeText(plan.name),guid:plan.guid}))},source:SOURCE.plans,limitation:'Um GUID fora da lista identifica um esquema diferente dos quatro GUIDs internos, mas não prova que um otimizador o instalou. A lista do Windows não informa a visibilidade de cada plano.'})];
  rows.push(unknown('hidden-power-plan','Visibilidade de planos','Desconhecido: a interface de enumeração não diferencia com segurança um plano oculto de um plano apenas não exibido.',SOURCE.plans,'Não há escrita nem tentativa de revelar planos ocultos.'));
  if(!active)rows.push(unknown('active-power-plan','Plano ativo','O GUID ativo não apareceu na enumeração de planos.',SOURCE.plans,'A consulta não identifica o nome do esquema ativo.'));
  return rows;
}

function ownershipIndicator({windows,video,profile}){
  const observations=[];
  const observe=(id,label,result,kind)=>{
    if(!result.ok){observations.push({id,label,status:'unknown',message:'A leitura desta área ficou indisponível.'});return;}
    const active=result.value?.active;
    if(kind==='profile'){
      if(result.value?.supported!==true||result.value?.managed!==true){observations.push({id,label,status:'unknown',message:'Não há uma referência de propriedade do CSBOOST para este arquivo.'});return;}
      observations.push({id,label,status:result.value.conflict?'found':'not-found',message:result.value.conflict?'O arquivo gerenciado diverge do estado anterior e do estado aplicado pelo CSBOOST.':'Não foi encontrada divergência no arquivo gerenciado desde o registro do CSBOOST.'});return;
    }
    if(!active){observations.push({id,label,status:'unknown',message:'Sem um registro ativo do CSBOOST, não há estado anterior para atribuir a origem da configuração.'});return;}
    const conflicts=Array.isArray(active.conflicts)?active.conflicts:[];
    const tracked=kind==='windows'?(active.changes||[]).filter(change=>['gameMode','gpu','capture','fso'].includes(change.id)):(active.changes||[]);
    if(!tracked.length){observations.push({id,label,status:'unknown',message:'O registro local não cobre esta configuração.'});return;}
    const names=new Set(tracked.map(change=>change.name).filter(Boolean));
    const matched=conflicts.filter(name=>names.has(name));
    observations.push({id,label,status:matched.length?'found':'not-found',message:matched.length?'Uma alteração posterior ao ajuste do CSBOOST foi confirmada pela comparação com o registro de propriedade.':'Nenhum valor divergente do registro ativo do CSBOOST foi encontrado.',evidence:matched.length?matched:tracked.map(change=>change.name).filter(Boolean)});
  };
  observe('windows-receipt','Preferências de jogo/captura do Windows',windows,'windows');
  observe('video-receipt','Opções de vídeo do CS2',video,'video');
  observe('profile-receipt','Arquivo de perfil do CSBOOST',profile,'profile');
  const found=observations.some(item=>item.status==='found');
  const complete=observations.every(item=>item.status!=='unknown');
  const status=found?'found':complete?'not-found':'unknown';
  const details=observations.map(item=>`${item.label}: ${item.message}`);
  return indicator('game-capture-external','Alterações posteriores em jogo e captura',status,status==='found'?'high':status==='not-found'?'medium':'low',status==='found'?'Foi encontrada uma divergência posterior em pelo menos um ajuste que o CSBOOST consegue acompanhar.':'A auditoria não encontrou uma divergência atribuível a um registro do CSBOOST.',{
    evidence:{areas:observations},source:SOURCE.ownership,
    limitation:'A autoria só pode ser atribuída quando existe um registro do CSBOOST e o valor atual diverge tanto do original quanto do valor aplicado. Ajustes feitos antes da primeira referência, sem registro do CSBOOST, ficam desconhecidos; uma diferença não é revertida.',
  });
}

function serviceIndicator(value){
  if(value?.available!==true||!Array.isArray(value.items))return unknown('services','Serviços monitorados','Não foi possível consultar o estado dos serviços monitorados.',SOURCE.services,'O diagnóstico não altera estados nem tipos de inicialização.');
  const items=value.items.filter(item=>EXPECTED_SERVICE_NAMES.includes(item.name)&&typeof item.startMode==='string');
  if(!items.length)return unknown('services','Serviços monitorados','Nenhum serviço da lista de referência foi encontrado ou a consulta foi incompleta.',SOURCE.services,'Serviços opcionais podem não existir em algumas edições; ausência não é tratada como desativação.');
  const disabled=items.filter(item=>item.startMode.toLowerCase()==='disabled');
  return indicator('services','Serviços monitorados desativados',disabled.length?'found':'not-found','low',disabled.length?`${disabled.length} serviço(s) da lista monitorada têm inicialização Disabled. Isso pode ser uma escolha do usuário, política ou personalização OEM.`:'Nenhum serviço instalado da lista monitorada está com inicialização Disabled.',{evidence:{disabled:disabled.map(item=>item.name),observed:items.map(item=>({name:item.name,state:safeText(item.state),startMode:safeText(item.startMode)}))},source:SOURCE.services,limitation:'O estado e o tipo de inicialização variam entre edições do Windows e fabricantes. Disabled é um sinal observável, não prova de ajuste externo nem de problema de desempenho.'});
}

function bootTimerIndicator(value){
  if(value?.available!==true||!value.options||typeof value.options!=='object')return unknown('boot-timers','Opções de temporizador do Windows','Não foi possível consultar as opções da entrada de inicialização atual.',SOURCE.bootTimers,'A leitura não altera o BCD; nenhum valor foi inferido quando a consulta falhou.');
  const flags=['useplatformclock','useplatformtick','disabledynamictick'];
  const forced=flags.filter(name=>value.options[name]===true);
  const evidence=Object.fromEntries(flags.map(name=>[name,value.options[name]===true?true:value.options[name]===false?false:null]));
  return forced.length
    ? indicator('boot-timers','Opções de temporizador do Windows','found','medium',`Opção(ões) de depuração habilitada(s): ${forced.join(', ')}. Se foram ativadas apenas como ajuste para jogos, compare com o padrão do Windows após confirmar que não são necessárias para depuração.`,{evidence,source:SOURCE.bootTimers,limitation:'A Microsoft documenta useplatformclock, useplatformtick e disabledynamictick como opções somente para depuração. O CSBOOST apenas lê a entrada atual e não altera a inicialização.'})
    : indicator('boot-timers','Opções de temporizador do Windows','not-found','medium','Nenhuma dessas opções está explicitamente forçada na entrada atual; o padrão do Windows permanece em vigor para esses itens.',{evidence,source:SOURCE.bootTimers,limitation:'A leitura cobre somente três opções da entrada atual. Um resultado sem ajustes não comprova ganho de FPS nem avalia outras opções de inicialização.'});
}

function registryIndicators(value){
  const registry=value?.registry??{};
  const read=(key)=>isDword(registry[key])?registry[key]:null;
  const rows=[];
  const mmcss=read('systemResponsiveness');
  if(!mmcss)rows.push(unknown('registry-system-responsiveness','Agendamento MMCSS','Valor ausente, inacessível ou de tipo inesperado; a política efetiva não foi inferida.',SOURCE.mmcss,'A documentação explica o efeito de SystemResponsiveness, mas a ausência do valor não revela todos os padrões efetivos do sistema.'));
  else if(mmcss.value===20)rows.push(indicator('registry-system-responsiveness','Agendamento MMCSS','not-found','medium','O valor observado é 20, usado aqui como referência de comparação; isso não prova que o Windows nunca foi ajustado.',{evidence:{value:mmcss.value,type:mmcss.type},source:SOURCE.mmcss,limitation:'A documentação descreve a semântica do valor; o relatório não presume que 20 seja o padrão de toda imagem OEM.'}));
  else rows.push(indicator('registry-system-responsiveness','Agendamento MMCSS','found',mmcss.value===100?'high':'medium',mmcss.value===100?'Foi encontrado SystemResponsiveness=100; a documentação da Microsoft indica que esse valor desativa o MMCSS.':`Foi encontrado SystemResponsiveness=${mmcss.value}, diferente da referência de comparação 20.`,{evidence:{value:mmcss.value,type:mmcss.type},source:SOURCE.mmcss,limitation:'Um valor diferente é apenas um indício; não identifica o programa que o gravou nem garante efeito em FPS.'}));

  const throttling=read('powerThrottlingOff');
  if(!throttling)rows.push(unknown('registry-power-throttling','Política de Power Throttling','Valor ausente, inacessível ou de tipo inesperado.',SOURCE.powerPolicy,'A ausência da política não permite inferir a preferência efetiva de cada processo.'));
  else rows.push(indicator('registry-power-throttling','Política de Power Throttling',throttling.value===1?'found':throttling.value===0?'not-found':'unknown',throttling.value===0||throttling.value===1?'high':'low',throttling.value===1?'A política está configurada para desligar o Power Throttling.':throttling.value===0?'A política observada não desliga o Power Throttling.':'O valor não é 0 ou 1; o efeito não foi interpretado.',{evidence:{value:throttling.value,type:throttling.type},source:SOURCE.powerPolicy,limitation:'O valor policy não revela modos de eficiência definidos individualmente por aplicativos.'}));

  const priority=read('win32PrioritySeparation');
  rows.push(priority?indicator('registry-priority-separation','Valor de prioridade de processos',priority.value===2?'not-found':'found',priority.value===2?'medium':'low',priority.value===2?'O valor observado é 2, usado como referência de comparação; isso não prova que o Windows nunca foi ajustado.':`Foi encontrado Win32PrioritySeparation=${priority.value}, diferente da referência de comparação 2.`,{evidence:{value:priority.value,type:priority.type},source:SOURCE.priority,limitation:'A associação da Microsoft descreve o aumento de tempo de execução do aplicativo em primeiro plano. A comparação com 2 é heurística; não recomenda uma alteração nem identifica autoria.'}):unknown('registry-priority-separation','Valor de prioridade de processos','Valor ausente, inacessível ou de tipo inesperado.',SOURCE.priority,'O valor efetivo do agendador pode vir de padrões do sistema.'));

  const network=read('networkThrottlingIndex');
  if(!network)rows.push(unknown('registry-network-throttling','NetworkThrottlingIndex','Valor ausente, inacessível ou de tipo inesperado.',SOURCE.network,'A referência disponível é antiga e não permite inferir o comportamento efetivo em todas as versões atuais do Windows.'));
  else rows.push(indicator('registry-network-throttling','NetworkThrottlingIndex',network.value===0xffffffff?'found':network.value===10?'not-found':'found','low',network.value===0xffffffff?'Foi encontrado o marcador 0xFFFFFFFF, citado como desativação do throttling de rede.':network.value===10?'O valor observado corresponde à referência histórica 10.':`Foi encontrado o valor ${network.value}; ele difere da referência histórica 10.`,{evidence:{value:network.value,type:network.type},source:SOURCE.network,limitation:'É uma heurística histórica de baixa confiança; não implica melhora de rede ou FPS e não identifica quem definiu o valor.'}));

  const policy=value?.registry?.allowGameDvr;
  if(policy?.available===true&&policy.exists===false)rows.push(indicator('registry-game-dvr-policy','Política de captura do Windows','not-found','high','Não foi encontrada uma política explícita que bloqueie Game Recording; a política ausente mantém o controle padrão do usuário.',{evidence:{exists:false},source:SOURCE.gameDvrPolicy,limitation:'A ausência dessa política não revela todos os controles do usuário nem se algum aplicativo grava a tela.'}));
  else if(!isDword(policy))rows.push(unknown('registry-game-dvr-policy','Política de captura do Windows','Política inacessível ou de tipo inesperado.',SOURCE.gameDvrPolicy,'Uma leitura incompleta não permite avaliar o efeito da política.'));
  else rows.push(indicator('registry-game-dvr-policy','Política de captura do Windows',policy.value===0?'found':policy.value===1?'not-found':'unknown',policy.value===0||policy.value===1?'high':'low',policy.value===0?'A política observada proíbe Game Recording.':policy.value===1?'A política observada permite Game Recording.':'O valor não é 0 ou 1; o efeito não foi interpretado.',{evidence:{value:policy.value,type:policy.type},source:SOURCE.gameDvrPolicy,limitation:'O estado dessa política não prova se o usuário usa a Game Bar nem se outro software grava a tela.'}));

  const gameMode=value?.registry?.autoGameModeEnabled,appCapture=value?.registry?.appCaptureEnabled;
  const rawPreferences={gameMode:isDword(gameMode)?gameMode.value:null,gameModePresent:gameMode?.available===true&&gameMode.exists===true,appCapture:isDword(appCapture)?appCapture.value:null,appCapturePresent:appCapture?.available===true&&appCapture.exists===true};
  rows.push(indicator('registry-game-capture-preferences','Preferências de Modo de Jogo e captura','unknown','low','Os valores atuais são exibidos como evidência, mas a origem e o estado efetivo não podem ser determinados somente pelo Registro.',{evidence:rawPreferences,source:SOURCE.game,limitation:'A documentação associa AutoGameModeEnabled ao controle de Modo de Jogo; a leitura não atribui o valor a um aplicativo nem substitui a comparação com o registro de propriedade do CSBOOST.'}));
  return rows;
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export function renderExternalAdjustmentsHtml(report){
  if(!report||report.version!==1||report.readOnly!==true||!Array.isArray(report.indicators))throw Error('Relatório de auditoria inválido.');
  const rows=report.indicators.map(item=>`<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.confidence)}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.source?.label)}${item.source?.url?`<br><a href="${escapeHtml(item.source.url)}">${escapeHtml(item.source.url)}</a>`:''}</td><td>${escapeHtml(JSON.stringify(item.evidence))}</td></tr>`).join('');
  const limits=(report.limits||[]).map(item=>`<li>${escapeHtml(item)}</li>`).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Auditoria de ajustes externos · CSBOOST</title><style>body{font:14px/1.6 system-ui,sans-serif;background:#111;color:#eee;margin:30px}main{max-width:1400px;margin:auto}table{width:100%;border-collapse:collapse;background:#181818}th,td{padding:10px;border:1px solid #393939;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{color:#bbb}a{color:#aaa}small{color:#aaa}</style><main><h1>Auditoria de ajustes externos</h1><p>Leitura somente; nenhuma configuração do Windows, do jogo ou do driver foi alterada.</p><p>Capturado em ${escapeHtml(report.capturedAt)} · Encontrados: ${report.summary.found} · Não encontrados: ${report.summary.notFound} · Desconhecidos: ${report.summary.unknown}</p><table><thead><tr><th>Indicador</th><th>Estado</th><th>Confiança</th><th>Leitura</th><th>Fonte e critério</th><th>Evidência</th></tr></thead><tbody>${rows}</tbody></table><h2>Limites</h2><ul>${limits}</ul></main></html>`;
}

export function createExternalAdjustments({system,windowsTuning,optimizations,readInventory=readSystemInventory,readBootOptions=readBootTimerOptions,timeoutMs=12000,now=()=>new Date()}){
  if(!system||!windowsTuning||!optimizations||typeof readInventory!=='function'||typeof readBootOptions!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('Dependências da auditoria externa inválidas.');
  async function safely(operation){let timer;try{return {ok:true,value:await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Prazo excedido.')),timeoutMs);})])};}catch(error){return {ok:false,error:safeText(error?.message||'Consulta indisponível.')}}finally{clearTimeout(timer);}}
  async function inspect(steamId){
    const validSteamId=typeof steamId==='string'&&/^\d{17}$/.test(steamId);
    const reads=await Promise.all([
      safely(()=>system.getPowerPlans()),
      safely(()=>windowsTuning.inspect()),
      safely(()=>validSteamId?optimizations.inspect(steamId,{preset:'competitive'}):Promise.reject(Error('Conta Steam indisponível.'))),
      safely(()=>system.getProfileConfigState()),
      safely(()=>readInventory({operation:'externalAudit'})),
      safely(()=>readBootOptions()),
    ]);
    const [power,windows,video,profile,native,bootTimers]=reads;
    const indicators=[...planIndicators(power.ok?power.value:null),ownershipIndicator({windows,video,profile}),serviceIndicator(native.ok?native.value?.services:null),bootTimerIndicator(bootTimers.ok?bootTimers.value:null),...registryIndicators(native.ok?native.value:null)];
    const summary={found:indicators.filter(item=>item.status==='found').length,notFound:indicators.filter(item=>item.status==='not-found').length,unknown:indicators.filter(item=>item.status==='unknown').length};
    const warnings=reads.filter(item=>!item.ok).map(item=>item.error).filter(Boolean);
    return {version:1,readOnly:true,capturedAt:now().toISOString(),summary,indicators,warnings,limits:[
      'O relatório detecta sinais observáveis, não identifica automaticamente o programa que os criou e não afirma que um ajuste melhora FPS.',
      'Alterações externas em jogo/captura só podem ser atribuídas quando divergem de um registro anterior do CSBOOST; estado anterior sem referência fica desconhecido.',
      'Nenhum valor, plano, serviço, arquivo de jogo ou driver é aplicado, restaurado ou removido por esta auditoria.',
    ]};
  }
  return {inspect,renderHtml:renderExternalAdjustmentsHtml};
}
