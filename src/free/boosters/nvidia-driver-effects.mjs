import {createBooster,NVIDIA_EXTRA_BOOSTERS} from './common.mjs';
import {NVIDIA_DRIVER_KEYS,NVIDIA_SETTINGS} from '../nvidia.mjs';

export default Object.freeze(Object.entries(NVIDIA_EXTRA_BOOSTERS).filter(([,key])=>NVIDIA_DRIVER_KEYS.includes(key)).map(([id,key])=>{
  const rule=NVIDIA_SETTINGS.find(item=>item.key===key);
  return createBooster({id,group:'nvidia',title:'NVIDIA · '+rule.label,profile:'full',risk:'medium',describe(ctx){
    const current=ctx.nvidia?.snapshot?.settings?.find(item=>item.id===rule.id);
    const available=!!ctx.nvidia?.supported&&!!current?.recognized&&(!rule.requiresExisting||!!current.exists);
    const needed=available&&(!current.exists||current.value!==rule.value);
    return {available,needed,blocked:!!ctx.nvidia?.pendingRestore||ctx.nvidia?.canApply===false,recommended:false,reason:available?rule.reason:'O driver não confirmou um valor compatível para esta opção.',tradeoffs:[rule.tradeoff],changes:needed?[{id:rule.id,label:rule.label,before:current.exists?current.value:'Padrão do driver',after:rule.value}]:[]};
  }});
}));
