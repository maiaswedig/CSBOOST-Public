import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {DEFAULT_SETTINGS,validateSettings,renderConfig,createProfiles} from '../src/free/profiles.mjs';
import {parseProfileConfig,parsePortableProfile,serializePortableProfile,createProfileTransfer} from '../src/free/profile-transfer.mjs';

const settings=()=>structuredClone(DEFAULT_SETTINGS);
const legacySettings=()=>{const value=validateSettings(settings());delete value.hud.safeZoneX;delete value.hud.safeZoneY;delete value.radar.backgroundAlpha;return value;};
const checksum=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-hud-radar-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}

test('legacy saved HUD and radar profiles gain neutral defaults without rewriting source files',async t=>{
  const directory=await fixture(t),id=crypto.randomUUID(),profile={id,name:'Perfil anterior',updatedAt:'2026-10-18T12:00:00.000Z',settings:legacySettings()},file=path.join(directory,id+'.json');
  const original=JSON.stringify(profile,null,2);await fs.writeFile(file,original);
  const result=await createProfiles(directory).read(id);
  assert.equal(result.settings.hud.safeZoneX,1);assert.equal(result.settings.hud.safeZoneY,1);assert.equal(result.settings.radar.backgroundAlpha,.5);
  assert.deepEqual(result.settings,validateSettings(profile.settings));assert.equal(await fs.readFile(file,'utf8'),original);
});

test('HUD safe zones and radar background accept endpoints and reject invalid typed values',()=>{
  for(const [group,key,min,max]of [['hud','safeZoneX',.5,1],['hud','safeZoneY',.85,1],['radar','backgroundAlpha',0,1]]){
    for(const value of [min,max]){const input=settings();input[group][key]=value;assert.equal(validateSettings(input)[group][key],value);}
    for(const value of [min-.001,max+.001,NaN,Infinity,'1',false]){const input=settings();input[group][key]=value;assert.throws(()=>validateSettings(input),/inválido/,`${group}.${key}=${String(value)}`);}
  }
});

test('CFG and VCFG import retain HUD margins and transparent radar through generated commands',()=>{
  const input=settings();input.hud.safeZoneX=.67;input.hud.safeZoneY=.93;input.radar.backgroundAlpha=0;
  const generated=renderConfig({settings:input}),roundtrip=parseProfileConfig(generated);
  for(const command of ['safezonex "0.67"','safezoney "0.93"','cl_hud_radar_background_alpha "0"'])assert.ok(generated.includes(command));
  assert.deepEqual(roundtrip.settings.hud,input.hud);assert.deepEqual(roundtrip.settings.radar,input.radar);
  assert.ok(['safezonex','safezoney','cl_hud_radar_background_alpha'].every(key=>roundtrip.fields.includes(key)));
  const vcfg=parseProfileConfig('"convars" { "safezonex" "0.5" "safezoney" "0.85" "cl_hud_radar_background_alpha" "1" }',{format:'vcfg'});
  assert.equal(vcfg.settings.hud.safeZoneX,.5);assert.equal(vcfg.settings.hud.safeZoneY,.85);assert.equal(vcfg.settings.radar.backgroundAlpha,1);
});

test('invalid imported margins and radar opacity preserve the base instead of clamping or executing text',()=>{
  const input=settings();input.hud.safeZoneX=.7;input.hud.safeZoneY=.9;input.radar.backgroundAlpha=.2;
  const parsed=parseProfileConfig('volume .4; safezonex .49; safezoney .84; cl_hud_radar_background_alpha 1.01; safezonex "1;quit"; cl_hud_radar_background_alpha .4 extra',{baseSettings:input});
  assert.deepEqual(parsed.settings.hud,input.hud);assert.deepEqual(parsed.settings.radar,input.radar);assert.deepEqual(parsed.fields,['volume']);assert.equal(parsed.warnings.length,4);
  assert.doesNotMatch(renderConfig({settings:parsed.settings}),/quit|extra/);
});

test('portable HUD/radar exports roundtrip and older checked version-1 exports still migrate',()=>{
  const input=settings();input.hud.safeZoneX=.5;input.hud.safeZoneY=.85;input.radar.backgroundAlpha=.85;
  assert.deepEqual(parsePortableProfile(serializePortableProfile({name:'HUD atual',settings:input})).settings,input);
  const payload={format:'csboost-profile',version:1,name:'HUD anterior',settings:legacySettings()},record={...payload,sha256:checksum(payload)};
  const imported=parsePortableProfile(JSON.stringify(record));assert.deepEqual(imported.settings,validateSettings(payload.settings));
  record.settings.hud.scale=.6;assert.throws(()=>parsePortableProfile(JSON.stringify(record)),/alterado/);
  record.settings.hud.scale=DEFAULT_SETTINGS.hud.scale;record.settings.hud.safeZoneX=.8;assert.throws(()=>parsePortableProfile(JSON.stringify(record)),/alterado/);
});

test('own game import reads HUD margins and radar opacity from fixture files without game changes',async t=>{
  const directory=await fixture(t),steamPath=path.join(directory,'Steam'),cfg=path.join(steamPath,'userdata','1','730','local','cfg');await fs.mkdir(cfg,{recursive:true});
  const file=path.join(cfg,'cs2_user_convars_0_slot0.vcfg'),original='"convars" { "safezonex" ".77" "safezoney" ".91" "cl_hud_radar_background_alpha" ".35" }';await fs.writeFile(file,original);
  const profiles=createProfiles(path.join(directory,'profiles')),transfer=createProfileTransfer({profiles,system:{refreshSteam:async()=>({installed:true,cs2Installed:true,steamPath})},getSteamId:async()=>'76561197960265729'});
  const preview=await transfer.previewGame(),imported=await transfer.importGame({sourceFingerprint:preview.sourceFingerprint});
  assert.equal(preview.settings.hud.safeZoneX,.77);assert.equal(preview.settings.hud.safeZoneY,.91);assert.equal(preview.settings.radar.backgroundAlpha,.35);assert.equal(imported.appliedToGame,false);
  assert.deepEqual((await profiles.read(imported.profile.id)).settings,preview.settings);assert.equal(await fs.readFile(file,'utf8'),original);
});
