import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS,renderConfig} from '../src/free/profiles.mjs';
import {parseProfileConfig} from '../src/free/profile-transfer.mjs';

test('legacy named crosshair color is not replaced by its inactive custom RGB slots',()=>{
  const parsed=parseProfileConfig('cl_crosshairsize 2;cl_crosshaircolor 1;cl_crosshaircolor_r 255;cl_crosshaircolor_g 0;cl_crosshaircolor_b 0');
  assert.equal(parsed.settings.crosshair.version,2);assert.equal(parsed.settings.crosshair.color,1);
  assert.match(renderConfig({settings:parsed.settings}),/cl_crosshaircolor "1"/);
});

test('VCFG comments cannot override the operative user settings',()=>{
  const parsed=parseProfileConfig('"config" { "convars" { "sensitivity" "1.9" } }\n// "sensitivity" "99"\n',{format:'vcfg'});
  assert.equal(parsed.settings.sensitivity,1.9);
});

test('a shared crosshair field in a later machine file preserves an existing v3 pixel profile',()=>{
  const base=structuredClone(DEFAULT_SETTINGS);base.crosshair.lengthPixels=12;base.crosshair.gapPixels=4;
  const parsed=parseProfileConfig('"config" { "convars" { "cl_crosshair_sniper_width" "2" "fps_max" "1000" } }',{format:'vcfg',baseSettings:base});
  assert.equal(parsed.settings.crosshair.version,3);assert.equal(parsed.settings.crosshair.sniperWidth,2);
  assert.match(renderConfig({settings:parsed.settings}),/cl_crosshair_length "12"/);
});
