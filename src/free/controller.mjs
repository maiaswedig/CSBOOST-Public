import {backgroundHelpUrl} from './background-help.mjs';
import {readNetworkDiagnostics} from './network-diagnostics.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {issueDiscardToken} from './discard-confirmation.mjs';
import {renderConfig,validateSettings,DEFAULT_SETTINGS,DEFAULT_CROSSHAIR,exportProfileCrosshair} from './profiles.mjs';
import {stateHash} from './owned-state.mjs';
import {decodeCrosshairCode,crosshairCodeToEditor} from './crosshair-code.mjs';
import {historyValue} from './change-history.mjs';

const HARDWARE_TUNING_LINKS=Object.freeze({
  'nvidia-app':'https://www.nvidia.com/en-us/software/nvidia-app/',
  'amd-adrenalin':'https://www.amd.com/en/products/software/adrenalin.html',
  'amd-graphics-settings':'https://www.amd.com/en/resources/support-articles/faqs/DH3-012.html',
  'intel-arc':'https://www.intel.com/content/www/us/en/support/articles/000092590/graphics.html',
  'intel-xtu':'https://www.intel.com/content/www/us/en/download/17881/intel-extreme-tuning-utility-intel-xtu.html',
  'msi-afterburner':'https://www.msi.com/Landing/afterburner/graphics-cards',
});

