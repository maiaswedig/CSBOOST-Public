// Fixture game/driver/registry only; exercises the full renderer -> IPC -> journals.
const fs=require('node:fs/promises');
const path=require('node:path');
module.exports=async function({js,click,waitFor,benchmarkRunner,benchmarkSetup,boostPlan,sessions,resumeOnLogin,setRunning,setBoot,managedLog,capFile,videoFile,spawnCalls,output,capture}){
  await click('FPS+');await waitFor(()=>js("!!document.querySelector('.fps-wizard-shell')"),'dedicated wizard layout');await click('Configurar FPS+');await waitFor(()=>js("document.querySelectorAll('.fps-preset').length===3"),'FPS+ three profile choices');
  await fs.writeFile(path.join(output,'fps-profiles-QA.png'),await capture());
  await js("[...document.querySelectorAll('.fps-preset')].find(button=>button.querySelector('strong').textContent==='Competitivo').click()");
  await click('Continuar');await waitFor(async()=>(await benchmarkSetup.getState())?.guided,'guided study persisted');
  if((await benchmarkSetup.getState()).targetRuns!==1)throw Error('Guided study must use one run');
  await fs.writeFile(path.join(output,'fps-before-QA.png'),await capture());
  async function conditions(){await waitFor(()=>js("document.querySelectorAll('.fps-conditions input').length===3"),'FPS+ explicit workload checks');await js("document.querySelectorAll('.fps-conditions input').forEach(input=>input.checked=true)");await click('Confirmar condições');}
  async function measure(group,index){
    await waitFor(()=>js(`[...document.querySelectorAll('button')].some(button=>button.textContent==='Iniciar ${group}'&&!button.disabled)`),'next explicit '+group+' run');
    await click(`Iniciar ${group}`);await waitFor(async()=>(await benchmarkRunner.getState())?.status==='waiting-for-game','managed '+group+' preparation');
    setRunning(true);await benchmarkRunner.poll();
    const cap=await fs.readFile(capFile,'utf8');await fs.writeFile(capFile,cap.replace(/"fps_max"\s+"1000"/,'"fps_max" "0"'));
    const average=(group==='Antes'?190:220)+index;
    await fs.appendFile(managedLog,`10/17 10:00:00 Loading map "de_dust2" (addon '3240880604')\n10/17 10:00:01 execing maps/fpsheavenbenchmark.cfg\n10/17 10:00:02 Created physics for benchmark_mainmap\n10/17 10:00:03 ChangeGameUIState: CSGO_GAME_UI_STATE_LOADINGSCREEN -> CSGO_GAME_UI_STATE_INGAME\n10/17 10:00:04 [VProf] VProfLite started.\n10/17 10:02:05 [VProf] Summary of ${average*120} frames and 120 1-second intervals\n10/17 10:02:05 [VProf] FPS: Avg=${average}, P1=${group==='Antes'?120:140}\n`);
    await benchmarkRunner.poll();if((await benchmarkRunner.getState()).status!=='waiting-for-game-close')throw Error('Guided run did not wait for FPS restoration');
    setRunning(false);await benchmarkRunner.poll();if((await benchmarkRunner.getState()).status!=='completed')throw Error('Guided run failed');
    if(!/"fps_max"\s+"1000"/.test(await fs.readFile(capFile,'utf8')))throw Error('Guided run lost the original cap');
    await waitFor(async()=>{const state=await benchmarkSetup.getState();return state[group==='Antes'?'baselineIds':'optimizedIds'].length===index;},'owned '+group+' result associated once');
  }
  await conditions();await measure('Antes',1);
  await waitFor(()=>js("[...document.querySelectorAll('button')].some(button=>button.textContent==='Conferir boosters')"),'guided native adjustment stage');
  const videoBefore=await fs.readFile(videoFile,'utf8');
  const expectedBoosters=(await boostPlan.preview({automatic:true,preset:'competitive'})).items.length;await click('Conferir boosters');await waitFor(()=>js(`document.querySelectorAll('.fps-boost-items input').length===${expectedBoosters}`),'guided booster selection');
  if(!await js("!document.querySelector('.fps-boost-advanced').open&&[...document.querySelectorAll('.fps-boost-items input')].every(input=>input.disabled)"))throw Error('Guided flow must calculate automatic choices and hide manual options');
  await js("document.querySelector('[aria-label=\"Reiniciar antes do Depois\"]').click()");
  await js("document.querySelector('[aria-label=\"Abrir CSBOOST no próximo login do Windows\"]').click()");
  await fs.writeFile(path.join(output,'fps-boosters-QA.png'),await capture());
  await click('Aplicar boosters e continuar');try{await waitFor(async()=>(await benchmarkSetup.getState()).adjustments.rebootPending,'durable guided reboot stage',240);}catch(error){const diagnostic={setup:await benchmarkSetup.getState(),boost:await boostPlan.inspect(),resume:resumeOnLogin.status(),visibleText:await js("document.querySelector('.fps-flow')?.innerText"),alerts:await js("[...document.querySelectorAll('.error-box,.success-text')].map(node=>node.innerText)")};await fs.writeFile(path.join(output,'fps-apply-diagnostics-QA.json'),JSON.stringify(diagnostic,null,2));throw Error(error.message+': '+JSON.stringify({setup:diagnostic.setup.adjustments,lastError:diagnostic.setup.lastError,boost:diagnostic.boost.status,resume:diagnostic.resume,alerts:diagnostic.alerts}));}
  if(!resumeOnLogin.status().armed)throw Error('Automatic return was not explicitly armed in fixture');
  if((await boostPlan.inspect()).videoPreset!=='competitive'||!(/"setting.msaa_samples"\s+"2"/.test(await fs.readFile(videoFile,'utf8'))))throw Error('Competitive profile did not apply the reviewed 2x MSAA fixture');
  if((await benchmarkSetup.getState()).adjustments.source!=='csboost-owned-boost')throw Error('Guided adjustment lost its own receipt');
  setBoot('QA GUIDED BOOT2');await click('Conferir reinício e continuar');if(resumeOnLogin.status().armed)throw Error('Automatic return was not cancelled after continuation');await conditions();const readiness=await benchmarkSetup.getState();if(!readiness.canStartOptimized)throw Error('Depois indisponível: '+JSON.stringify({checklist:readiness.checklist,warnings:readiness.warnings,error:readiness.lastError}));await measure('Depois',1);
  await waitFor(()=>js("[...document.querySelectorAll('button')].some(button=>button.textContent==='Ver comparação FPS+')"),'guided comparison stage');await click('Ver comparação FPS+');
  await waitFor(()=>js("!!document.querySelector('[aria-label=\"Plataforma do FPS+\"]')"),'guided launcher after actual fixture comparison');
  const final=await benchmarkSetup.getState();if(final.baselineIds.length!==1||final.optimizedIds.length!==1||final.status!=='completed'||final.comparison.before.averageFps!==191||final.comparison.after.averageFps!==221)throw Error('Guided single-run comparison is wrong');
  if(!await js("document.querySelectorAll('.fps-result-pair .fps-metrics').length===2&&document.querySelector('[data-metric=averageFps]').textContent.includes('+15,71%')&&document.querySelector('.fps-flow').textContent.includes('variação entre execuções não foi medida')"))throw Error('Before/After cards or observed delta are missing');
  await click('Exportar comparativo FPS+');await fs.writeFile(path.join(output,'fps-result-QA.png'),await capture());
  const launches=spawnCalls.length;await js("document.querySelector('.fps-launch-settings').open=true");await js("const select=document.querySelector('[aria-label=\"Plataforma do FPS+\"]');select.value='faceit';select.dispatchEvent(new Event('change',{bubbles:true}))");await click('Preparar sessão para o cliente');
  await waitFor(async()=>(await sessions.getState())?.provider==='faceit','external-client session prepared without launching Steam');if(spawnCalls.length!==launches)throw Error('FACEIT preparation launched Steam');
  setRunning(true);await sessions.poll();if((await sessions.getState()).status!=='running')throw Error('External CS2 was not observed');
  setRunning(false);await click('Encerrar sessão FPS+');await waitFor(async()=>!await sessions.getState(),'external session restored');
  await click('Restaurar boosters FPS+');await waitFor(async()=>!(await boostPlan.inspect()).pendingRestore,'guided owned Boost restoration');if(await fs.readFile(videoFile,'utf8')!==videoBefore)throw Error('Guided profile did not restore exact video');
};
