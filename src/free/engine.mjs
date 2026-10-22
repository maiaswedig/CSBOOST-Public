import {validateProcessPolicy} from './process-tuning.mjs';
export function assessHardware(hardware,game){
  const windows=hardware.platform==='win32',cores=Number(hardware.logicalCores)||0,ram=Number(hardware.ramGB)||0;
  const gpu=String(hardware.gpu||''),vendor=/nvidia/i.test(gpu)?'NVIDIA':/amd|radeon/i.test(gpu)?'AMD':/intel/i.test(gpu)?'Intel':'Não identificado';
  const warnings=[];if(cores<4)warnings.push('Poucos processadores lógicos: teste prioridades de processos com cuidado e compare o 1% low.');if(ram&&ram<8)warnings.push('Memória abaixo de 8 GB: feche manualmente aplicativos que não usa. Reduzir prioridade não libera RAM.');if(vendor==='Não identificado')warnings.push('GPU não identificada: mantenha a resolução atual e valide as opções no jogo.');
  return {windows,cores,ramGB:ram,gpuVendor:vendor,warnings,defaultProcessPolicy:{automatic:windows&&cores>=2,prioritizeGame:false,backgroundApps:[]},capabilities:[
    {name:'Presets gráficos e resolução',available:windows&&game.cs2Installed,reason:game.cs2Installed?'Aplicados ao arquivo de vídeo da conta Steam.':'CS2 não encontrado.'},
    {name:'Modo de Jogo e preferência de GPU',available:windows,reason:windows?'Preferências do usuário do Windows, com restauração.':'Requer Windows.'},
    {name:'Prioridade do CS2 e apps selecionados',available:windows&&cores>=2,reason:windows?'CPU automática com carga medida e restauração por sessão; seleção manual nas opções avançadas.':'Requer Windows.'},
    {name:'Afinidade automática de CPU',available:false,reason:'Compatibilidade de topologia ainda não consultada.'},
    {name:'Perfis de driver NVIDIA',available:false,reason:vendor==='NVIDIA'?'Compatibilidade do perfil NVIDIA ainda não consultada.':'GPU NVIDIA não detectada.'},
    {name:'PBO/Curve Optimizer AMD',available:false,reason:'Controle de firmware/driver ainda não implementado e não aplicado automaticamente.'},
    {name:'Diagnóstico de memória e referência de firmware',available:false,reason:'Leitura de memória ainda não consultada.'},
    {name:'Ativação direta de XMP/EXPO',available:false,reason:'Exige suporte específico de firmware; não é aplicada automaticamente.'},
  ]};
}
export function createOptimizationEngine({system,optimizations,windowsTuning,processTuning,cpuAffinity,nvidia,amdTuning,memoryTuning}){
  async function inspect(steamId){const [hardware,game,processes,windows,video,cpu,gpu,amd,memory]=await Promise.allSettled([system.getSystemInfo(),system.refreshSteam(),processTuning.inspect(),windowsTuning.inspect(),optimizations.inspect(steamId,{preset:'fps',resolution:'keep'}),cpuAffinity?.inspect(),nvidia?.inspect(),amdTuning?.inspect(),memoryTuning?.snapshot()]);
    if(hardware.status==='rejected')throw hardware.reason;if(game.status==='rejected')throw game.reason;
    const assessment=assessHardware(hardware.value,game.value);const cpuDistribution=cpu.status==='fulfilled'?cpu.value:null,nvidiaProfile=gpu.status==='fulfilled'?gpu.value:null;
    if(cpuDistribution){const item=assessment.capabilities.find(item=>item.name==='Afinidade automática de CPU');item.available=!!cpuDistribution.supported;item.reason=cpuDistribution.reason;}
    if(nvidiaProfile){const item=assessment.capabilities.find(item=>item.name==='Perfis de driver NVIDIA');item.available=!!nvidiaProfile.supported;item.reason=nvidiaProfile.reason||'Perfil de driver específico do CS2, com backup e restauração.';}
    const amdStatus=amd.status==='fulfilled'?amd.value:null;if(amdStatus){const item=assessment.capabilities.find(item=>item.name==='PBO/Curve Optimizer AMD');item.available=!!amdStatus.canApply;item.reason=amdStatus.reason;}
    for(const [result,name]of [[cpu,'Afinidade automática de CPU'],[gpu,'Perfis de driver NVIDIA'],[amd,'PBO/Curve Optimizer AMD'],[memory,'Diagnóstico de memória e referência de firmware'],[video,'Presets gráficos e resolução'],[windows,'Modo de Jogo e preferência de GPU'],[processes,'Prioridade do CS2 e apps selecionados']]){if(result.status==='rejected'){const capability=assessment.capabilities.find(item=>item.name===name);capability.available=false;capability.reason=result.reason.message;}}
    const memoryStatus=memory.status==='fulfilled'?memory.value:null;if(memoryStatus){const item=assessment.capabilities.find(item=>item.name==='Diagnóstico de memória e referência de firmware');item.available=!!memoryStatus.available;item.reason=memoryStatus.available?'Módulos, frequência configurada e comparação antes/depois; perfil XMP/EXPO não confirmado.':memoryStatus.reason;}
    return {hardware:assessment,cpuDistribution,nvidiaProfile,amdStatus,memoryStatus,processes:processes.status==='fulfilled'?processes.value:null,processError:processes.status==='rejected'?processes.reason.message:null,
      opportunities:{video:video.status==='fulfilled'?video.value.changes.length:null,windows:windows.status==='fulfilled'?windows.value.items.filter(item=>item.needed).length:null},
      errors:[video,windows,cpu,gpu,amd,memory,processes].filter(result=>result.status==='rejected').map(result=>result.reason.message),fpsGain:null};
  }
  async function validatePolicy(input){const policy=validateProcessPolicy(input);const info=await system.getSystemInfo();if(info.platform!=='win32'||info.logicalCores<2){if(policy.automatic)return {prioritizeGame:false,backgroundApps:[]};if(policy.prioritizeGame||policy.backgroundApps.length||policy.backgroundMemoryPriorityApps?.length||policy.cpuDistribution)throw new Error('Ajustes de processos por sessão não estão disponíveis neste computador.');}if(policy.cpuDistribution){const support=await cpuAffinity?.inspect();if(!support?.supported)throw new Error(support?.reason||'Afinidade indisponível.');}return policy;}
  return {inspect,validatePolicy};
}
