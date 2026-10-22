import {createBooster} from './common.mjs';
export default createBooster({id:'nvidia-shader-cache',group:'nvidia',title:'NVIDIA · cache de shaders',profile:'safe',risk:'low',describe(ctx){
  const current=ctx.nvidia?.shaderCache,available=ctx.nvidia?.supported===true&&current?.recognized===true&&current.exists===true&&[0,1].includes(current.value),needed=available&&current.value===0;
  return {available,needed,blocked:!!ctx.nvidia?.pendingRestore||ctx.nvidia?.canApply===false,recommended:needed,reason:available?'Cache de shaders do perfil CS2. Só é reativado quando o driver confirma que está desligado.':'O driver não confirmou um estado compatível do cache de shaders.',tradeoffs:['Pode reduzir recompilações de shaders e usa espaço em disco. Não limpa caches, não altera o perfil global e não garante aumento de FPS.'],changes:needed?[{id:0x00198FFF,label:'Cache de shaders NVIDIA',before:current,after:1}]:[]};
}});
