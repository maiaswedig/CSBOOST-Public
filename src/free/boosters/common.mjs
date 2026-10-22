import {BROWSER_POLICIES,BROWSER_POLICY_NOTE} from '../browser-policies.mjs';
import {DESKTOP_ITEMS} from '../desktop-preferences.mjs';
export const HIGH_POWER='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
import {nvidiaFingerprint} from '../nvidia.mjs';
export const NVIDIA_EXTRA_BOOSTERS=Object.freeze({
  'nvidia-power-mode':'powerMode','nvidia-refresh-rate':'refreshRate','nvidia-texture-filter':'textureFilter','nvidia-vsync':'vsync',
  'nvidia-anisotropic-sample':'anisotropicSample','nvidia-anisotropic-filter':'anisotropicFilter','nvidia-trilinear':'trilinear',
  'nvidia-fxaa':'fxaa','nvidia-mfaa':'mfaa','nvidia-aa-control':'aaControl','nvidia-aniso-control':'anisoControl','nvidia-ao':'ambientOcclusion',
  'nvidia-aa-gamma':'aaGamma','nvidia-aa-transparency':'aaTransparency','nvidia-negative-lod-bias':'negativeLodBias',
  'nvidia-threaded-optimization':'threadedOptimization','nvidia-vulkan-present':'vulkanPresent','nvidia-triple-buffer':'tripleBuffer',
  'nvidia-low-latency':'lowLatency','nvidia-low-latency-ultra':'lowLatencyUltra',
});
export function createBooster(definition){
  const {group}=definition;
  const restoredLabels=(ctx,result)=>{const items=Array.isArray(result?.restoredItems)?result.restoredItems:group==='power'&&result?.restored?['Plano ativo']:[];return group==='nvidia'?items.map(id=>(ctx.nvidia?.preview?.changes||[]).find(change=>change.id===id)?.label||id):items;};
  const signature=ctx=>group==='power'?ctx.power?.activeGuid:ctx[group]?.[group==='nvidia'?'preview':'sourceSHA256']?.fingerprint??ctx[group]?.sourceSHA256;
  async function owner(ctx){
    if(group==='power'){const info=await ctx.system.getPowerPlans();if(info.restoreGuid&&!info.ownerToken)throw Error('Backup de energia de outro ajuste; preservado.');return info.ownerToken;}
    const info=group==='video'?await ctx.optimizations.inspect(ctx.account.id,{preset:ctx.videoPreset,resolution:ctx.resolution}):group==='windows'?await ctx.windowsTuning.inspect():await ctx.nvidiaModule.inspect();
    if(group==='nvidia'){if(!info.supported)throw Error('Não foi possível conferir o backup NVIDIA.');if(info.pendingRestore&&!info.ownerToken)throw Error('Backup NVIDIA sem identificação do Boost; preservado.');return info.ownerToken;}
    if(info.active&&!info.active.ownerToken)throw Error('Backup '+group+' sem identificação do Boost; preservado.');return info.active?.ownerToken;
  }
  return Object.freeze({...definition,scope:'persistent',requiresGameClosed:true,signature,owner,
    async detect(ctx){const row=definition.describe(ctx);return {available:!!row.available,needed:!!row.needed,reason:row.reason};},
    async plan(ctx){return {...definition.describe(ctx),fingerprintPart:signature(ctx)};},
    async apply(ctx,{ownerToken}){
      if(group==='video')return ctx.optimizations.apply(ctx.account.id,{preset:ctx.videoPreset,resolution:ctx.resolution,sourceSHA256:ctx.video.sourceSHA256,ownerToken});
      if(group==='windows')return ctx.windowsTuning.apply({ids:ctx.selectedIds.filter(id=>id.startsWith('windows-')).map(id=>id.slice(8)),sourceSHA256:ctx.windows.sourceSHA256,ownerToken});
      if(group==='nvidia'){const name=ctx.selectedIds.includes('nvidia')?'recommended':'custom',extraKeys=ctx.selectedIds.map(id=>id==='nvidia-shader-cache'?'shaderCache':NVIDIA_EXTRA_BOOSTERS[id]).filter(Boolean);return ctx.nvidiaModule.apply({preset:name,extraKeys,previewFingerprint:name==='recommended'?ctx.nvidia.preview.fingerprint:nvidiaFingerprint(ctx.nvidia.snapshot,name),ownerToken});}
      return ctx.system.activatePowerPlan(HIGH_POWER,{ownerToken});
    },
    async verify(ctx){return await owner(ctx)===ctx.ownerToken;},
    async restore(ctx,step){const currentOwner=await owner(ctx),discardToken=ctx.discardTokens?.[group];if(currentOwner&&currentOwner!==ctx.ownerToken)throw Error('O backup '+group+' pertence a outro ajuste; preservado.');let restoreResult=null,discarded=false;
      if(currentOwner){
        if(group==='video'){restoreResult=await ctx.optimizations.restore(ctx.account.id);if(restoreResult?.pendingRestore){if(!discardToken){const error=Error('Parte das opções de vídeo foi restaurada; ainda há valores externos em conflito. O restante continua salvo para recuperação.');error.restoredItems=restoredLabels(ctx,restoreResult);throw error;}await ctx.optimizations.discardBackup(ctx.account.id,discardToken);discarded=true;}}
        else if(group==='windows'){restoreResult=await ctx.windowsTuning.restore();if(restoreResult?.pendingRestore){if(!discardToken){const error=Error('Parte dos ajustes do Windows foi restaurada; ainda há valores externos em conflito. O restante continua salvo para recuperação.');error.restoredItems=restoredLabels(ctx,restoreResult);throw error;}await ctx.windowsTuning.discardBackup(discardToken);discarded=true;}}
        else if(group==='nvidia'){restoreResult=await ctx.nvidiaModule.restore();if(restoreResult?.pendingRestore){if(!discardToken){const error=Error('Parte do perfil NVIDIA foi restaurada; ainda há valores externos em conflito. O restante continua salvo para recuperação.');error.restoredItems=restoredLabels(ctx,restoreResult);throw error;}await ctx.nvidiaModule.discardBackup(discardToken);discarded=true;}}
        else{const info=await ctx.system.getPowerPlans();if(![HIGH_POWER,info.restoreGuid].includes(info.activeGuid)){if(!discardToken)throw Error('O plano ativo mudou externamente; backup preservado.');await ctx.system.discardPowerBackup(discardToken);discarded=true;}else{restoreResult=await ctx.system.restorePowerPlan();if(restoreResult?.pendingRestore){if(!discardToken)throw Error('O plano ativo mudou externamente; backup preservado.');await ctx.system.discardPowerBackup(discardToken);discarded=true;}}}
        if(await owner(ctx))throw Error('A restauração '+group+' permanece pendente.');
      }else if(signature(ctx)!==step.before)throw Error('Backup '+group+' ausente e configuração diferente da original; nenhuma restauração foi presumida.');
      return {restored:true,discarded,restoredItems:restoredLabels(ctx,restoreResult)};
    }
  });
}
export function windowsBooster(id,title,{profile='safe',risk='low',recommended=true}={}){
  return createBooster({id:'windows-'+id,group:'windows',title,profile,risk,describe(ctx){const row=ctx.windows?.items.find(item=>item.id===id);return {available:!!row,needed:!!row?.needed,blocked:!!ctx.windows?.active,recommended,reason:ctx.windows?.active?'Há preferências com backup anterior; restaure-as primeiro.':row?.description||'Preferência indisponível.',tradeoffs:[BROWSER_POLICIES.some(item=>item.id===id)?BROWSER_POLICY_NOTE:DESKTOP_ITEMS.some(item=>item.id===id)?'Preferência de interação do Windows, opcional. Não é ganho de FPS; restauração preserva mudanças externas.':id==='gpu'?'Define preferência de alto desempenho só para o executável do CS2 no Windows. Em notebooks pode aumentar o consumo de bateria. AMD, NVIDIA e Intel continuam sob as regras do próprio driver.':id==='capture'?'Desativa a captura da Game Bar; mantenha desmarcado se usa gravação.':id==='fso'?'Experimental: pode melhorar ou piorar a apresentação e a latência. Meça antes/depois.':'O efeito depende do Windows e da disputa por recursos.'],changes:row?.needed?[{label:title,before:row.before,after:row.after}]:[]};}});
}
