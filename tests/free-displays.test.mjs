import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createDisplays,displayFingerprint,validateDisplayInventory} from '../src/free/displays.mjs';

const execute=promisify(execFile);
const id=String.raw`\\.\DISPLAY1`;
const mode=(width,height,refreshHz=144,extra={})=>({width,height,refreshHz,bitsPerPixel:32,interlaced:false,orientation:0,...extra});
const fixture=()=>({source:'EnumDisplaySettingsExW',enumeratedAt:'2026-10-14T12:00:00Z',displays:[{
  id,adapterName:'Fixture GPU',monitorName:'Fixture Monitor',monitorNames:['Fixture Monitor'],primary:true,
  current:mode(1920,1080),modes:[mode(1920,1080),mode(1920,1080,60),mode(1280,960,120),mode(1280,960,144),mode(800,600,60)],
}]});
const clone=value=>JSON.parse(JSON.stringify(value));

test('read adapter receives only fixed read request and modes are real reported values',async()=>{
  const calls=[],data=fixture();const displays=createDisplays({runWorker:async request=>{calls.push(request);return data;}});
  const inventory=await displays.inspect();assert.equal(inventory.supported,true);assert.equal(inventory.displays[0].modes.length,5);
  assert.deepEqual(calls,[{operation:'read'}]);assert.equal(inventory.displays[0].current.refreshHz,144);assert.equal(inventory.customResolution.supported,false);assert.equal(inventory.vibrance.supported,false);
  assert.equal(inventory.displays[0].modes.every(value=>value.selectable),true);assert.deepEqual(data,fixture());
});

test('fingerprint excludes capture time but includes current mode and available modes',()=>{
  const before=fixture(),after=clone(before);after.enumeratedAt='2026-10-14T12:05:00Z';assert.equal(displayFingerprint(before),displayFingerprint(after));
  after.displays[0].current.refreshHz=60;assert.notEqual(displayFingerprint(before),displayFingerprint(after));
  after.displays[0].current.refreshHz=144;after.displays[0].modes.pop();assert.notEqual(displayFingerprint(before),displayFingerprint(after));
});

test('inventory normalizes order and duplicate modes without inventing unsupported entries',()=>{
  const data=fixture();data.displays[0].modes.reverse();data.displays[0].modes.push(mode(1920,1080));
  const normalized=validateDisplayInventory(data);assert.equal(normalized.displays[0].modes.length,5);assert.equal(displayFingerprint(normalized),displayFingerprint(fixture()));
});

test('resolution selection requires fresh fingerprint and exact monitor mode',async()=>{
  const data=fixture(),calls=[];const displays=createDisplays({runWorker:async request=>{calls.push(request);return clone(data);}});
  const inventory=await displays.inspect();
  const selected=await displays.resolveSelection({displayId:id,width:1280,height:960,refreshHz:120,previewFingerprint:inventory.fingerprint});
  assert.equal(selected.refreshHz,120);assert.equal(selected.selectionOnly,true);assert.deepEqual(selected.profileVideo,{width:1280,height:960,mode:'fullscreen',refreshHz:120});
  assert.equal(calls.length,2);assert.equal(calls.every(value=>JSON.stringify(value)==='{"operation":"read"}'),true);
  await assert.rejects(displays.resolveSelection({displayId:id,width:1440,height:1080,previewFingerprint:inventory.fingerprint}),/não foi informado/);
  await assert.rejects(displays.resolveSelection({displayId:id,width:1280,height:960,refreshHz:240,previewFingerprint:inventory.fingerprint}),/não foi informado/);
});

test('absent refresh chooses maximum for the selected dimensions only',async()=>{
  const data=fixture();data.displays[0].modes.push(mode(1920,1080,240));const displays=createDisplays({runWorker:async()=>data});const inventory=await displays.inspect();
  const chosen=await displays.resolveSelection({displayId:id,width:1280,height:960,previewFingerprint:inventory.fingerprint});assert.equal(chosen.refreshHz,144);
});

test('changed capabilities or disconnected monitor require refreshed selection',async()=>{
  const data=fixture(),displays=createDisplays({runWorker:async()=>clone(data)});const inventory=await displays.inspect();
  data.displays[0].modes.push(mode(1024,768,120));await assert.rejects(displays.resolveSelection({displayId:id,width:1280,height:960,previewFingerprint:inventory.fingerprint}),/mudaram/);
  const current=await displays.inspect();await assert.rejects(displays.resolveSelection({displayId:String.raw`\\.\DISPLAY2`,width:1280,height:960,previewFingerprint:current.fingerprint}),/não está ativo/);
});

test('interlaced, low-color and oversized modes are inventoried but cannot become CS2 fullscreen choices',async()=>{
  const data=fixture();data.displays[0].modes.push(mode(1024,768,60,{interlaced:true}),mode(1024,768,75,{bitsPerPixel:16}),mode(15360,8640,60));
  const displays=createDisplays({runWorker:async()=>data}),inventory=await displays.inspect();assert.equal(inventory.displays[0].modes.filter(value=>!value.selectable).length,3);
  await assert.rejects(displays.resolveSelection({displayId:id,width:1024,height:768,previewFingerprint:inventory.fingerprint}),/32 bits/);
  await assert.rejects(displays.resolveSelection({displayId:id,width:15360,height:8640,previewFingerprint:inventory.fingerprint}),/escolha um modo/);
});

