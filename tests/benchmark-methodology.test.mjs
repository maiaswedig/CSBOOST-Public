import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBenchmarkRuns,createBenchmarks} from '../src/free/benchmarks.mjs';

const rows=(values,prefix,p1=values.map(value=>value/2))=>values.map((averageFps,index)=>({id:prefix+index,averageFps,onePercentLow:p1[index],sourceSHA256:prefix+index,sourceName:prefix+index+'.log'}));

test('five selected runs expose median, linear-interpolation IQR and MAD for both metrics',()=>{
  const result=compareBenchmarkRuns(rows([100,110,120,130,500],'before'),rows([140,150,160,170,180],'after'));
  assert.equal(result.before.averageFps,120);
  assert.deepEqual(result.before.dispersion.averageFps,{minimum:100,maximum:500,q1:110,q3:130,iqr:20,mad:10});
  assert.equal(result.before.dispersion.onePercentLow.iqr,10);
  assert.equal(result.before.dispersion.onePercentLow.mad,5);
  assert.equal(result.averageFps.observedRangesOverlap,true);
  assert.match(result.averageFps.conclusion,/inconclusiva.*sobrepostas/);
  assert.ok(result.averageFps.percentRange.minimum<0);
  assert.ok(result.averageFps.percentRange.maximum>0);
  assert.ok(result.warnings.some(value=>value.includes('próprio aplicativo')));
});

test('ranges that merely touch remain inconclusive; separated ranges do not infer significance',()=>{
  const touching=compareBenchmarkRuns(rows([100,110],'a'),rows([110,120],'b'));
  assert.equal(touching.averageFps.observedRangesOverlap,true);
  const separate=compareBenchmarkRuns(rows([100,110],'a'),rows([130,140],'b'));
  assert.equal(separate.averageFps.observedRangesOverlap,false);
  assert.match(separate.averageFps.conclusion,/não estabelece significância/);
  assert.ok(Math.abs(separate.averageFps.percentRange.minimum-(130/110-1)*100)<1e-10);
  assert.match(separate.method,/IQR e MAD/);
});

test('one-run groups warn about artificial zero dispersion and zero-P1 percentages remain unavailable',()=>{
  const result=compareBenchmarkRuns(rows([100],'a',[0]),rows([100],'b',[10]));
  assert.equal(result.before.dispersion.averageFps.iqr,0);
  assert.ok(result.warnings.some(value=>value.includes('não comprova repetibilidade')));
  assert.match(result.method,/Uma medição Antes e uma Depois/);
  assert.match(result.averageFps.conclusion,/não permite avaliar repetibilidade/);
  assert.equal(result.onePercentLow.percent,null);
  assert.equal(result.onePercentLow.percentRange,null);
  assert.equal(result.averageFps.observedRangesOverlap,true);
});

test('HTML places observed ranges and dispersion beside percentage changes and explains overlap',()=>{
  const result=compareBenchmarkRuns(rows([100,110,120,130,140],'a'),rows([120,130,140,150,160],'b'));
  const html=createBenchmarks('unused-fixture').renderComparisonHtml(result);
  assert.match(html,/Faixa: 100\.0–140\.0 FPS/);
  assert.match(html,/IQR 20\.0 · MAD 10\.0/);
  assert.match(html,/Faixa descritiva:/);
  assert.match(html,/inconclusiva: faixas observadas sobrepostas/);
  assert.match(html,/não intervalos de confiança/);
  assert.match(html,/próprio aplicativo/);
});
test('single-run export shows signed gains and losses without artificial variation statistics',()=>{
  const comparison=compareBenchmarkRuns(rows([100],'a',[50]),rows([120],'b',[40]));
  const html=createBenchmarks('unused-fixture').renderComparisonHtml(comparison);
  assert.match(html,/\+20\.0%/);assert.match(html,/-20\.0%/);assert.match(comparison.onePercentLow.conclusion,/não permite avaliar repetibilidade/);assert.doesNotMatch(html,/IQR 0\.0/);assert.doesNotMatch(html,/Faixa descritiva:/);
});
