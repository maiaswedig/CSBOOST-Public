import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeNetwork,readNetworkDiagnostics} from '../src/free/network-diagnostics.mjs';
import shader from '../src/free/boosters/nvidia-shader-cache.mjs';
test('network report separates link speed from latency and removes identifying data',()=>{
  const result=summarizeNetwork({adapters:[{type:'wifi',up:true,speedBps:300000000,gateway:true,ip:'192.168.1.5',mac:'private',name:'my network'},{type:'ethernet',up:true,speedBps:100000000,gateway:true}]});
  assert.equal(result.adapters[0].linkMbps,300);assert.ok(result.notes.some(n=>n.includes('Wi-Fi')));assert.ok(result.notes.some(n=>n.includes('Mais de uma')));assert.ok(result.notes.some(n=>n.includes('100 Mbps')));assert.doesNotMatch(JSON.stringify(result),/192\.168|private|my network/);assert.equal(result.readOnly,true);
});
test('missing link speed stays unknown and diagnostic issues only the fixed read operation',async()=>{
  const calls=[];const result=await readNetworkDiagnostics({read:async request=>{calls.push(request);return {adapters:[{type:'other',up:false,speedBps:null}]};}});assert.equal(result.adapters[0].linkMbps,'unknown');assert.equal(result.adapters[0].gateway,'unknown');assert.deepEqual(calls,[{operation:'networkInfo'}]);assert.throws(()=>summarizeNetwork({adapters:[{}]}),/inválido/);
});
test('shader booster is automatic only for a confirmed disabled cache',async()=>{
  for(const [row,needed]of [[{recognized:true,exists:true,value:0},true],[{recognized:true,exists:true,value:1},false],[{recognized:false,exists:false,value:0},false],[{recognized:true,exists:false,value:0},false],[{recognized:true,exists:true,value:999},false]]){const info=await shader.plan({nvidia:{supported:true,shaderCache:row}});assert.equal(info.needed,needed);assert.equal(info.recommended,needed);}
});
