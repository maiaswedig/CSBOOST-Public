import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProcessInventory,limitProcessInventory,PROCESS_INVENTORY_LIMIT,externalGovernorConflict} from '../src/free/process-inventory.mjs';

test('legacy array inventory remains valid below the limit',()=>{
  const rows=Array.from({length:PROCESS_INVENTORY_LIMIT},(_,index)=>({pid:index+1}));
  assert.deepEqual(normalizeProcessInventory(rows),{rows,truncated:false});
});

test('inventory with 300 rows is capped and preserves a preferred CS2 row at the end',()=>{
  const rows=Array.from({length:299},(_,index)=>({pid:index+1,name:'chrome'}));
  const game={pid:300,name:'cs2'};rows.push(game);
  const normalized=normalizeProcessInventory({rows,truncated:false});
  const result=limitProcessInventory(normalized.rows,row=>row.name==='cs2');
  assert.equal(normalized.truncated,true);
  assert.equal(result.rows.length,PROCESS_INVENTORY_LIMIT);
  assert.equal(result.rows.at(-1),game);
  assert.equal(result.truncated,true);
});

test('worker-reported truncation survives when it already returned a bounded list',()=>{
  const rows=Array.from({length:PROCESS_INVENTORY_LIMIT},(_,index)=>({pid:index+1}));
  assert.deepEqual(normalizeProcessInventory({rows,truncated:true}),{rows,truncated:true});
});

test('malformed truncation flags and unbounded payloads fail closed',()=>{
  assert.throws(()=>normalizeProcessInventory({rows:[],truncated:'yes'}),/Sinalização/);
  assert.throws(()=>normalizeProcessInventory(Array(4097).fill({})),/inválida/);
});

test('only confirmed Process Lasso conflict names are accepted and explained',()=>{
  for(const [name,label] of [['ProcessLasso','Process Lasso'],['ProcessGovernor','ProcessGovernor']]){
    const report=externalGovernorConflict(normalizeProcessInventory({rows:[],externalGovernor:true,externalGovernorNames:[name]}));
    assert.ok(report.message.includes(label));assert.match(report.message,/pausou as regras automáticas/);assert.match(report.message,/Não fará novos ajustes/);
  }
  assert.equal(externalGovernorConflict(normalizeProcessInventory({rows:[],externalGovernor:false,externalGovernorNames:[]})),null);
  assert.throws(()=>normalizeProcessInventory({rows:[],externalGovernorNames:['RazerCortexService']}),/gerenciadores externos/);
});