export function createController({publication,publicationPolicy=null,version='1.0.0',discordTuning,networkDiagnostics=readNetworkDiagnostics,compatibility,releaseTools,auth,profiles,system,content,proLibrary,proMedia,clipboard,benchmarks,sessions,sessionSummaryStore,optimizations,windowsTuning,engine,nvidia,nvidiaControlPanel,amdTuning,gpuDiagnostics,memoryTuning,displays,profileTransfer,benchmarkSetup,fpsFlow,shaderCache,performanceAudit,externalAdjustments,boostPlan,firmwareWorkflow,benchmarkRunner,frameCapture,cpuTopology,recoveryGuard,monitor,recoveryExit,dialog,shell,changeHistory,onAuthChanged=()=>{},operationTimeouts={},defaultOperationTimeoutMs=120000}) {
  const requireSession=async()=>{const session=await auth.getSession();if(!session)throw new Error('Entre com a Steam para continuar.');return session;};
  const gated=fn=>async(...args)=>{await requireSession();return fn(...args);};
  const newOwnerToken=()=>`boost:${crypto.randomUUID()}`;
  const recordChange=async event=>{try{await changeHistory?.record(event);}catch{}};
  const resolveChanges=async(moduleId,result,{labels,reason}={})=>{
    if(!changeHistory||!result||result.canceled)return;
    try{
      const restoredLabels=labels??result.restoredItems;
      if(result.discarded){if(Array.isArray(restoredLabels)&&restoredLabels.length){await changeHistory.resolve({moduleId,status:'partial',reason:'Itens conflitantes aguardam descarte confirmado.'});await changeHistory.resolve({moduleId,labels:restoredLabels,status:'restored',reason:'Valor original restaurado e confirmado.'});}await changeHistory.resolve({moduleId,status:'discarded',reason:reason||'Backup restante descartado após confirmação; os valores atuais foram mantidos.'});return;}
      if(result.pendingRestore){await changeHistory.resolve({moduleId,status:'partial',reason:reason||'Parte dos ajustes foi restaurada; os itens restantes continuam pendentes.'});if(Array.isArray(result.restoredItems)&&result.restoredItems.length)await changeHistory.resolve({moduleId,labels:result.restoredItems,status:'restored',reason:'Restaurado e confirmado; os itens conflitantes foram preservados.'});return;}
      if(result.restored===true||result.pendingRestore===false&&result.removed===true)await changeHistory.resolve({moduleId,status:'restored',reason:reason||'Restauração confirmada.'});
    }catch{}
  };
  const planName=(state,guid)=>state?.plans?.find(plan=>plan.guid===guid)?.name||guid||'Não informado';
  const saveChangeRows=async(moduleId,changes,reason)=>{for(const change of (changes||[]).slice(0,64))await recordChange({moduleId,label:change.label||change.name||'Ajuste',previous:change.before,applied:change.after??change.value,reason:change.reason||reason,restoration:'pending',action:'applied'});};
  const resolveRestoreConflict=async({module,description,conflict,ownerToken,canDiscard,restore,discard})=>{
    if(!conflict)return restore();
    const discardAllowed=canDiscard??!!ownerToken,buttons=discardAllowed?['Restaurar só o que posso','Manter os valores atuais e descartar o backup','Cancelar']:['Restaurar só o que posso','Cancelar'];
    const result=await dialog.showMessageBox({type:'warning',title:'Conflito encontrado',message:'Alguns valores mudaram depois do ajuste.',detail:`${description}\n\n“Restaurar só o que posso” devolve apenas os valores que ainda pertencem ao CSBOOST e mantém os demais.${discardAllowed?' “Manter os valores atuais e descartar o backup” não altera esses valores e apaga a possibilidade de restaurá-los depois.':' Este backup antigo não pode ser descartado com segurança; restaure os valores do CSBOOST ou cancele.'}`,buttons,defaultId:0,cancelId:discardAllowed?2:1,noLink:true});
    if(result.response===0)return restore();
    if(discardAllowed&&result.response===1)return discard(await issueDiscardToken(module,ownerToken));
    return {canceled:true,pendingRestore:true};
  };
  const boostRestoreConflicts=async(state,steamId)=>{
    const pending=(state.steps??[]).filter(step=>!['restored','skipped'].includes(step.status)),conflicts=[];
    for(const group of ['video','windows','nvidia','power'])if(pending.some(step=>step.group===group)){
      if(group==='video'){const info=await optimizations.inspect(steamId,{});if(info.active?.ownerToken===state.ownerToken&&info.active.conflicts?.length)conflicts.push({group,label:'configurações de vídeo',canDiscard:info.active.canDiscard===true});}
      else if(group==='windows'){const info=await windowsTuning.inspect();if(info.active?.ownerToken===state.ownerToken&&info.active.conflicts?.length)conflicts.push({group,label:'preferências do Windows',canDiscard:info.active.canDiscard===true});}
      else if(group==='nvidia'){const info=await nvidia.inspect();if(info.ownerToken===state.ownerToken&&info.conflicts?.length)conflicts.push({group,label:'perfil NVIDIA',canDiscard:info.canDiscard===true});}
      else{const info=await system.getPowerPlans();if(info.ownerToken===state.ownerToken&&info.restoreGuid&&info.activeGuid!==info.appliedGuid&&info.activeGuid!==info.restoreGuid)conflicts.push({group,label:'plano de energia',canDiscard:info.canDiscard===true});}
    }
    return conflicts;
  };
  const methods={
    getState:async()=>({publicationPolicy,session:await auth.getSession(),edition:'free',version,operation:operationState(),monitor:monitor?.status()??null,profileHealth:profiles?.getHealth?.()??null,recovery:{...(recoveryGuard?{...recoveryGuard.getState(),last:await recoveryGuard.getLastRecovery()}:{}),operation:operationState()}}),
    recoverAndQuit:async()=>{if(!monitor?.status().failed||typeof recoveryExit!=='function')throw Error('Recuperação de monitor não necessária ou indisponível.');recoveryGuard?.ensureAvailable();return recoveryExit();},
    getCompatibility:gated(async()=>{if(!compatibility)throw Error('Verificação de compatibilidade indisponível.');return compatibility.inspect((await requireSession()).steamId);}),
    exportCompatibility:gated(async()=>{if(!compatibility)throw Error('Verificação de compatibilidade indisponível.');const report=await compatibility.inspect((await requireSession()).steamId);const selection=await dialog.showSaveDialog({title:'Exportar compatibilidade sem dados da conta',defaultPath:'csboost-compatibilidade.json',filters:[{name:'Relatório JSON',extensions:['json']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,JSON.stringify(report,null,2));return {path:selection.filePath};}),
    createDesktopShortcut:gated(async()=>{if(!releaseTools)throw Error('Atalho indisponível nesta execução.');return releaseTools.createShortcut();}),
    openQuickGuide:gated(async()=>{if(!releaseTools)throw Error('Guia indisponível nesta execução.');return releaseTools.openGuide();}),
    openThirdPartyNotices:gated(async()=>{if(!releaseTools)throw Error('Créditos indisponíveis nesta execução.');return releaseTools.openNotices();}),
    openPrivacyNotice:gated(async()=>{if(!releaseTools)throw Error('Aviso de privacidade indisponível nesta execução.');return releaseTools.openPrivacy();}),
    openHardwareHelp:gated(async options=>{if(!releaseTools)throw Error('Guia indisponível nesta execução.');return releaseTools.openHardwareHelp(options);}),
    loginSteam:async()=>{const session=await auth.login();onAuthChanged(session);return session;},
    useLocalSteam:async()=>{const session=await auth.useLocal();onAuthChanged(session);return session;},
    cancelLogin:async()=>{auth.cancel();return {canceled:true};},
    logout:async()=>{await auth.logout();onAuthChanged(null);return {loggedOut:true};},
    getSystemInfo:gated(()=>system.getSystemInfo()),
    getCpuTopology:gated(()=>cpuTopology?cpuTopology.inspect():{supported:false,readOnly:true,reason:'Diagnóstico de topologia indisponível.'}),
    getFrameCaptureStatus:gated(()=>frameCapture?frameCapture.status():{status:'unavailable',enabled:false,canCapture:false,reason:'Coletor indisponível.'}),
    configureFrameCapture:gated(async options=>{if(!frameCapture)throw Error('Coletor indisponível.');if(benchmarkRunner?.isActive()||await sessions?.getState())throw Error('Conclua a sessão ou medição antes de mudar a coleta.');return frameCapture.configure(options);}),
    openFrameCaptureHelp:gated(async()=>{await dialog.showMessageBox({type:'info',title:'Permissões da coleta de quadros',message:'A coleta detalhada usa ETW do Windows.',detail:'Para habilitar, feche o CSBOOST e escolha Executar como administrador no ícone. Outra opção é pedir ao administrador do Windows participação no grupo local Usuários de Log de Desempenho (SID S-1-5-32-559) e iniciar uma nova sessão do Windows. O aplicativo não altera grupos ou permissões. Sem essa permissão, o benchmark continua com os dados VProf do CS2. Coleta experimental: não validada em FACEIT/ESEA nem em toda combinação de Windows e GPU.',buttons:['Entendi'],noLink:true});return {shown:true};}),
    refreshSteam:gated(()=>system.refreshSteam()),
    listProfiles:gated(()=>profiles.list()),
    saveProfile:gated(input=>profiles.save({...input,provenance:undefined})),
    getProCatalog:gated(options=>proLibrary.catalog(options)),
    getPublicMedia:gated(options=>proMedia.get(options)),
    getProPlayer:gated(options=>proLibrary.player(options)),
    previewProConfig:gated(options=>proLibrary.preview(options)),
    importProConfig:gated(options=>proLibrary.importConfig(options)),
    copyProToProfile:gated(options=>proLibrary.copyIntoProfile(options)),
    copyProCommands:gated(async options=>{const preview=await proLibrary.confirmPreview(options);if(!clipboard?.writeText)throw Error('Área de transferência indisponível.');clipboard.writeText(preview.commands);return {copied:true,appliedToGame:false};}),
    exportProConfig:gated(async options=>{const preview=await proLibrary.confirmPreview(options);const selection=await dialog.showSaveDialog({title:'Exportar campos profissionais selecionados',defaultPath:preview.player.id+'-csboost.cfg',filters:[{name:'Configuração CS2',extensions:['cfg']}]});if(selection.canceled||!selection.filePath)return {canceled:true};const current=await proLibrary.confirmPreview(options);await fs.writeFile(selection.filePath,current.commands);return {path:selection.filePath,appliedToGame:false};}),
    openProSource:gated(options=>proLibrary.openSource(options)),
    previewCrosshairCode:gated(request=>{const decoded=decodeCrosshairCode(request?.code);const base=validateSettings({...DEFAULT_SETTINGS,crosshair:request?.crosshair??DEFAULT_CROSSHAIR}).crosshair;return {format:decoded.format,...crosshairCodeToEditor(decoded,base)};}),
    exportCrosshairCode:gated(crosshair=>exportProfileCrosshair(crosshair)),
    importProfileFile:gated(async()=>{const selection=await dialog.showOpenDialog({title:'Importar perfil ou config',properties:['openFile'],filters:[{name:'Perfil CSBOOST ou config CS2',extensions:['json','cfg','vcfg']}]});if(selection.canceled||!selection.filePaths?.[0])return {canceled:true};return profileTransfer.importFile(selection.filePaths[0]);}),
    previewGameProfile:gated(()=>profileTransfer.previewGame()),
    importGameProfile:gated(options=>profileTransfer.importGame(options)),
    exportPortableProfile:gated(async id=>{const profile=await profiles.read(id);const selection=await dialog.showSaveDialog({title:'Exportar perfil portátil CSBOOST',defaultPath:'csboost-perfil.json',filters:[{name:'Perfil CSBOOST',extensions:['json']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,profileTransfer.serializeProfile(profile));return {path:selection.filePath};}),
    previewProfileVideo:gated(async id=>{const session=await requireSession(),profile=await profiles.read(id);if(!Object.keys(profile.settings.graphics??{}).length)throw Error('Este perfil não contém vídeo avançado.');return {...await optimizations.inspect(session.steamId,{preset:'professional',values:profile.settings.graphics}),profileFingerprint:stateHash(profile.settings.graphics)};}),
    applyProfileVideo:gated(async request=>{const session=await requireSession(),profile=await profiles.read(request?.id);if(await sessions.getState())throw Error('Encerre a sessão antes de alterar o vídeo.');if(request.profileFingerprint!==stateHash(profile.settings.graphics))throw Error('O perfil mudou. Confira nova prévia.');const before=await optimizations.inspect(session.steamId,{preset:'professional',values:profile.settings.graphics}),result=await optimizations.apply(session.steamId,{preset:'professional',values:profile.settings.graphics,sourceSHA256:request.sourceSHA256,ownerToken:newOwnerToken()});if(result?.changed)await saveChangeRows('video',before.changes,'Vídeo aplicado a partir do perfil local selecionado.');return result;}),
    getDisplays:gated(()=>displays.inspect()),
    openDisplaySettings:gated(async()=>{await shell.openExternal('ms-settings:display');return {opened:true};}),
    resolveDisplayMode:gated(options=>displays.resolveSelection(options)),
    getProfileConfigState:gated(()=>system.getProfileConfigState()),
    restoreProfileConfig:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de restaurar o cfg.');const before=typeof system.getProfileConfigState==='function'?await system.getProfileConfigState():null,result=await system.restoreProfileConfig();await resolveChanges('game-config',{...result,restored:result?.restored===true||before?.managed===true&&result?.pendingRestore===false},{reason:result?.message||'Arquivo csboost.cfg anterior confirmado.'});return result;}),
    deleteProfile:gated(id=>profiles.remove(id)),
    applyProfile:gated(async id=>{const profile=await profiles.read(id),before=typeof system.getProfileConfigState==='function'?await system.getProfileConfigState():null,result=await system.applyProfile(profile);if(result?.changed)await recordChange({moduleId:'game-config',label:'csboost.cfg',previous:before?.exists?'Arquivo anterior presente':'Nenhum arquivo anterior',applied:'Configuração do CSBOOST salva',reason:'Perfil local selecionado pelo usuário; o CS2 só carrega o arquivo quando iniciado com +exec csboost.cfg.',restoration:'pending',action:'applied'});return result;}),
    exportProfile:gated(async id=>{
      const profile=await profiles.read(id);
      const result=await dialog.showSaveDialog({title:'Exportar configuração do CS2',defaultPath:profile.name.replace(/[^\p{L}\p{N}\s_-]/gu,'').slice(0,60)+'.cfg',filters:[{name:'Configuração CS2',extensions:['cfg']}]});
      if(result.canceled||!result.filePath)return {canceled:true};
      await fs.writeFile(result.filePath,renderConfig(profile));return {path:result.filePath};
    }),
    launchCS2:gated(async options=>{
      if(!options||typeof options!=='object'||typeof options.withConfig!=='boolean')throw new Error('Opção de inicialização inválida.');
      const request={withConfig:options.withConfig};
      if(options.withConfig&&options.profileId)request.settings=(await profiles.read(options.profileId)).settings;
      return system.launchCS2(request);
    }),
    getPowerPlans:gated(()=>system.getPowerPlans()),
    activatePowerPlan:gated(async guid=>{if(sessions&&await sessions.getState())throw new Error('Encerre a sessão de jogo antes de mudar o plano manualmente.');const before=await system.getPowerPlans(),result=await system.activatePowerPlan(guid,{ownerToken:newOwnerToken()});if(result?.activeGuid&&result.activeGuid!==before.activeGuid)await recordChange({moduleId:'power',label:'Plano ativo',previous:planName(before,before.activeGuid),applied:planName(result,result.activeGuid),reason:'Plano selecionado manualmente pelo usuário no CSBOOST.',restoration:'pending',action:'applied'});return result;}),
    restorePowerPlan:gated(async()=>{if(sessions&&await sessions.getState())throw new Error('Encerre a sessão de jogo para restaurar seu plano.');const state=await system.getPowerPlans();const conflict=!!state.restoreGuid&&state.activeGuid!==state.appliedGuid&&state.activeGuid!==state.restoreGuid;const result=await resolveRestoreConflict({module:'power',description:'O plano de energia ativo foi alterado depois do ajuste.',conflict,ownerToken:state.ownerToken,canDiscard:state.canDiscard===true,restore:()=>system.restorePowerPlan(),discard:token=>system.discardPowerBackup(token)});await resolveChanges('power',result);return result;}),
    getGameSession:gated(()=>sessions.getState()),
    getLastSessionSummary:gated(()=>sessionSummaryStore?.getLast?.()??null),
    getSessionAutoAttach:gated(()=>sessions.getAutoAttach()),
    setSessionAutoAttach:gated(async enabled=>{if(await sessions.getState())throw Error('Encerre a sessão ativa para mudar a detecção automática.');return sessions.setAutoAttach(enabled);}),
    startGameSession:gated(async request=>{if(!request||typeof request!=='object'||(request.profileId!=null&&typeof request.profileId!=='string'))throw new Error('Sessão inválida.');const profile=request.profileId?await profiles.read(request.profileId):null;const processPolicy=engine?await engine.validatePolicy(request.processPolicy):undefined;return sessions.start({preset:request.preset,settings:profile?.settings,processPolicy,provider:request.provider,attachRunning:request.attachRunning});}),
    stopGameSession:gated(()=>sessions.stop()),
    exportSessionReport:gated(async()=>{const selection=await dialog.showSaveDialog({title:'Exportar ajustes da sessão',defaultPath:'csboost-sessao.json',filters:[{name:'Relatório JSON',extensions:['json']}]});if(selection.canceled||!selection.filePath)return {canceled:true};const report={version:1,generatedAt:new Date().toISOString(),scope:'Estado atual; não representa histórico completo nem ganho de FPS',session:await sessions.getState(),boost:boostPlan?await boostPlan.inspect():null};await fs.writeFile(selection.filePath,JSON.stringify(report,null,2));return {path:selection.filePath};}),
    openSteamProfile:async()=>{const session=await requireSession();await shell.openExternal('https://steamcommunity.com/profiles/'+session.steamId);return {opened:true};},
    openFolder:gated(async kind=>{
      let folder;
      if(kind==='profiles'){folder=profiles.directory;await fs.mkdir(folder,{recursive:true});}
      else if(kind==='gameCfg'){const steam=await system.refreshSteam();if(!steam.cs2Installed)throw new Error('CS2 não encontrado.');folder=steam.cfgPath;}
      else throw new Error('Pasta inválida.');
      const error=await shell.openPath(folder);if(error)throw new Error(error);return {opened:true};
    }),
    openPublicationSource:gated(key=>publication.openSource(key)),
    clearPublicCache:gated(()=>publication.clearCache()),
    getNews:gated(()=>content.getNews()),
    getRankings:gated(()=>content.getRankings()),
    openArticle:gated(url=>content.openArticle(url)),
    listBenchmarks:gated(()=>benchmarks.list()),
    exportBenchmarkHistory:gated(async format=>{if(!['json','csv'].includes(format))throw new Error('Formato de histórico inválido.');const text=await benchmarks.exportHistory(format);const selection=await dialog.showSaveDialog({title:'Exportar histórico de FPS',defaultPath:'csboost-historico.'+format,filters:[{name:format==='csv'?'Tabela CSV':'Histórico JSON',extensions:[format]}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,text);return {path:selection.filePath};}),
    getBenchmarkSetup:gated(()=>benchmarkSetup.getState()),
    getFpsFlow:gated(()=>fpsFlow.getState()),
    refreshFpsFlow:gated(async()=>{await benchmarkRunner.inspect({refresh:true});return fpsFlow.getState();}),
    createFpsFlow:gated(options=>fpsFlow.create(options)),
    previewFpsBoost:gated(options=>fpsFlow.preview(options)),
    applyFpsBoost:gated(options=>fpsFlow.apply(options)),
    recordFpsBoost:gated(options=>fpsFlow.record(options)),
    cancelFpsResume:gated(()=>fpsFlow.cancelAutoResume()),
    createBenchmarkSetup:gated(options=>benchmarkSetup.create(options)),
    confirmBenchmarkPreparation:gated(options=>benchmarkSetup.confirmPreparation(options)),
    selectBenchmarkSetupResults:gated(options=>benchmarkSetup.selectResults(options)),
    markBenchmarkAdjustments:gated(options=>benchmarkSetup.markAdjustments(options)),
    resumeBenchmarkSetup:gated(async options=>{const result=await benchmarkSetup.resume(options);await fpsFlow?.cancelAutoResume?.();return result;}),
    compareBenchmarkSetup:gated(()=>benchmarkSetup.compare()),
    cancelBenchmarkSetup:gated(async()=>{const result=await benchmarkSetup.cancel();await fpsFlow?.cancelAutoResume?.();return result;}),
    startBenchmarkSetupRun:gated(async options=>{if(await sessions.getState())throw new Error('Encerre a sessão antes do benchmark.');return benchmarkSetup.startRun({...options,processPolicy:await engine.validatePolicy(options?.processPolicy)});}),
    previewOptimization:async options=>optimizations.inspect((await requireSession()).steamId,options),
    applyOptimization:async options=>{const session=await requireSession();if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes de otimizar o vídeo.');const before=await optimizations.inspect(session.steamId,options),result=await optimizations.apply(session.steamId,{...options,ownerToken:newOwnerToken()});if(result?.changed)await saveChangeRows('video',before.changes,'Preset de vídeo escolhido pelo usuário.');return result;},
    restoreOptimization:async()=>{const session=await requireSession();if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes de restaurar o vídeo.');const state=typeof optimizations.inspect==='function'?await optimizations.inspect(session.steamId,{}):null;const conflict=!!state?.active?.conflicts?.length,result=await resolveRestoreConflict({module:'video',description:'Algumas opções gráficas do CS2 foram alteradas depois do preset.',conflict,ownerToken:state?.active?.ownerToken,canDiscard:state?.active?.canDiscard===true,restore:()=>optimizations.restore(session.steamId),discard:token=>optimizations.discardBackup(session.steamId,token)});await resolveChanges('video',result);return result;},
    getWindowsTuning:gated(()=>windowsTuning.inspect()),
    getEngineAssessment:async()=>engine.inspect((await requireSession()).steamId),
    previewBoost:gated(options=>boostPlan.preview(options)),
    getBoostState:gated(()=>boostPlan.inspect()),
    applyBoost:gated(async options=>{if(await sessions.getState())throw Error('Encerre a sessão antes de aplicar o Boost Máximo.');return boostPlan.apply(options);}),
    restoreBoost:gated(async()=>{if(await sessions.getState())throw Error('Encerre a sessão antes de restaurar o Boost Máximo.');const state=await boostPlan.inspect(),conflicts=state.pendingRestore?await boostRestoreConflicts(state,(await requireSession()).steamId):[];let discardTokens={};if(conflicts.length){const canDiscard=conflicts.every(item=>item.canDiscard),buttons=canDiscard?['Restaurar só o que posso','Manter os valores atuais e descartar o backup','Cancelar']:['Restaurar só o que posso','Cancelar'];const result=await dialog.showMessageBox({type:'warning',title:'Conflito encontrado no Boost Máximo',message:'Alguns valores mudaram depois do Boost.',detail:`Conflitos: ${conflicts.map(item=>item.label).join(', ')}.\n\n“Restaurar só o que posso” devolve os valores que ainda pertencem ao CSBOOST e mantém os conflitantes.${canDiscard?' “Manter os valores atuais e descartar o backup” mantém os valores conflitantes, registra a decisão e remove apenas os backups desses módulos.':' Há backup antigo sem comprovação de integridade; o descarte fica indisponível.'}`,buttons,defaultId:0,cancelId:canDiscard?2:1,noLink:true});if(result.response===(canDiscard?2:1))return {...state,canceled:true};if(canDiscard&&result.response===1)for(const item of conflicts)discardTokens[item.group]=await issueDiscardToken(item.group,state.ownerToken);}
      try{const restored=await boostPlan.restore(Object.keys(discardTokens).length?{discardTokens}:{});await fpsFlow?.cancelAutoResume?.();return restored;}catch(error){if(conflicts.length&&String(error?.message||'').startsWith('Restauração incompleta:'))return {...await boostPlan.inspect(),partialRestore:true};throw error;}}),
    getFirmwareWorkflow:gated(()=>firmwareWorkflow.inspect()),
    prepareFirmwareWorkflow:gated(async options=>{if(await sessions.getState())throw Error('Encerre a sessão antes de preparar PBO/XMP.');return firmwareWorkflow.prepare(options);}),
    openFirmwarePbo:gated(async()=>{if(await sessions.getState())throw Error('Encerre a sessão antes de abrir PBO.');return firmwareWorkflow.openPbo();}),
    checkFirmwareWorkflow:gated(async options=>{if(await sessions.getState())throw Error('Encerre a sessão antes de conferir PBO/XMP.');return firmwareWorkflow.check(options);}),
    cancelFirmwareWorkflow:gated(()=>firmwareWorkflow.cancel()),
    getNetworkDiagnostics:gated(()=>networkDiagnostics()),
    getDiscordTuning:gated(()=>discordTuning?discordTuning.inspect():{available:false,reason:'Integração local indisponível.'}),
    applyDiscordTuning:gated(options=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.apply(options);}),
    restoreDiscordTuning:gated(()=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.restore();}),
    applyDiscordLocalSettings:gated(options=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.applyLocalSettings(options);}),
    restoreDiscordLocalSettings:gated(()=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.restoreLocalSettings();}),
    applyDiscordStartup:gated(options=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.applyStartup(options);}),
    restoreDiscordStartup:gated(()=>{if(!discordTuning)throw Error('Discord indisponível.');return discordTuning.restoreStartup();}),
    openBackgroundHelp:gated(async options=>{await shell.openExternal(backgroundHelpUrl(options));return {opened:true};}),
    openNetworkSettings:gated(async()=>{await shell.openExternal('ms-settings:network-status');return {opened:true};}),
    openWindowsRecovery:gated(async()=>{await shell.openExternal('ms-settings:recovery');return {opened:true};}),
    restartToFirmware:gated(async()=>{if(await sessions.getState())throw Error('Encerre a sessão antes de reiniciar.');if(await system.isGameRunning())throw Error('Feche o CS2 antes de reiniciar na BIOS.');const result=await dialog.showMessageBox({type:'warning',title:'Reiniciar na BIOS',message:'Reiniciar este computador na BIOS agora?',detail:'Salve seus trabalhos antes de continuar. O Windows solicitará o reinício sem forçar o fechamento dos aplicativos. Você deverá selecionar XMP/EXPO na BIOS; o CSBOOST não ativa o perfil automaticamente.',buttons:['Cancelar','Reiniciar na BIOS'],defaultId:0,cancelId:0,noLink:true});if(result.response!==1)return {canceled:true};return firmwareWorkflow.restartToFirmware({confirmed:true});}),
    getNvidiaProfile:gated(options=>nvidia.inspect(options)),
    openNvidiaControlPanel:gated(async()=>{if(!nvidiaControlPanel)throw new Error('A abertura do Painel NVIDIA não está disponível.');return nvidiaControlPanel.open();}),
    getAmdTuning:gated(()=>amdTuning.inspect()),
    getGpuDiagnostics:gated(()=>gpuDiagnostics.inspect()),
    launchAdrenalin:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes de abrir o perfil gráfico do Adrenalin.');return gpuDiagnostics.launchAdrenalin();}),
    getMemoryTuning:gated(()=>memoryTuning.inspect()),
    getShaderCache:gated(()=>shaderCache.preview()),
    discardShaderCacheRecovery:gated(async()=>{
      if(await sessions.getState())throw Error('Encerre a sessão antes de encerrar a recuperação do cache.');
      const info=await shaderCache.inspect();if(!info.canDiscardRecovery||!info.recoveryId)throw Error('Não há recuperação em conflito para encerrar.');
      const decision=await dialog.showMessageBox({type:'warning',title:'Encerrar recuperação do cache',message:'Manter os caches atuais e encerrar a recuperação automática?',detail:'Nenhum arquivo de cache será apagado ou movido. O diário será arquivado com os caminhos dos caches para recuperação manual. O CSBOOST deixará de oferecer a restauração automática desta quarentena.',buttons:['Manter caches e encerrar recuperação','Cancelar'],defaultId:1,cancelId:1,noLink:true});
      if(decision.response!==0)return {canceled:true,pendingRestore:true};
      const result=await shaderCache.discardRecovery(issueDiscardToken('shader-cache','boost:'+info.recoveryId));await resolveChanges('shader-cache',result,{reason:'Recuperação automática encerrada após confirmação; caches e recibo preservados.'});return result;
    }),
    getPerformanceAudit:gated(()=>performanceAudit.inspect()),
    getChangeHistory:gated(()=>{if(!changeHistory)throw Error('Histórico de ajustes indisponível.');return changeHistory.list();}),
    exportChangeHistory:gated(async()=>{if(!changeHistory)throw Error('Histórico de ajustes indisponível.');const text=await changeHistory.exportJson(),selection=await dialog.showSaveDialog({title:'Exportar histórico de ajustes sem dados da conta',defaultPath:'csboost-historico-ajustes.json',filters:[{name:'Histórico JSON',extensions:['json']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,text);return {path:selection.filePath,personalDataIncluded:false};}),
    getExternalAdjustments:async()=>{const session=await requireSession();return externalAdjustments.inspect(session.steamId);},
    exportExternalAdjustments:async()=>{const session=await requireSession(),report=await externalAdjustments.inspect(session.steamId),html=externalAdjustments.renderHtml(report);const selection=await dialog.showSaveDialog({title:'Salvar auditoria de ajustes externos',defaultPath:'csboost-auditoria-externa.html',filters:[{name:'Relatório HTML',extensions:['html']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,html);return {path:selection.filePath,summary:report.summary};},
    capturePerformanceReference:gated(async options=>{if(await sessions.getState())throw Error('Encerre a sessão antes de guardar a referência.');return performanceAudit.capture(options);}),
    comparePerformanceReference:gated(async()=>{if(await sessions.getState())throw Error('Encerre a sessão antes de conferir os ajustes.');return performanceAudit.compare();}),
    exportPerformanceAudit:gated(async()=>{const html=await performanceAudit.renderHtml();const selection=await dialog.showSaveDialog({title:'Exportar diagnóstico Antes/Depois',defaultPath:'csboost-diagnostico.html',filters:[{name:'Relatório HTML',extensions:['html']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,html);return {path:selection.filePath};}),
    clearShaderCache:gated(async options=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de reparar o cache.');const before=await shaderCache.inspect(),result=await shaderCache.clear(options);if(result?.changed)await recordChange({moduleId:'shader-cache',label:'Cache de shaders do CS2',previous:`${before.files} arquivos · ${before.bytes} bytes`,applied:'Cache original movido para quarentena recuperável',reason:before.message||'Reparação solicitada pelo usuário.',restoration:'pending',action:'applied'});return result;}),
    restoreShaderCache:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de restaurar o cache.');const result=await shaderCache.restore();await resolveChanges('shader-cache',result,{reason:result?.pendingRestore?'Restauração parcial; alvos restantes preservados para nova tentativa.':'Cache anterior restaurado e conferido.'});return result;}),
    captureHardwareReference:gated(async options=>{if(await system.isGameRunning()||await sessions.getState())throw new Error('Feche o CS2 e encerre a sessão antes de guardar a referência.');return memoryTuning.captureReference(options);}),
    checkHardwareReference:gated(async()=>{if(await system.isGameRunning()||await sessions.getState())throw new Error('Feche o CS2 e encerre a sessão antes de conferir o hardware.');return memoryTuning.checkReference();}),
    openMemoryGuide:gated(async()=>{const info=await memoryTuning.snapshot();await shell.openExternal(info.guide.url);return {opened:true};}),
    exportHardwareGuide:gated(async()=>{const html=await memoryTuning.renderGuide();const selection=await dialog.showSaveDialog({title:'Salvar guia de memória e PBO/CO',defaultPath:'csboost-memoria-pbo.html',filters:[{name:'Guia HTML',extensions:['html']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,html);return {path:selection.filePath};}),
    readAmdStability:gated(()=>amdTuning.readStability({since:new Date(Date.now()-60*60*1000).toISOString()})),
    launchRyzenMaster:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de ajustar PBO/CO.');return amdTuning.launchRyzenMaster();}),
    openAmdDownload:gated(async()=>{await shell.openExternal((await amdTuning.inspect()).links.download);return {opened:true};}),
    openAmdGuide:gated(async()=>{await shell.openExternal((await amdTuning.inspect()).links.guide);return {opened:true};}),
    openHardwareTuningLink:gated(async id=>{if(typeof id!=='string'||!Object.hasOwn(HARDWARE_TUNING_LINKS,id))throw new Error('Ferramenta de hardware inválida.');await shell.openExternal(HARDWARE_TUNING_LINKS[id]);return {opened:true};}),
    applyNvidiaProfile:gated(async options=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de alterar o driver NVIDIA.');const before=await nvidia.inspect(options),result=await nvidia.apply({...options,ownerToken:newOwnerToken()});if(result?.changed)await saveChangeRows('nvidia',before.preview?.changes,'Ajuste do perfil CS2 enviado ao driver NVIDIA e confirmado.');return result;}),
    restoreNvidiaProfile:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão antes de restaurar o driver NVIDIA.');const state=await nvidia.inspect(),result=await resolveRestoreConflict({module:'nvidia',description:'O perfil NVIDIA contém valores alterados fora do CSBOOST.',conflict:!!state.conflicts?.length,ownerToken:state.ownerToken,canDiscard:state.canDiscard===true,restore:()=>nvidia.restore(),discard:token=>nvidia.discardBackup(token)}),labels=(result?.restoredItems||[]).map(id=>state.preview?.changes?.find(change=>change.id===id)?.label||id);await resolveChanges('nvidia',result,{labels});return result;}),
    inspectBenchmarkRun:gated(()=>benchmarkRunner.inspect({refresh:true})),
    getBenchmarkRun:gated(()=>benchmarkRunner.getState()),
    startBenchmarkRun:gated(async request=>{if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes do benchmark.');if(!request||typeof request!=='object')throw new Error('Benchmark inválido.');const processPolicy=await engine.validatePolicy(request.processPolicy);return benchmarkRunner.start({type:request.type,preset:request.preset,processPolicy,tuningNote:request.tuningNote});}),
    cancelBenchmarkRun:gated(()=>benchmarkRunner.cancel()),
    openBenchmarkWorkshop:gated(async()=>{await shell.openExternal('https://steamcommunity.com/sharedfiles/filedetails/?id=3240880604');return {opened:true};}),
    applyWindowsTuning:gated(async options=>{if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes de alterar o Windows.');const before=await windowsTuning.inspect(),result=await windowsTuning.apply({...options,ownerToken:newOwnerToken()});if(result?.changed){const ids=new Set(Array.isArray(options?.ids)?options.ids:[]);await saveChangeRows('windows',before.items.filter(item=>ids.has(item.id)&&item.needed).map(item=>({label:item.name,before:item.before,after:item.after,reason:item.description})),'Preferência selecionada pelo usuário.');}return result;}),
    restoreWindowsTuning:gated(async()=>{if(await sessions.getState())throw new Error('Encerre a sessão de jogo antes de restaurar o Windows.');const state=await windowsTuning.inspect(),result=await resolveRestoreConflict({module:'windows',description:'Algumas preferências do Windows mudaram depois do ajuste.',conflict:!!state.active?.conflicts?.length,ownerToken:state.active?.ownerToken,canDiscard:state.active?.canDiscard===true,restore:()=>windowsTuning.restore(),discard:token=>windowsTuning.discardBackup(token)});await resolveChanges('windows',result,{labels:result?.restoredItems});return result;}),
    launchBenchmark:gated(async()=>{if(await system.isGameRunning())throw new Error('Feche o CS2 antes de iniciar com gravação de log.');return system.launchCS2({withConfig:false,benchmark:true});}),
    compareBenchmarks:gated(options=>benchmarks.compare(options)),
    exportBenchmarkComparison:gated(async options=>{const comparison=await benchmarks.compare(options);const selection=await dialog.showSaveDialog({title:'Exportar comparação de FPS',defaultPath:'csboost-antes-depois.html',filters:[{name:'Relatório HTML',extensions:['html']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,benchmarks.renderComparisonHtml(comparison));return {path:selection.filePath};}),
    importBenchmark:gated(async()=>{const selection=await dialog.showOpenDialog({title:'Importar relatório VProf real do CS2',properties:['openFile'],filters:[{name:'Log do CS2',extensions:['log','txt']}]});if(selection.canceled||!selection.filePaths?.[0])return {canceled:true};return benchmarks.importFile(selection.filePaths[0]);}),
    exportBenchmark:gated(async id=>{const report=await benchmarks.read(id);const selection=await dialog.showSaveDialog({title:'Exportar resultado',defaultPath:'csboost-benchmark.html',filters:[{name:'Relatório HTML',extensions:['html']}]});if(selection.canceled||!selection.filePath)return {canceled:true};await fs.writeFile(selection.filePath,benchmarks.renderHtml(report));return {path:selection.filePath};}),
  };
  // A deadline bounds the IPC wait, never the native operation's lifetime. Releasing
  // this lock on timeout could overlap a delayed write with restore or logout.
  let mutations=Promise.resolve(),activeOperation=null,queuedOperations=0,lastTimeout=null,lastSettlement=null;
  const operationState=()=>({active:activeOperation?{...activeOperation}:null,queued:queuedOperations,lastTimeout:lastTimeout?{...lastTimeout}:null,lastSettlement:lastSettlement?{...lastSettlement}:null});
  const timeoutFor=name=>{const value=operationTimeouts[name]??defaultOperationTimeoutMs;if(!Number.isSafeInteger(value)||value<1||value>3600000)throw Error('Prazo de operação inválido.');return value;};
  const enqueue=(name,handler,args)=>{
    const timeoutMs=timeoutFor(name);
    if(activeOperation?.status==='indeterminate')return Promise.reject(Error('Operação '+activeOperation.name+' com resultado indeterminado ainda em andamento. Aguarde a conclusão e confira a recuperação antes de continuar.'));
    let expired=false,begun=false,settled=false,timer;
    queuedOperations++;
    const work=mutations.then(async()=>{
      if(expired)return;
      queuedOperations--;begun=true;
      activeOperation={name,status:'running',startedAt:new Date().toISOString()};
      try {const value=await handler(...args);lastSettlement={name,status:'completed',at:new Date().toISOString()};return value;}
      catch(error){lastSettlement={name,status:'failed',at:new Date().toISOString()};throw error;}
      finally{activeOperation=null;}
    });
    // Retain quarantine even after the caller has stopped waiting. Catch both late
    // rejection and normal rejection so subsequent operations can run after settle.
    mutations=work.catch(()=>{});
    const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{
      if(settled)return;
      expired=true;const at=new Date().toISOString();
      lastTimeout={name,at,phase:begun?'running':'queued'};
      if(begun){activeOperation={...activeOperation,status:'indeterminate',timedOutAt:at};}
      else queuedOperations--;
      reject(Error(begun?'Prazo excedido em '+name+'. Resultado indeterminado; a operação pode continuar. Aguarde a conclusão e confira a recuperação.':'Prazo excedido aguardando '+name+'. A ação não foi iniciada; aguarde a operação em andamento.'));
    },timeoutMs);});
    return Promise.race([work,deadline]).finally(()=>{settled=true;clearTimeout(timer);});
  };
  const profileWriters=new Set(['saveProfile','deleteProfile','importProfileFile','importGameProfile','importProConfig','copyProToProfile']);
  const individualBoostConflicts=new Set(['activatePowerPlan','restorePowerPlan','applyProfileVideo','applyOptimization','restoreOptimization','applyWindowsTuning','restoreWindowsTuning','applyNvidiaProfile','restoreNvidiaProfile']);
  const pendingBoostConflicts=new Set(['launchCS2','startGameSession','launchBenchmark','startBenchmarkRun','startBenchmarkSetupRun','prepareFirmwareWorkflow','openFirmwarePbo','restartToFirmware']);
  for(const name of [...profileWriters,'applyDiscordTuning','restoreDiscordTuning','applyDiscordLocalSettings','restoreDiscordLocalSettings','applyDiscordStartup','restoreDiscordStartup','applyProfile','applyProfileVideo','restoreProfileConfig','launchCS2','activatePowerPlan','restorePowerPlan','startGameSession','setSessionAutoAttach','stopGameSession','applyOptimization','restoreOptimization','applyWindowsTuning','restoreWindowsTuning','applyNvidiaProfile','restoreNvidiaProfile','launchRyzenMaster','launchBenchmark','startBenchmarkRun','captureHardwareReference','checkHardwareReference','startBenchmarkSetupRun','clearShaderCache','restoreShaderCache','discardShaderCacheRecovery','capturePerformanceReference','comparePerformanceReference','applyBoost','restoreBoost','createFpsFlow','applyFpsBoost','recordFpsBoost','cancelFpsResume','prepareFirmwareWorkflow','openFirmwarePbo','checkFirmwareWorkflow','cancelFirmwareWorkflow','restartToFirmware']){
    const handler=methods[name];methods[name]=(...args)=>enqueue(name,async()=>{
      await requireSession();
      if(['startGameSession','startBenchmarkRun','startBenchmarkSetupRun'].includes(name))recoveryGuard?.ensureAvailable();
      if(!profileWriters.has(name)&&benchmarkRunner?.isActive())throw new Error('Cancele ou conclua o benchmark antes de alterar o jogo ou o sistema.');
      // Inspect ownership only for operations that conflict; never cache a recovery
      // decision, since another instance or recovery worker can change the journal.
      if(boostPlan&&(individualBoostConflicts.has(name)||pendingBoostConflicts.has(name))){
        const boost=await boostPlan.inspect();
        if(boost?.pendingRestore&&individualBoostConflicts.has(name))throw Error('Use Restaurar Boost Máximo antes de alterar esses ajustes individualmente.');
        if(boost?.pendingRestore&&boost.status!=='active'&&pendingBoostConflicts.has(name))throw Error('Conclua a restauração pendente do Boost Máximo primeiro.');
      }
      return handler(...args);
    },[]);
  }
  // Inventory can spawn short-lived native helpers. Serialize it with start and
  // prevent UI refreshes from introducing those processes into a live benchmark.
  for(const name of ['getDiscordTuning','getCompatibility','exportCompatibility','getSessionAutoAttach','refreshFpsFlow','previewFpsBoost','getSystemInfo','getGpuDiagnostics','getCpuTopology','getFrameCaptureStatus','configureFrameCapture','refreshSteam','getPowerPlans','getDisplays','resolveDisplayMode','getProfileConfigState','previewGameProfile','previewProfileVideo','previewOptimization','getEngineAssessment','previewBoost','getWindowsTuning','getNvidiaProfile','getAmdTuning','getMemoryTuning','getShaderCache','getPerformanceAudit','getExternalAdjustments','exportExternalAdjustments','readAmdStability','inspectBenchmarkRun','markBenchmarkAdjustments','resumeBenchmarkSetup']){
    const handler=methods[name];methods[name]=(...args)=>enqueue(name,async()=>{
      await requireSession();
      if(benchmarkRunner?.isActive())throw Error('Aguarde o benchmark terminar para atualizar este diagnóstico.');
      return handler(...args);
    },[]);
  }
  for(const name of ['logout','loginSteam','useLocalSteam']){
    const handler=methods[name];methods[name]=()=>enqueue(name,async()=>{
      if(benchmarkRunner?.isActive()||sessions&&await sessions.getState())throw new Error('Encerre a sessão ou o benchmark antes de mudar a conta.');
      if(boostPlan&&(await boostPlan.inspect()).pendingRestore)throw Error('Restaure o Boost Máximo antes de mudar esta conta.');
      return handler();
    },[]);
  }
  const recoveryHandler=methods.recoverAndQuit;
  methods.recoverAndQuit=()=>enqueue('recoverAndQuit',recoveryHandler,[]);
  return methods;
}
