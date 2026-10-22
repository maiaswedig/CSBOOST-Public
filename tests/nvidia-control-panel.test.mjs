import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNvidiaControlPanel} from '../src/free/nvidia-control-panel.mjs';
import {createController} from '../src/free/controller.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-nvidia-panel-'));
  t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^csboost-nvidia-panel-/);await fs.rm(root,{recursive:true,force:true});});
  return root;
}

test('opens the installed NVIDIA Control Panel executable when present',async t=>{
  const root=await fixture(t),executable=path.win32.join(root,'System32','nvcplui.exe');
  await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(executable,'test executable');
  const opened=[],panel=createNvidiaControlPanel({platform:'win32',env:{WINDIR:root},openPath:async file=>{opened.push(file);return '';},launchApp:async()=>{throw Error('fallback should not run');}});
  assert.deepEqual(await panel.open(),{opened:true,method:'executable'});assert.deepEqual(opened,[executable]);
});

test('launches the NVIDIA Store app through Windows AppsFolder when no executable exists',async t=>{
  const root=await fixture(t),explorer=path.win32.join(root,'explorer.exe'),calls=[];
  await fs.writeFile(explorer,'test executable');
  const panel=createNvidiaControlPanel({platform:'win32',env:{WINDIR:root},openPath:async()=>{throw Error('should use AppsFolder');},launchApp:async(file,args)=>calls.push({file,args})});
  assert.deepEqual(await panel.open(),{opened:true,method:'apps-folder'});
  assert.deepEqual(calls,[{file:explorer,args:['shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel']}]);
});

test('reports an absent panel and rejects other operating systems without launching anything',async t=>{
  const root=await fixture(t),panel=createNvidiaControlPanel({platform:'win32',env:{WINDIR:root},launchApp:async()=>{throw Error('should not launch');}});
  await assert.rejects(panel.open(),/Painel NVIDIA não foi encontrado/);
  await assert.rejects(createNvidiaControlPanel({platform:'linux'}).open(),/somente no Windows/);
});

test('display and NVIDIA panel launch commands are exposed behind the local login gate',async()=>{
  const opened=[],panelCalls=[],controller=createController({auth:{getSession:async()=>({steamId:'76561198000000000'})},shell:{openExternal:async url=>opened.push(url)},nvidiaControlPanel:{open:async()=>{panelCalls.push(true);return {opened:true};}}});
  assert.deepEqual(await controller.openDisplaySettings(),{opened:true});
  assert.deepEqual(await controller.openNvidiaControlPanel(),{opened:true});
  assert.deepEqual(opened,['ms-settings:display']);assert.deepEqual(panelCalls,[true]);
});
