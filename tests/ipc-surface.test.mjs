import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createController} from '../src/free/controller.mjs';
test('preload IPC methods exactly match the controller plus window commands',async()=>{
  const source=await fs.readFile(new URL('../src/free/preload.cjs',import.meta.url),'utf8');let surface;
  vm.runInNewContext(source,{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>surface=value},ipcRenderer:{invoke:async()=>({ok:true}),on(){},removeListener(){}}})});
  const actual=Object.keys(surface).filter(key=>key!=='onAuthChanged').sort();
  assert.deepEqual(actual,[...Object.keys(createController({})), 'minimize','quit'].sort());
  assert.ok(actual.includes('launchCS2'));
});

test('hardware tuning links are limited to reviewed vendor resources',async()=>{
  const opened=[];const controller=createController({auth:{getSession:async()=>({steamId:'76561198000000000'})},shell:{openExternal:async url=>opened.push(url)}});
  for(const id of ['nvidia-app','amd-adrenalin','intel-arc','intel-xtu','msi-afterburner'])assert.deepEqual(await controller.openHardwareTuningLink(id),{opened:true});
  assert.equal(opened.length,5);assert.ok(opened.every(url=>/^https:\/\/(www\.(nvidia|amd|intel|msi)\.com)\//.test(url)));
  await assert.rejects(controller.openHardwareTuningLink('https://example.com'),/Ferramenta de hardware inválida/);assert.equal(opened.length,5);
});
