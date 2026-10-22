import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {BROWSER_POLICIES,availableBrowserPolicies} from '../src/free/browser-policies.mjs';
import {createWindowsTuning,runUserRegistry} from '../src/free/windows-tuning.mjs';
import {BOOSTERS} from '../src/free/boosters/index.mjs';
import {backgroundHelpUrl} from '../src/free/background-help.mjs';
const inventory=()=>({edge:{installed:true,majorVersion:140,machineManaged:false},chrome:{installed:true,majorVersion:140,machineManaged:false}});
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-browser-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const values=new Map(),info=inventory();let ignore=false;
  const registry=async request=>{const key=request.key+'|'+request.name;if(request.action==='read')return structuredClone(values.get(key)||{exists:false});if(ignore)return;if(request.action==='remove')values.delete(key);else values.set(key,structuredClone(request.value));};
  const tuning=createWindowsTuning({directory,system:{refreshSteam:async()=>({cs2Installed:false}),isGameRunning:async()=>false},registry,browserInventory:async()=>info});
  return {tuning,values,info,ignore:()=>{ignore=true;}};
}
test('browser detection requires installed compatible versions and confirmed unmanaged machine scope',()=>{
  assert.equal(availableBrowserPolicies(inventory()).length,3);
  for(const input of [null,{}, {edge:{installed:true,majorVersion:140}},{edge:{installed:true,majorVersion:87,machineManaged:false}},{edge:{installed:false,majorVersion:140,machineManaged:false}},{edge:{installed:true,majorVersion:140,machineManaged:true}}])assert.equal(availableBrowserPolicies(input).length,0);
});
for(const policy of BROWSER_POLICIES)test('browser policy roundtrip, absent value and conflict: '+policy.id,async t=>{
  const f=await fixture(t),key=policy.key+'|'+policy.valueName;let preview=await f.tuning.inspect();
  await f.tuning.apply({ids:[policy.id],sourceSHA256:preview.sourceSHA256});assert.equal(f.values.get(key).data,0);await f.tuning.restore();assert.equal(f.values.has(key),false);
  f.values.set(key,{exists:true,type:'DWord',data:1});preview=await f.tuning.inspect();await f.tuning.apply({ids:[policy.id],sourceSHA256:preview.sourceSHA256});
  f.values.set(key,{exists:true,type:'DWord',data:7});assert.equal((await f.tuning.restore()).pendingRestore,true);assert.equal(f.values.get(key).data,7);
  f.values.set(key,{exists:true,type:'DWord',data:0});await f.tuning.restore();assert.equal(f.values.get(key).data,1);
  const booster=BOOSTERS.find(item=>item.id==='windows-'+policy.id);assert.equal((await booster.plan({windows:preview})).recommended,false);
});
test('machine management or browser disappearance prevents application; failed readback retains recovery',async t=>{
  const f=await fixture(t),preview=await f.tuning.inspect();f.info.edge.machineManaged=true;
  await assert.rejects(f.tuning.apply({ids:['edgeStartup'],sourceSHA256:preview.sourceSHA256}),/mudaram|disponível/);assert.equal(f.values.size,0);
  f.info.edge.machineManaged=false;f.ignore();await assert.rejects(f.tuning.apply({ids:['edgeStartup'],sourceSHA256:preview.sourceSHA256}),/não confirmou/);assert.ok((await f.tuning.inspect()).active);
});
test('browser registry adapter only permits the three fixed policy targets',async()=>{
  let calls=0;const read=async()=>{calls++;return {exists:false};};
  for(const policy of BROWSER_POLICIES)await runUserRegistry({action:'read',key:policy.key,name:policy.valueName},{read});assert.equal(calls,3);
  await assert.rejects(runUserRegistry({action:'write',key:BROWSER_POLICIES[0].key,name:'PasswordManagerEnabled',value:{type:'DWord',data:0}},{read}),/inválida/);assert.equal(calls,3);
});
test('browser uninstall still allows restoring this users original policy',async t=>{
  const f=await fixture(t),preview=await f.tuning.inspect();await f.tuning.apply({ids:['edgeStartup'],sourceSHA256:preview.sourceSHA256});f.info.edge.installed=false;
  assert.equal((await f.tuning.restore()).pendingRestore,false);assert.equal(f.values.size,0);
});
test('background help accepts only fixed topics and no renderer URLs',()=>{
  assert.equal(backgroundHelpUrl({topic:'startup'}),'ms-settings:startupapps');assert.equal(backgroundHelpUrl({topic:'notifications'}),'ms-settings:notifications');assert.match(backgroundHelpUrl({topic:'overlay'}),/^https:\/\/support.discord.com\//);
  for(const input of [null,{topic:'__proto__'},{topic:'constructor'},{topic:'https://example.com'},{topic:'overlay',url:'https://example.com'}])assert.throws(()=>backgroundHelpUrl(input),/inválida/);
});
