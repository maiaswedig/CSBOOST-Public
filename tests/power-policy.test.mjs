import test from 'node:test';
import assert from 'node:assert/strict';
import {decidePowerPlan,powerPolicyContext,readPowerPolicy,HIGH_PERFORMANCE_PLAN} from '../src/free/power-policy.mjs';

test('all 486 route/source/form/X3D/plan/override combinations use a route-independent decision',()=>{
  let combinations=0;
  for(const powerSource of ['ac','battery','unknown'])for(const formFactor of ['laptop','desktop','unknown'])for(const x3d of ['yes','no','unknown'])for(const highPerformancePlanExists of [true,false])for(const userOverride of [null,'force-high','force-keep']){
    const expected=!highPerformancePlanExists?{allow:false,reason:'plan-missing'}:userOverride!==null?{allow:userOverride==='force-high',reason:'user-override'}:powerSource!=='ac'?{allow:false,reason:'power-not-confirmed'}:x3d!=='no'?{allow:false,reason:'x3d-or-unknown'}:formFactor==='laptop'?{allow:false,reason:'laptop-default-keep'}:{allow:true,reason:'eligible'};
    let previous;
    for(const route of ['boost','session','benchmark']){const ctx={route,powerSource,formFactor,x3d,highPerformancePlanExists,userOverride},actual=decidePowerPlan(ctx),description=JSON.stringify(ctx);combinations++;assert.equal(actual.allowHighPerformance,expected.allow,description);assert.equal(actual.reason,expected.reason,description);assert.ok(['known','unknown'].includes(actual.confidence));const {route:origin,...decision}=actual;assert.equal(origin,route);if(previous)assert.deepEqual(decision,previous);previous=decision;if(!highPerformancePlanExists)assert.equal(actual.allowHighPerformance,false);}
  }
  assert.equal(combinations,486);
});
test('policy input validation rejects unknown controls instead of coercing them',()=>{
  const ctx={route:'boost',powerSource:'ac',formFactor:'desktop',x3d:'no',highPerformancePlanExists:true,userOverride:null};
  for(const patch of [{route:'shell'},{powerSource:false},{formFactor:'tablet'},{x3d:false},{highPerformancePlanExists:'yes'},{userOverride:true}])assert.throws(()=>decidePowerPlan({...ctx,...patch}),/inválido/);
});
test('real firmware/hardware shapes keep unknown power and missing model unknown',()=>{
  const build=(powerContext,hardware)=>powerPolicyContext({route:'boost',powerContext,hardware,highPerformancePlanExists:true});
  assert.deepEqual(build({onBattery:false,hasBattery:false},{cpu:'Intel Core i7'}),{route:'boost',powerSource:'ac',formFactor:'desktop',x3d:'no',highPerformancePlanExists:true,userOverride:null});
  assert.equal(build({onBattery:true,hasBattery:true},{cpu:'Ryzen 9 X3D'}).x3d,'yes');
  for(const cpu of [undefined,'','Unknown CPU','CPU não identificada'])assert.equal(build({onBattery:null},{cpu}).x3d,'unknown');
  assert.equal(build({onBattery:null},{cpu:'Ryzen 7 7700X'}).powerSource,'unknown');
  assert.equal(build({onBattery:false,hasBattery:true},{cpu:'Intel Core i7'}).formFactor,'laptop');
  assert.equal(build({onBattery:false},{cpu:'Ryzen 7 7700X',x3d:'unknown'}).x3d,'unknown');
});
test('missing inventory never becomes non-X3D or confirmed AC',async()=>{
  const result=await readPowerPolicy({route:'session',system:{getPowerContext:async()=>{throw Error('Denied');},getSystemInfo:async()=>{throw Error('Denied');}},plans:{plans:[{guid:HIGH_PERFORMANCE_PLAN}]}});
  assert.equal(result.context.powerSource,'unknown');assert.equal(result.context.x3d,'unknown');assert.equal(result.decision.allowHighPerformance,false);assert.equal(result.decision.confidence,'unknown');
});
test('topologia X3D positiva reforça a política de energia; topologia desconhecida nunca inventa evidência',async()=>{
  const system={getPowerContext:async()=>({onBattery:false,hasBattery:false}),getSystemInfo:async()=>({cpu:'Ryzen 7 7700X'})},plans={plans:[{guid:HIGH_PERFORMANCE_PLAN}]};
  const confirmed=await readPowerPolicy({route:'session',system,plans,getCpuTopology:async()=>({x3d:'yes'})});assert.equal(confirmed.context.x3d,'yes');assert.equal(confirmed.decision.reason,'x3d-or-unknown');assert.equal(confirmed.decision.allowHighPerformance,false);
  const unavailable=await readPowerPolicy({route:'session',system:{...system,getSystemInfo:async()=>({cpu:'Ryzen 7 7700X',x3d:'unknown'})},plans,getCpuTopology:async()=>({x3d:'unknown'})});assert.equal(unavailable.context.x3d,'unknown');
  const unidentified=powerPolicyContext({route:'boost',powerContext:{onBattery:false,hasBattery:false},hardware:{cpu:'Unknown CPU',x3d:'unknown'},topology:{x3d:'unknown'},highPerformancePlanExists:true});assert.equal(unidentified.x3d,'unknown');
  const positive=powerPolicyContext({route:'boost',powerContext:{onBattery:false,hasBattery:false},hardware:{cpu:'Unknown CPU',x3d:'no'},topology:{x3d:'yes'},highPerformancePlanExists:true});assert.equal(positive.x3d,'yes');
});