test('orientation mismatch is not selected and unknown default refresh is not misreported as 1 Hz',async()=>{
  const data=fixture();data.displays[0].modes.push(mode(1080,1920,60,{orientation:1}),mode(1024,768,null));
  const displays=createDisplays({runWorker:async()=>data}),inventory=await displays.inspect();
  await assert.rejects(displays.resolveSelection({displayId:id,width:1080,height:1920,previewFingerprint:inventory.fingerprint}),/32 bits/);
  const selected=await displays.resolveSelection({displayId:id,width:1024,height:768,previewFingerprint:inventory.fingerprint});assert.equal(selected.refreshHz,null);assert.equal('refreshHz' in selected.profileVideo,false);
});

test('bad display IDs, arbitrary payloads, string numbers and invalid fingerprints are rejected without native call',async()=>{
  const calls=[],displays=createDisplays({runWorker:async request=>{calls.push(request);return fixture();}});
  for(const request of [
    {displayId:'cmd.exe; whoami',width:1920,height:1080,previewFingerprint:'a'.repeat(64)},
    {displayId:id,width:'1920',height:1080,previewFingerprint:'a'.repeat(64)},
    {displayId:id,width:1920,height:1080,refreshHz:144.5,previewFingerprint:'a'.repeat(64)},
    {displayId:id,width:1920,height:1080,previewFingerprint:'old'},
    null,
  ])await assert.rejects(displays.resolveSelection(request),/escolha um modo/);
  assert.equal(calls.length,0);
});

test('bad worker inventories never become successful compatibility claims',async()=>{
  const values=[];for(const mutate of [
    data=>{data.source='unknown-helper';},data=>{data.displays[0].current.width=Infinity;},data=>{data.displays.push(clone(data.displays[0]));},
    data=>{data.displays[0].modes[0].refreshHz=1;},data=>{data.displays[0].current.interlaced='false';},data=>{data.displays=[];},
  ]){const data=fixture();mutate(data);values.push(data);}
  for(const data of values){const inventory=await createDisplays({runWorker:async()=>data}).inspect();assert.equal(inventory.supported,false);assert.equal(inventory.displays.length,0);assert.equal(inventory.fingerprint,null);}
});

test('unsupported or missing worker reports concrete unavailable capabilities',async()=>{
  const displays=createDisplays({runWorker:async()=>{throw new Error('No desktop session fixture');}});const inventory=await displays.inspect();
  assert.equal(inventory.supported,false);assert.equal(inventory.reason,'No desktop session fixture');assert.equal(inventory.customResolution.supported,false);assert.equal(inventory.vibrance.supported,false);
  await assert.rejects(displays.resolveSelection({displayId:id,width:1920,height:1080,previewFingerprint:'a'.repeat(64)}),/No desktop/);
  assert.throws(()=>createDisplays({workerPath:path.resolve('bad.exe')}),/Caminho/);
});

const workerPath=path.resolve('vendor/native/csboost-display.exe');
const nativeAvailable=process.platform==='win32'&&process.arch==='x64'&&await fs.stat(workerPath).then(value=>value.isFile(),()=>false);
test('native worker ABI has exact Windows Unicode structure sizes',{skip:!nativeAvailable?'Worker Windows não compilado neste ambiente.':false},async()=>{
  const {stdout}=await execute(workerPath,['--self-test'],{windowsHide:true,timeout:15000,encoding:'utf8'});const value=JSON.parse(stdout);
  assert.deepEqual(value,{ok:true,value:{devmodeSize:220,displayDeviceSize:840,readOnly:true}});
});

test('native worker refuses resolution/driver writes and extra fields',{skip:!nativeAvailable?'Worker Windows não compilado neste ambiente.':false},async()=>{
  for(const request of [{operation:'apply',width:1280,height:960},{operation:'read',width:1280}]){
    let output;try{await execute(workerPath,['--request',Buffer.from(JSON.stringify(request)).toString('base64')],{windowsHide:true,timeout:15000,encoding:'utf8'});assert.fail('mutation should not be accepted');}catch(error){output=JSON.parse(error.stdout);}
    assert.equal(output.ok,false);assert.match(output.error,/apenas leitura/);
  }
});

test('native read-only inventory observes this desktop without applying any mode',{skip:!nativeAvailable?'Worker Windows não compilado neste ambiente.':false},async()=>{
  const result=await createDisplays({workerPath}).inspect();assert.equal(result.supported,true,result.reason);assert.ok(result.displays.length>0);
  for(const display of result.displays){assert.ok(display.current.width>=320);assert.ok(display.current.height>=200);assert.ok(display.modes.length>0);assert.equal(typeof display.primary,'boolean');}
});
