import test from 'node:test';
import assert from 'node:assert/strict';
import {createGpuDiagnostics,normalizeGpuAdapters,GPU_VENDOR_IDS} from '../src/free/gpu-diagnostics.mjs';

const radeon={path:'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe',regular:true,reparse:false,signatureStatus:'Valid',signer:'Advanced Micro Devices, Inc.',sha256:'a'.repeat(64)};
const inventory=(overrides={})=>({adapters:[
  {name:'Microsoft Basic Display Adapter',pnpDeviceId:'PCI\\VEN_1002&DEV_744C'},
  {name:'NVIDIA GeForce RTX 4070',pnpDeviceId:'PCI\\VEN_10DE&DEV_2786'},
  {name:'Intel UHD Graphics',pnpDeviceId:'PCI\\VEN_8086&DEV_9A60'},
],adrenalin:radeon,...overrides});
const mockWindows={platform:'win32',arch:'x64'};

test('GPU vendors are derived from PCI identifiers and fall back to the reported name',()=>{
  assert.equal(GPU_VENDOR_IDS['1002'],'AMD');
  assert.deepEqual(normalizeGpuAdapters(inventory().adapters).map(item=>item.vendor),['AMD','NVIDIA','Intel']);
  assert.equal(normalizeGpuAdapters([{name:'AMD Radeon RX 7900 XTX',pnpDeviceId:''}])[0].vendor,'AMD');
  assert.equal(normalizeGpuAdapters([{name:'Generic adapter',pnpDeviceId:''}])[0].vendor,'Desconhecido');
  assert.throws(()=>normalizeGpuAdapters([{name:'',pnpDeviceId:''}]),/inválidos/);
});

test('diagnosis builds vendor-specific Adrenalin and NVIDIA actions without mixing vendors',async()=>{
  const api=createGpuDiagnostics({runInventory:async()=>inventory(),...mockWindows});
  const report=await api.inspect();
  assert.equal(report.primaryVendor,'Misto');assert.deepEqual(report.vendors,['AMD','NVIDIA','Intel']);
  assert.equal(report.amd.adrenalinInstalled,true);assert.equal(report.amd.directProfileControl,false);
  assert.equal(report.nvidia.directProfileControl,'requires-nvapi-check');
  assert.ok(report.profile.amd.some(item=>item.name==='Radeon Anti-Lag'));
  assert.ok(report.profile.amd.some(item=>item.name==='Radeon Chill'));
  assert.ok(report.profile.nvidia.some(item=>item.name==='Perfil do CS2'));
});

test('Adrenalin launch requires AMD hardware, the verified vendor executable, and a closed game',async()=>{
  let opened='';const api=createGpuDiagnostics({runInventory:async()=>inventory({adapters:[{name:'AMD Radeon RX 7900 XTX',pnpDeviceId:'PCI\\VEN_1002'}]}),openPath:async file=>{opened=file;return '';},...mockWindows});
  const result=await api.launchAdrenalin();assert.equal(result.opened,true);assert.equal(opened,radeon.path);
  const unsafe=createGpuDiagnostics({runInventory:async()=>inventory({adrenalin:{...radeon,signer:'Unknown Publisher'}}),openPath:async()=>{throw Error('must not open');},...mockWindows});
  await assert.rejects(()=>unsafe.launchAdrenalin(),/assinatura AMD válida/);
  const running=createGpuDiagnostics({runInventory:async()=>inventory(),openPath:async()=>'',isGameRunning:async()=>true,...mockWindows});
  await assert.rejects(()=>running.launchAdrenalin(),/Feche o CS2/);
  const nvidiaOnly=createGpuDiagnostics({runInventory:async()=>inventory({adapters:[{name:'NVIDIA GeForce RTX 4070',pnpDeviceId:'PCI\\VEN_10DE'}]}),openPath:async()=>'',...mockWindows});
  await assert.rejects(()=>nvidiaOnly.launchAdrenalin(),/GPU AMD Radeon não detectada/);
});

test('Adrenalin launch cancels if its signature, path, or file changes after the first check',async()=>{
  for(const changed of [
    {...radeon,signatureStatus:'Invalid'},
    {...radeon,path:'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe.bak'},
    {...radeon,sha256:'b'.repeat(64)},
  ]){
    let calls=0,opens=0;
    const api=createGpuDiagnostics({runInventory:async()=>{calls++;return inventory({adrenalin:calls===1?radeon:changed});},openPath:async()=>{opens++;return '';},...mockWindows});
    await assert.rejects(()=>api.launchAdrenalin(),/mudou desde a verificação inicial/);
    assert.equal(opens,0);
  }
});

test('a broken inventory leaves a clear unavailable diagnosis',async()=>{
  const report=await createGpuDiagnostics({runInventory:async()=>{throw Error('WMI indisponível');},...mockWindows}).inspect();
  assert.equal(report.available,false);assert.equal(report.primaryVendor,'Desconhecido');assert.match(report.reason,/WMI indisponível/);
});
