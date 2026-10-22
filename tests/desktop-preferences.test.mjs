import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DESKTOP_KEY,DESKTOP_EFFECTS,runDesktopPreference} from '../src/free/desktop-preferences.mjs';
import {createWindowsTuning} from '../src/free/windows-tuning.mjs';
import {readSystemInventory} from '../src/free/system-worker.mjs';
import {BOOSTERS} from '../src/free/boosters/index.mjs';

async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-desktop-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const values={mouseAcceleration:{exists:true,type:'String',data:'6,10,1'},menuDelay:{exists:true,type:'DWord',data:400}},calls=[];
  let ignoreWrite=false;
  for(const item of DESKTOP_EFFECTS)values[item.id]={exists:true,type:'DWord',data:1};
  const preferences=request=>runDesktopPreference(request,{read:async request=>{calls.push(request);if(request.action==='read')return structuredClone(values[request.name]);if(!ignoreWrite)values[request.name]={exists:true,...request.value};return {changed:true};}});
  const tuning=createWindowsTuning({directory,system:{refreshSteam:async()=>({cs2Installed:false}),isGameRunning:async()=>false},registry:async()=>({exists:false}),preferences});
  return {tuning,values,calls,ignore:()=>{ignoreWrite=true;}};
}
test('desktop preferences apply with prior journal, readback and exact conflict-aware restore',async t=>{
  const f=await fixture(t),preview=await f.tuning.inspect();await f.tuning.apply({ids:['mouseAcceleration','menuDelay'],sourceSHA256:preview.sourceSHA256});
  assert.equal(f.values.mouseAcceleration.data,'0,0,0');assert.equal(f.values.menuDelay.data,0);
  f.values.menuDelay.data=250;const restored=await f.tuning.restore();assert.equal(f.values.mouseAcceleration.data,'6,10,1');assert.equal(f.values.menuDelay.data,250);assert.deepEqual(restored.preserved.map(r=>r.id),['menuDelay']);
  f.values.menuDelay.data=0;await f.tuning.restore();assert.equal(f.values.menuDelay.data,400);assert.equal((await f.tuning.inspect()).active,null);
});
test('unchanged desktop settings are not rewritten; changed preview and failed readback fail closed',async t=>{
  const f=await fixture(t),old=await f.tuning.inspect();f.values.menuDelay.data=300;await assert.rejects(f.tuning.apply({ids:['menuDelay'],sourceSHA256:old.sourceSHA256}),/mudaram/);
  const preview=await f.tuning.inspect();f.ignore();await assert.rejects(f.tuning.apply({ids:['menuDelay'],sourceSHA256:preview.sourceSHA256}),/não confirmou/);assert.ok((await f.tuning.inspect()).active);await f.tuning.restore();assert.equal(f.values.menuDelay.data,300);
});
test('desktop adapters reject unknown settings and malformed values before native execution',async()=>{
  let calls=0;const read=async()=>{calls++;};
  for(const request of [{action:'remove',key:DESKTOP_KEY,name:'menuDelay'},{action:'write',key:DESKTOP_KEY,name:'mouseAcceleration',value:{type:'String',data:'6,10,3'}},{action:'write',key:DESKTOP_KEY,name:'menuDelay',value:{type:'DWord',data:-1}},{action:'read',key:DESKTOP_KEY,name:'defender'}])await assert.rejects(runDesktopPreference(request,{read}),/inválida/);
  assert.equal(calls,0);
});
test('new interaction boosters remain manual even when the settings need changes',async()=>{
  for(const id of ['mouseAcceleration','menuDelay',...DESKTOP_EFFECTS.map(item=>item.id)]){const booster=BOOSTERS.find(b=>b.id==='windows-'+id),plan=await booster.plan({windows:{items:[{id,needed:true}]}});assert.equal(plan.recommended,false);assert.equal(plan.available,true);}
});
test('real Windows desktop preferences can be read through the native API without writes',{skip:process.platform!=='win32'?'Leitura nativa exige Windows.':!existsSync('vendor/native/csboost-system.exe')?'Compile o worker de sistema antes da validação nativa.':false},async()=>{
  for(const name of ['mouseAcceleration','menuDelay',...DESKTOP_EFFECTS.map(item=>item.id)]){const result=await runDesktopPreference({action:'read',key:DESKTOP_KEY,name},{read:request=>readSystemInventory(request,{workerPath:path.resolve('vendor/native/csboost-system.exe')})});assert.equal(result.exists,true);}
});

for(const effect of DESKTOP_EFFECTS)test('visual preference roundtrip and external conflict: '+effect.id,async t=>{
  const f=await fixture(t),preview=await f.tuning.inspect();
  await f.tuning.apply({ids:[effect.id],sourceSHA256:preview.sourceSHA256});assert.equal(f.values[effect.id].data,0);
  await f.tuning.restore();assert.equal(f.values[effect.id].data,1);
  await assert.rejects(runDesktopPreference({action:'write',key:DESKTOP_KEY,name:effect.id,value:{type:'DWord',data:2}},{read:async()=>{throw Error('native called');}}),/inválida/);
});
