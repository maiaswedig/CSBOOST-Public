import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDiagnostics,diagnoseMemory,diagnoseDisplay,diagnoseSecurity} from '../src/free/diagnostics.mjs';
import {readSystemInventory} from '../src/free/system-worker.mjs';
test('memory diagnostics qualify channel and XMP uncertainty, never infer enabled profiles from two DIMMs',()=>{
  assert.equal(diagnoseMemory(null).status,'unknown');assert.equal(diagnoseMemory({available:true,modules:[{}]}).status,'attention');assert.equal(diagnoseMemory({available:true,modules:[{reportedSpeed:3200,configuredClockMHz:2133},{}]}).status,'attention');assert.equal(diagnoseMemory({available:true,modules:[{reportedSpeed:3200,configuredClockMHz:3200},{}]}).status,'unknown');
});
test('display comparison uses current resolution and security diagnostics do not equate registry preference with running protection',()=>{
  const current={width:1920,height:1080,refreshHz:60,bitsPerPixel:32,orientation:0};const value={supported:true,displays:[{primary:true,current,modes:[{...current,refreshHz:144},{...current,width:1280,refreshHz:240}]}]};assert.match(diagnoseDisplay(value).message,/144 Hz/);assert.equal(diagnoseDisplay(value).status,'attention');current.refreshHz=144;assert.equal(diagnoseDisplay(value).status,'ok');
  assert.deepEqual(diagnoseSecurity({}).map(row=>row.status),['unknown','unknown']);assert.match(diagnoseSecurity({hvci:{exists:true,value:1}})[0].message,/não foi consultado/);assert.equal(diagnoseSecurity({hags:{exists:true,value:0}})[1].status,'unknown');
});
test('unavailable readers and timeouts become nonblocking unknown rows, without any writes',async()=>{
  let calls=0;const api=createDiagnostics({system:{refreshSteam:async()=>({cs2Installed:true,gamePath:'C:\\Steam\\CS2'})},memoryTuning:{snapshot:async()=>new Promise(()=>{})},displays:{inspect:async()=>{throw Error('denied');}},readInventory:async()=>{calls++;throw Error('invalid JSON');},timeoutMs:20});
  const result=await api.inspect();assert.equal(result.readOnly,true);assert.equal(result.blocksBoost,false);assert.equal(result.items.length,6);assert.ok(result.items.every(row=>row.status==='unknown'));assert.equal(calls,3);assert.ok(result.warnings.some(row=>row.includes('Prazo')));
});
test('native inventory uses fixed operations, no shell, three-second deadline and rejects invalid envelopes',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-native-read-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const workerPath=path.join(directory,'csboost-system.exe');await fs.writeFile(workerPath,'fixture');let calls=0;
  const run=async(file,args,options)=>{calls++;assert.equal(file,workerPath);assert.equal(options.shell,false);assert.equal(options.timeout,3000);assert.equal(args[0],'--request');assert.equal(JSON.parse(Buffer.from(args[1],'base64')).operation,'security');return {stdout:'{"ok":true,"value":{"readOnly":true}}'};};
  assert.equal((await readSystemInventory({operation:'security'},{workerPath,run,platform:'win32'})).readOnly,true);
  await assert.rejects(readSystemInventory({operation:'write'},{workerPath,run,platform:'win32'}),/inválida/);assert.equal(calls,1);await assert.rejects(readSystemInventory({operation:'security'},{workerPath,run:async()=>({stdout:'bad'}),platform:'win32'}),/inválida/);await assert.rejects(readSystemInventory({operation:'security'},{workerPath,run:async()=>({stdout:'{"ok":true,"value":[]}' }),platform:'win32'}),/indisponível/);
});
test('external audit inventory is a fixed native read-only request with a bounded timeout',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-external-native-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const workerPath=path.join(directory,'csboost-system.exe');await fs.writeFile(workerPath,'fixture');let calls=0;
  const value=await readSystemInventory({operation:'externalAudit'},{workerPath,platform:'win32',run:async(_file,args,options)=>{calls++;assert.equal(options.shell,false);assert.equal(options.timeout,12000);const request=JSON.parse(Buffer.from(args[1],'base64'));assert.deepEqual(request,{operation:'externalAudit'});return {stdout:'{"ok":true,"value":{"readOnly":true,"services":{"available":true,"items":[]},"registry":{}}}'};}});
  assert.equal(value.readOnly,true);assert.equal(calls,1);await assert.rejects(readSystemInventory({operation:'externalAudit',path:'HKLM\\bad'},{workerPath,platform:'win32',run:async()=>{throw Error('must not launch');}}),/inválida/);
});
test('GPU inventory uses its dedicated fixed read-only operation and bounded timeout',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-gpu-native-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const workerPath=path.join(directory,'csboost-system.exe');await fs.writeFile(workerPath,'fixture');let calls=0;
  const value=await readSystemInventory({operation:'gpuInventory'},{workerPath,platform:'win32',run:async(_file,args,options)=>{calls++;assert.equal(options.shell,false);assert.equal(options.timeout,30000);const request=JSON.parse(Buffer.from(args[1],'base64'));assert.deepEqual(request,{operation:'gpuInventory'});return {stdout:'{"ok":true,"value":{"adapters":[],"adrenalin":null}}'};}});
  assert.deepEqual(value,{adapters:[],adrenalin:null});assert.equal(calls,1);await assert.rejects(readSystemInventory({operation:'gpuInventory',path:'HKLM\\bad'},{workerPath,platform:'win32',run:async()=>{throw Error('must not launch');}}),/inválida/);
});
test('real Windows worker returns external settings inventory without writing',{skip:process.platform!=='win32'},async()=>{
  const workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','vendor','native','csboost-system.exe');const value=await readSystemInventory({operation:'externalAudit'},{workerPath,platform:'win32'});
  assert.equal(value.readOnly,true);assert.equal(typeof value.services?.available,'boolean');assert.ok(Array.isArray(value.services?.items));assert.equal(typeof value.registry?.systemResponsiveness?.available,'boolean');assert.equal(typeof value.registry?.powerThrottlingOff?.available,'boolean');
});
