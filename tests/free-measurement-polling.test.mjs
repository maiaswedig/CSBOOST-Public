import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGameSessions} from '../src/free/sessions.mjs';
import {createProcessTuning} from '../src/free/process-tuning.mjs';
import {createCpuAffinity} from '../src/free/cpu-affinity.mjs';

async function directory(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-polling-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('session throttles inventory policies to 30 seconds while lifecycle remains responsive',async t=>{
  const root=await directory(t);let clock=0,running=false,priority=0,affinity=0,warm=0,restored=0;
  const module={readSessionContext:async()=>warm++,restore:async()=>restored++};
  const sessions=createGameSessions({directory:root,system:{launchCS2:async()=>{}},isGameRunning:async()=>running,now:()=>clock,pollMs:100000,
    processTuning:{...module,apply:async()=>{priority++;return {}; }},cpuAffinity:{...module,inspect:async()=>({supported:true}),apply:async()=>{affinity++;return {}; }}});
  t.after(()=>sessions.dispose());
  await sessions.start({preset:'balanced',processPolicy:{prioritizeGame:true,cpuDistribution:true}});assert.equal(warm,2);
  running=true;await sessions.poll();assert.equal(priority,1);assert.equal(affinity,1);
  for(let i=1;i<30;i++){clock=i*1000;await sessions.poll();}
  assert.equal(priority,1);assert.equal(affinity,1);
  clock=30000;await sessions.poll();assert.equal(priority,2);assert.equal(affinity,2);
  running=false;clock=31000;await sessions.poll();assert.equal(restored,2);assert.equal(await sessions.getState(),null);
});

test('persistent injected inventory/focus adapters avoid legacy subprocesses and installation rereads',async t=>{
  const root=await directory(t);let installations=0,inventory=0,cpuRequests=0;
  const system={refreshSteam:async()=>{installations++;return {cs2Installed:true,gamePath:root};}};
  const processes=async()=>{inventory++;return [];};
  const native=async args=>{cpuRequests++;if(args[0]==='focused')return {focused:true};return {supported:true,groups:1,systemMask:'ff',cores:[0,1,2,3].map(i=>({group:0,mask:(3<<i*2).toString(16),efficiencyClass:0}))};};
  const tuning=createProcessTuning({directory:path.join(root,'priority'),system,processes});
  const cpu=createCpuAffinity({directory:path.join(root,'cpu'),system,processes,runWorker:native,workerPath:path.join(root,'must-not-exist.exe')});
  await tuning.readSessionContext({refresh:true});await cpu.readSessionContext({refresh:true});
  for(let i=0;i<4;i++){await tuning.apply({prioritizeGame:true});await cpu.apply();}
  for(let i=0;i<30;i++)assert.equal(await cpu.isGameFocused(),true);
  assert.equal(installations,2);assert.equal(inventory,8);assert.equal(cpuRequests,31); // topology once + focus; no get/set for empty inventory
  tuning.clearSessionContext();await tuning.inspect();assert.equal(installations,3);
  await tuning.restore();await cpu.restore();
});

test('failed installation cache is retried instead of poisoning a later session',async t=>{
  const root=await directory(t);let reads=0;
  const tuning=createProcessTuning({directory:root,system:{refreshSteam:async()=>{if(++reads===1)throw Error('Steam temporarily unavailable');return {cs2Installed:false};}},processes:async()=>[]});
  await assert.rejects(tuning.readSessionContext(),/temporarily/);
  await tuning.readSessionContext();assert.equal(reads,2);
});
