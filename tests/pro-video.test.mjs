import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PRO_VIDEO_FIELDS,normalizeProVideo,validateProVideo,planProVideo} from '../src/free/pro-video.mjs';
import {parseVideoConfig} from '../src/free/optimizations.mjs';

const fixture=(extra={})=>'\uFEFF"video.cfg"\r\n{\r\n\t// unrelated comment\r\n'+Object.entries({'setting.defaultres':'1280','setting.defaultresheight':'960','setting.mat_vsync':'1','setting.msaa_samples':'4','setting.r_csgo_cmaa_enable':'0','setting.shaderquality':'1','setting.videocfg_shadow_quality':'3','setting.videocfg_dynamic_shadows':'1','setting.videocfg_texture_detail':'2','setting.videocfg_ao_detail':'3','setting.videocfg_particle_detail':'2','setting.videocfg_hdr_detail':'-1','setting.r_texturefilteringquality':'5','setting.r_low_latency':'2','setting.videocfg_fsr_detail':'0','setting.fullscreen':'1','setting.nowindowborder':'0','setting.refreshrate_numerator':'144001','setting.refreshrate_denominator':'1000','UnknownFutureSetting':'keep \\ and "quotes"',...extra}).filter(([,value])=>value!==null).map(([key,value])=>`\t${JSON.stringify(key)}\t\t${JSON.stringify(value)}`).join('\r\n')+'\r\n}\r\n';
const published={wait_for_vertical_sync:'Disabled','multisampling_anti-aliasing_mode':'8x MSAA',global_shadow_quality:'High',dynamic_shadows:'All',model_texture_detail:'Low',ambient_occlusion:'Medium',particle_detail:'Low',high_dynamic_range:'Quality',shader_detail:'Low',texture_filtering_mode:'Bilinear'};
test('public professional facts map to closed game values without filling unpublished fields',()=>{
  assert.equal(normalizeProVideo({'multisampling_anti-aliasing_mode':'2x MSAA'}).supported.length,2);const normalized=normalizeProVideo(published);
  assert.equal(normalized.supported.length,11);assert.equal(normalized.unsupported.length,0);
  assert.equal(normalized.values['setting.msaa_samples'],'8');assert.equal(normalized.values['setting.r_csgo_cmaa_enable'],'0');
  assert.equal(normalized.values['setting.videocfg_shadow_quality'],'2');assert.equal(normalized.values['setting.videocfg_ao_detail'],'2');assert.equal(normalized.values['setting.videocfg_hdr_detail'],'-1');assert.equal(normalized.values['setting.r_texturefilteringquality'],'0');
  assert.deepEqual(normalizeProVideo({shader_detail:'High'}).values,{'setting.shaderquality':'1'});
  assert.deepEqual(normalizeProVideo({shader_detail:null}).values,{});
});
test('all established AA, filtering, quality and HDR choices keep their game enums',()=>{
  for(const [label,msaa,cmaa]of [['None','0','0'],['2x MSAA','2','0'],['4x MSAA','4','0'],['8x MSAA','8','0']]){const {values}=normalizeProVideo({'multisampling_anti-aliasing_mode':label});assert.equal(values['setting.msaa_samples'],msaa);assert.equal(values['setting.r_csgo_cmaa_enable'],cmaa);}
  for(const [i,label]of ['Bilinear','Trilinear','Anisotropic 2x','Anisotropic 4x','Anisotropic 8x','Anisotropic 16x'].entries())assert.equal(normalizeProVideo({texture_filtering_mode:label}).values['setting.r_texturefilteringquality'],String(i));
  assert.equal(normalizeProVideo({texture_filtering_mode:'Anisotropic 16×'}).values['setting.r_texturefilteringquality'],'5');
  assert.equal(normalizeProVideo({ambient_occlusion:'Disabled'}).values['setting.videocfg_ao_detail'],'0');assert.equal(normalizeProVideo({ambient_occlusion:'High'}).values['setting.videocfg_ao_detail'],'3');assert.equal(normalizeProVideo({particle_detail:'Very High'}).values['setting.videocfg_particle_detail'],'3');assert.equal(normalizeProVideo({high_dynamic_range:'Performance'}).values['setting.videocfg_hdr_detail'],'3');
});
test('unknown video labels, commands and driver settings stay unapplied',()=>{
  const {values,supported,unsupported}=normalizeProVideo({shader_detail:'1; quit',model_texture_detail:'Ultra',nvidia_reflex_low_latency:'Enabled + Boost','nvidia_g-sync':'Enabled',brightness:'130%',boost_player_contrast:'Enabled',fidelityfx_super_resolution:'Disabled (Highest Quality)',scaling_mode:'Stretched',sensitivity:'1.25',not_a_setting:'exec evil'});
  assert.deepEqual(values,{});assert.deepEqual(supported,[]);assert.equal(unsupported.length,8);assert.equal(unsupported[0].source,'model_texture_detail');assert.ok(unsupported.every(item=>item.reason));
});
test('validation rejects arbitrary native keys, noncanonical numbers, prototypes and split AA',()=>{
  for(const values of [null,[],{'setting.mat_vsync':0},{'setting.mat_vsync':'01'},{'setting.mat_vsync':'1;quit'},{'setting.videocfg_ao_detail':'1'},{'setting.defaultres':'1920'},{'setting.r_low_latency':'1'},{'setting.msaa_samples':'4'},{'setting.r_csgo_cmaa_enable':'1'},{'setting.msaa_samples':'4','setting.r_csgo_cmaa_enable':'1'},JSON.parse('{"__proto__":"0"}')])assert.throws(()=>validateProVideo(values));
  const input={'setting.shaderquality':'0','setting.mat_vsync':'1'};assert.deepEqual(Object.keys(validateProVideo(input)),['setting.mat_vsync','setting.shaderquality']);assert.notEqual(validateProVideo(input),input);
  assert.throws(()=>normalizeProVideo([]));assert.throws(()=>normalizeProVideo(Object.create({shader_detail:'Low'})));
  const accessor={};Object.defineProperty(accessor,'shader_detail',{enumerable:true,get(){throw Error('must not run');}});assert.throws(()=>normalizeProVideo(accessor),/inválidos/);
  assert.ok(Object.isFrozen(PRO_VIDEO_FIELDS));assert.ok(PRO_VIDEO_FIELDS.every(field=>Object.isFrozen(field)&&Object.isFrozen(field.values)));
});
test('planning changes only existing selected spans, preserving resolution and unrelated bytes',()=>{
  const before=fixture(),values=normalizeProVideo({shader_detail:'Low','multisampling_anti-aliasing_mode':'2x MSAA'}).values,plan=planProVideo(before,values);
  assert.equal(plan.preset,'professional');assert.equal(plan.resolution,'keep');assert.equal(plan.width,1280);assert.equal(plan.height,960);assert.equal(plan.pixelChangePercent,0);assert.equal(plan.changes.length,2);assert.equal(plan.unsupported.length,0);
  assert.equal(plan.text,before.replace('"setting.msaa_samples"\t\t"4"','"setting.msaa_samples"\t\t"2"').replace('"setting.shaderquality"\t\t"1"','"setting.shaderquality"\t\t"0"'));
  assert.equal(plan.sourceSHA256,crypto.createHash('sha256').update(Buffer.from(before)).digest('hex'));assert.equal(parseVideoConfig(plan.text).get('setting.r_low_latency').value,'2');assert.equal(parseVideoConfig(plan.text).get('UnknownFutureSetting').value,'keep \\ and "quotes"');
});
test('missing native keys are reported and AA cannot be applied halfway',()=>{
  const before=fixture({'setting.r_csgo_cmaa_enable':null,'setting.shaderquality':null}),values=normalizeProVideo({'multisampling_anti-aliasing_mode':'2x MSAA',shader_detail:'Low',wait_for_vertical_sync:'Disabled'}).values,plan=planProVideo(before,values);
  assert.deepEqual(plan.unsupported,['MSAA','CMAA','Detalhe dos shaders']);assert.equal(plan.changes.length,1);assert.equal(parseVideoConfig(plan.text).get('setting.msaa_samples').value,'4');assert.ok(!parseVideoConfig(plan.text).has('setting.r_csgo_cmaa_enable'));assert.ok(!parseVideoConfig(plan.text).has('setting.shaderquality'));
});
test('already applied and source changes have distinct, exact preview fingerprints',()=>{
  const before=fixture(),values={'setting.mat_vsync':'1'},plan=planProVideo(before,values);
  assert.equal(plan.changes.length,0);assert.equal(plan.already.length,1);assert.equal(plan.text,before);
  const changed=planProVideo(before+'\r\n// external edit',values);assert.notEqual(changed.sourceSHA256,plan.sourceSHA256);assert.equal(changed.text,before+'\r\n// external edit');
});
test('empty selection, malformed source, duplicate keys and invalid resolution fail closed',()=>{
  assert.throws(()=>planProVideo(fixture(),{}),/Nenhuma/);assert.throws(()=>planProVideo('x',{'setting.mat_vsync':'0'}));assert.throws(()=>planProVideo(fixture().replace('"setting.shaderquality"','"setting.mat_vsync"'),{'setting.mat_vsync':'0'}),/duplicada/);assert.throws(()=>planProVideo(fixture({'setting.defaultres':'NaN'}),{'setting.mat_vsync':'0'}),/Resolução/);assert.throws(()=>planProVideo(fixture()+' '.repeat(256*1024),{'setting.mat_vsync':'0'}),/limite/);
});
