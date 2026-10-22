import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEFAULT_SETTINGS,DEFAULT_CROSSHAIR,DEFAULT_CODE_PARAMETERS,validateSettings,renderConfig,exportProfileCrosshair,createProfiles} from '../src/free/profiles.mjs';
import {crosshairCodeToEditor,decodeCrosshairCode} from '../src/free/crosshair-code.mjs';
import {serializePortableProfile,parsePortableProfile} from '../src/free/profile-transfer.mjs';
const legacy='CSGO-Cn37R-YE7vo-pLCAL-aURmZ-z6zkG',modern='CSGO-G8oAC-RyvWc-Hi3CZ-voSwn-QJbfE',cs='CSvbPubOq37zTGqtsPTP5QTrp5CB4xFXiKRLfzJsm49ZRe';

for(const code of [legacy,modern,cs])test('profile preserves imported extra fields in saved CFG and portable JSON: '+code,async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-code-profile-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const profiles=createProfiles(directory),crosshair=crosshairCodeToEditor(code,DEFAULT_CROSSHAIR).crosshair;
  const saved=await profiles.save({name:'Imported QA',settings:{...structuredClone(DEFAULT_SETTINGS),crosshair}});
  assert.equal((await profiles.read(saved.id)).settings.crosshair.shareCodeSource,code);
  const portable=parsePortableProfile(serializePortableProfile(saved));assert.equal(portable.settings.crosshair.shareCodeSource,code);
  const exported=exportProfileCrosshair(saved.settings.crosshair);assert.equal(exported.code,code);
  const cfg=renderConfig(saved);assert.match(cfg,/cl_crosshair_dynamic_splitdist/);assert.match(cfg,/cl_crosshair_dynamic_splitalpha_outermod/);assert.equal((cfg.match(/cl_crosshairstyle /g)||[]).length,1);
  if(code===cs){assert.match(cfg,/cl_crosshairoutline_a "255"/);assert.match(cfg,/cl_ironsight_dot_scale "1"/);}
});
test('editing sourced RGB/geometry preserves invisible fields, but invalid source or conversion cannot save',()=>{
  const c=crosshairCodeToEditor(modern,DEFAULT_CROSSHAIR).crosshair;c.red=33;c.lengthPixels=9;
  const exported=decodeCrosshairCode(exportProfileCrosshair(c).code);assert.equal(exported.fields.red,33);assert.equal(exported.fields.length,9);assert.equal(exported.fields.outerSplitAlpha,.35);
  assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,crosshair:{...c,shareCodeSource:'CSGO-invalid'}}));
  assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,crosshair:{...c,version:2,style:4}}),/converter/);
});
test('own new share code requires explicit complete parameters and round-trips without guessed extras',()=>{
  assert.throws(()=>exportProfileCrosshair(DEFAULT_CROSSHAIR),/parâmetros/);
  for(const version of [2,3]){const c={...DEFAULT_CROSSHAIR,version,codeParameters:{...DEFAULT_CODE_PARAMETERS}},decoded=decodeCrosshairCode(exportProfileCrosshair(c).code);assert.equal(decoded.fields.splitDistance,3);assert.equal(decoded.fields.outerSplitAlpha,.5);assert.equal(decoded.fields.length,version===2?2:2);assert.match(renderConfig({settings:{...DEFAULT_SETTINGS,crosshair:c}}),/cl_crosshair_dynamic_splitdist "3"/);}
});
test('legacy profiles without optional share parameters keep their previous CFG behavior',()=>{const c={...DEFAULT_CROSSHAIR,version:2};delete c.version;const settings=validateSettings({...DEFAULT_SETTINGS,crosshair:c});assert.equal(settings.crosshair.version,2);assert.equal(settings.crosshair.codeParameters,undefined);assert.doesNotMatch(renderConfig({settings}),/dynamic_splitdist/);});
test('additional parameters reject arbitrary fields and quantization is never silently rounded',()=>{assert.throws(()=>validateSettings({...DEFAULT_SETTINGS,crosshair:{...DEFAULT_CROSSHAIR,codeParameters:{...DEFAULT_CODE_PARAMETERS,command:'exec bad'}}}),/inválidos/);const c={...DEFAULT_CROSSHAIR,codeParameters:{...DEFAULT_CODE_PARAMETERS,innerSplitAlpha:.123}};assert.throws(()=>exportProfileCrosshair(c),/incremento|represent|quant|precis|passo|fracion/i);});
