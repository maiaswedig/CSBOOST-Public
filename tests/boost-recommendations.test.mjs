import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendFromBottleneck} from '../src/free/boost-recommendations.mjs';

const hardware={cpu:'AMD Ryzen 7 7700X',gpu:'NVIDIA GeForce RTX 4070'};
const latest=(kind,patch={})=>({diagnosis:{class:kind,confidence:'medium',reasons:['fixture reason'],...patch},benchmark:{importedAt:'2026-10-20T10:00:00.000Z',hardware,context:{hardware}}});
const items=[{id:'video',status:'needed',selectable:true,recommended:true,selected:true},{id:'nvidia',status:'needed',selectable:true,recommended:true,selected:true},{id:'power',status:'needed',selectable:true,recommended:true,selected:true}];

test('GPU-bound advice points to video and NVIDIA and avoids CPU governor',()=>{
  const result=recommendFromBottleneck({latest:latest('gpu-bound'),hardware,items});
  assert.equal(result.status,'available');assert.deepEqual(result.prioritize.map(row=>row.boosterId),['video','nvidia']);
  assert.ok(result.avoid.some(value=>value.includes('governador de CPU')));assert.match(result.notice,/não alteram a seleção/);
});

test('GPU advice does not recommend NVIDIA profile on another vendor',()=>{
  const amd={...hardware,gpu:'AMD Radeon RX 7900 XTX'},sample=latest('gpu-bound');sample.benchmark.hardware=amd;sample.benchmark.context.hardware=amd;
  const result=recommendFromBottleneck({latest:sample,hardware:amd,items});
  assert.deepEqual(result.prioritize.map(row=>row.boosterId),['video']);assert.match(result.notice,/não se aplica/);
});

test('CPU-bound guidance preserves video quality and requires confirmed non-X3D before energy advice',()=>{
  const unknown=recommendFromBottleneck({latest:latest('cpu-bound'),hardware,topology:{x3d:'unknown'},items});
  assert.ok(!unknown.prioritize.some(row=>row.boosterId==='power'));assert.ok(unknown.prioritize.some(row=>row.title.includes('topologia')));assert.ok(unknown.avoid.some(value=>value.includes('qualidade de vídeo')));
  const confirmed=recommendFromBottleneck({latest:latest('cpu-bound'),hardware,topology:{x3d:'no'},items});
  assert.ok(confirmed.prioritize.some(row=>row.boosterId==='power'));assert.ok(confirmed.prioritize.some(row=>row.title.includes('XMP/EXPO')));
});

test('cap, thermal and unknown findings recommend only their safe informational paths',()=>{
  const cap=recommendFromBottleneck({latest:latest('cap-limited'),hardware,items});assert.ok(cap.prioritize.some(row=>row.title.includes('limite de FPS')));assert.deepEqual(cap.avoid,['Não alterar qualidade de vídeo por causa deste resultado.']);
  const thermal=recommendFromBottleneck({latest:latest('thermal-or-power'),hardware,items});assert.equal(thermal.title,'Aviso do diagnóstico');assert.equal(thermal.prioritize.length,1);assert.match(thermal.prioritize[0].detail,/não é um booster/);assert.ok(thermal.avoid.some(value=>value.includes('clock')));
  const unknown=recommendFromBottleneck({latest:latest('unknown'),hardware,items});assert.equal(unknown.prioritize.length,1);assert.deepEqual(unknown.avoid,['Evitar ajustes de risco ou mudanças de qualidade guiadas por esta medição.']);
});

test('missing or mismatched machine evidence cannot produce a tailored recommendation',()=>{
  assert.equal(recommendFromBottleneck({hardware}).status,'none');
  const mismatch=recommendFromBottleneck({latest:latest('gpu-bound'),hardware:{...hardware,cpu:'Intel Core i7'}});
  assert.equal(mismatch.status,'stale');assert.equal(mismatch.prioritize.length,0);assert.match(mismatch.notice,/nenhuma recomendação foi usada/);
  const missing=recommendFromBottleneck({latest:latest('cpu-bound'),hardware:{cpu:'Não identificado',gpu:'GPU'},items});
  assert.equal(missing.status,'unavailable');assert.equal(missing.prioritize.length,0);
});
