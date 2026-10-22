import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/free/controller.mjs';
import {DEFAULT_CROSSHAIR,DEFAULT_CODE_PARAMETERS} from '../src/free/profiles.mjs';
test('new profile code and diagnostic APIs require the app Steam session before decoding or reading',async()=>{
  const api=createController({auth:{getSession:async()=>null}});
  for(const call of [()=>api.previewCrosshairCode({code:'bad'}),()=>api.exportCrosshairCode({}),()=>api.getPerformanceAudit(),()=>api.getExternalAdjustments(),()=>api.exportExternalAdjustments(),()=>api.capturePerformanceReference(),()=>api.comparePerformanceReference(),()=>api.exportPerformanceAudit()])await assert.rejects(call,/Steam/);
});
test('diagnostic capture/comparison serialize with system actions and refuse active benchmarks or sessions',async()=>{
  let active=true,session=null,calls=0;const api=createController({auth:{getSession:async()=>({steamId:'76561198000000001'})},benchmarkRunner:{isActive:()=>active},sessions:{getState:async()=>session},performanceAudit:{capture:async()=>{calls++;return{};},compare:async()=>{calls++;return{};}}});
  await assert.rejects(()=>api.capturePerformanceReference(),/benchmark/);await assert.rejects(()=>api.comparePerformanceReference(),/benchmark/);assert.equal(calls,0);active=false;session={};await assert.rejects(()=>api.capturePerformanceReference(),/Encerre/);session=null;await api.capturePerformanceReference();await api.comparePerformanceReference();assert.equal(calls,2);
  assert.match((await api.exportCrosshairCode({...DEFAULT_CROSSHAIR,codeParameters:{...DEFAULT_CODE_PARAMETERS}})).code,/^CSGO-/);
});

test('external-adjustment audit is serialized with system reads and refuses refresh during a benchmark',async()=>{
  let active=true,calls=0;const api=createController({auth:{getSession:async()=>({steamId:'76561198000000001'})},benchmarkRunner:{isActive:()=>active},sessions:{getState:async()=>null},externalAdjustments:{inspect:async id=>{calls++;assert.equal(id,'76561198000000001');return {readOnly:true,summary:{found:0}};},renderHtml:()=>'<html></html>'},dialog:{showSaveDialog:async()=>({canceled:true})}});
  await assert.rejects(()=>api.getExternalAdjustments(),/benchmark/);await assert.rejects(()=>api.exportExternalAdjustments(),/benchmark/);assert.equal(calls,0);active=false;assert.equal((await api.getExternalAdjustments()).readOnly,true);assert.equal(calls,1);assert.deepEqual(await api.exportExternalAdjustments(),{canceled:true});assert.equal(calls,2);
});
