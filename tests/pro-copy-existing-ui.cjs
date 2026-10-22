module.exports=async function({js,click,waitFor,profiles,profileId,readCfg}){
  const before=await profiles.read(profileId),gameBefore=await readCfg();
  await click('Times e configs');
  await js("(()=>{const input=document.querySelector('[aria-label=\"Identificador de outro jogador\"]');input.value='qa-other';input.dispatchEvent(new Event('input',{bubbles:true}));})()");await click('Consultar outro jogador');await waitFor(()=>js("document.querySelector('.pro-detail-heading h2')?.textContent==='qa-other'"),'professional source for profile composition');
  await click('Atualizar jogador');await waitFor(()=>js("!!document.querySelector('.pro-config-builder')"),'professional source refreshed');
  await click('Somente mira');
  await js(`(()=>{const base=document.querySelector('[aria-label="Perfil base para a config profissional"]');base.value=${JSON.stringify(profileId)};base.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('Conferir diferenças');await waitFor(()=>js("!!document.querySelector('.pro-config-preview')"),'profile copy preview');
  await click('Copiar para o perfil base');await waitFor(async()=>(await profiles.read(profileId)).sectionSources?.crosshair?.playerId==='qa-other','selected professional section copied into base');
  const after=await profiles.read(profileId);for(const key of ['sensitivity','volume','video','hud','radar','viewmodel'])if(JSON.stringify(before.settings[key])!==JSON.stringify(after.settings[key]))throw Error('Unselected profile section changed: '+key);
  if(after.id!==before.id||await readCfg()!==gameBefore)throw Error('Profile composition changed identity or game files');
  await click('Editar perfil');await waitFor(()=>js("document.querySelector('.section-sources')?.textContent.includes('qa-other')"),'section attribution visible in editor');
};
