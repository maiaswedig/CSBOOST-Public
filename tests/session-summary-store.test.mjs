import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSessionSummaryStore} from '../src/free/session-summary-store.mjs';

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const record=(n,patch={})=>({sessionId:id(n),provider:'steam',startedAt:'2026-10-20T12:00:00.000Z',finishedAt:'2026-10-20T12:01:00.000Z',finishReason:'game-exit',captureStatus:'available',reason:'',frameCapture:{status:'available',version:'2.3.1',frameCount:3000,durationMs:60000,medianMs:4,p95Ms:8,p99Ms:16,meanFps:240,onePercentLowFps:100,stutters:2,stutterEligibleFrames:2990,methodology:{stutterFactor:3,stutterWindow:120,stutterMinHistory:10,timingSource:'MsBetweenPresents',timingDefinition:'present-interval'},timeline:{samples:[{t:0,ms:4},{t:20,ms:40,stutter:true}],maxBuckets:2},overhead:{collectorCpuMs:5,collectorPeakWorkingSetBytes:1024,wallMs:60000,samples:100,method:'process cpu+peak working set'},captureId:'private',processId:1234,stream:{swapChainAddress:'private'}},...patch});

async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-session-summary-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,store:createSessionSummaryStore({directory})};}

test('session history stores bounded chart data while dropping PIDs and capture internals',async t=>{
  const {directory,store}=await fixture(t),item=record(1);item.frameCapture.timeline.samples=Array.from({length:1100},(_,i)=>({t:i,ms:4,stutter:false}));await store.add(item);const saved=await store.getLast();assert.equal(saved.sessionId,id(1));assert.equal(saved.frameCapture.timeline.samples.length,960);assert.equal(saved.frameCapture.timeline.maxBuckets,2);assert.equal(saved.frameCapture.overhead.collectorCpuMs,5);const serialized=await fs.readFile(path.join(directory,'session-summaries.json'),'utf8');for(const secret of ['captureId','processId','swapChainAddress','private'])assert.equal(serialized.includes(secret),false);assert.equal(JSON.parse(serialized).version,1);
});

test('last ten sessions remain bounded, newest first, and a repeated session id replaces its old record',async t=>{
  const {directory,store}=await fixture(t);await Promise.all(Array.from({length:12},(_,index)=>store.add(record(index+1))));assert.equal((await store.getLast()).sessionId,id(12));await store.add(record(12,{finishReason:'manual-stop'}));assert.equal((await store.getLast()).finishReason,'manual-stop');let saved=JSON.parse(await fs.readFile(path.join(directory,'session-summaries.json'),'utf8'));assert.equal(saved.records.length,10);assert.equal(saved.records.at(-1).sessionId,id(3));await store.add(record(13));saved=JSON.parse(await fs.readFile(path.join(directory,'session-summaries.json'),'utf8'));assert.equal(saved.records.length,10);assert.equal(saved.records[0].sessionId,id(13));
});

test('invalid session identifiers and timestamps are rejected instead of persisted',async t=>{
  const {store}=await fixture(t);await assert.rejects(store.add(record(1,{sessionId:'../outside'})),/inválido/);await assert.rejects(store.add(record(2,{finishedAt:'yesterday'})),/inválido/);assert.equal(await store.getLast(),null);
});
