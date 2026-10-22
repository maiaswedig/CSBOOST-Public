import {createBooster} from './common.mjs';
import {NVIDIA_SETTINGS} from '../nvidia.mjs';

const rule=NVIDIA_SETTINGS.find(item=>item.key==='lowLatency');
export default createBooster({
  id:'nvidia-low-latency-ultra',group:'nvidia',title:'NVIDIA · fila de renderização Ultra',profile:'full',risk:'high',
  describe(ctx){
    const current=ctx.nvidia?.snapshot?.settings?.find(item=>item.id===rule.id);
    const available=ctx.nvidia?.supported===true&&current?.recognized===true;
    const needed=available&&(!current.exists||current.value!==2);
    return {
      available,needed,blocked:!!ctx.nvidia?.pendingRestore||ctx.nvidia?.canApply===false,recommended:false,
      reason:available?'Opção experimental para priorizar latência no perfil do CS2. Não é um ajuste para aumentar FPS.':'O driver não confirmou suporte a este controle.',
      tradeoffs:['Ultra reduz ao mínimo a fila do driver e pode reduzir throughput ou piorar a cadência de quadros; o efeito depende da GPU e do gargalo.',
        'A documentação da NVIDIA informa que Reflex ativo substitui a função Ultra Low Latency do driver. No CS2, prefira testar Reflex dentro do jogo; use Ultra apenas se Reflex não estiver ativo e compare FPS, estabilidade e latência.'],
      changes:needed?[{id:rule.id,label:'Modo de baixa latência NVIDIA',before:current.exists?current.value:'Padrão do driver',after:2}]:[],
    };
  },
});
