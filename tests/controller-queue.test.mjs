import test from 'node:test';
import assert from 'node:assert/strict';
import {createController} from '../src/free/controller.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const identity={steamId:'76561198000000001'};
const base=()=>({auth:{getSession:async()=>identity,logout:async()=>{}},sessions:{getState:async()=>null}});

test('native diagnostics wait for pending inventory and cannot run during a benchmark',async()=>{
  const pending=deferred(),entered=deferred();let active=false,started=false,reads=0;
  const api=createController({...base(),system:{getSystemInfo:async()=>{reads++;entered.resolve();await pending.promise;return {};},refreshSteam:async()=>{reads++;}},engine:{validatePolicy:async()=>({})},benchmarkRunner:{isActive:()=>active,start:async()=>{active=true;started=true;}}});
  const inventory=api.getSystemInfo();await entered.promise;
  const benchmark=api.startBenchmarkRun({type:'baseline'});await new Promise(resolve=>setImmediate(resolve));assert.equal(started,false);
  pending.resolve();await inventory;await benchmark;
  await assert.rejects(api.refreshSteam(),/benchmark terminar/);assert.equal(reads,1);
});

test('local identity is explicit and switching either Steam mode respects active recovery',async()=>{
  let active=false,pending=false,calls=0,changed=0;
  const auth={getSession:async()=>identity,useLocal:async()=>{calls++;return {...identity,identitySource:'steam-local'};},login:async()=>{calls++;return identity;},logout:async()=>calls++};
  const api=createController({...base(),auth,benchmarkRunner:{isActive:()=>active},boostPlan:{inspect:async()=>({pendingRestore:pending})},onAuthChanged:()=>changed++});
  assert.equal((await api.useLocalSteam()).identitySource,'steam-local');assert.equal(changed,1);
  active=true;await assert.rejects(api.loginSteam(),/benchmark/);await assert.rejects(api.useLocalSteam(),/benchmark/);
  active=false;pending=true;await assert.rejects(api.useLocalSteam(),/Boost/);await assert.rejects(api.logout(),/Boost/);assert.equal(calls,1);
});

test('a timed out native write keeps its lock, exposes uncertainty and refuses logout',async()=>{
  const pending=deferred(),entered=deferred();let restores=0,logouts=0;
  const api=createController({...base(),operationTimeouts:{applyProfile:20},auth:{getSession:async()=>identity,logout:async()=>logouts++},profiles:{read:async()=>({})},system:{applyProfile:async()=>{entered.resolve();return pending.promise;},restoreProfileConfig:async()=>restores++}});
  const applying=api.applyProfile('one');await entered.promise;
  assert.equal((await api.getState()).operation.active.name,'applyProfile');
  await assert.rejects(applying,/Resultado indeterminado/);
  const state=await api.getState();assert.equal(state.operation.active.status,'indeterminate');assert.deepEqual(state.operation,state.recovery.operation);
  await assert.rejects(api.restoreProfileConfig(),/ainda em andamento/);
  await assert.rejects(api.logout(),/indeterminado/);assert.equal(logouts,0);assert.equal(restores,0);
  pending.resolve({applied:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await api.getState()).operation.active,null);
  await api.restoreProfileConfig();assert.equal(restores,1);await api.logout();assert.equal(logouts,1);
});

test('a queued deadline cancels an unstarted writer and logout has a bounded wait',async()=>{
  const pending=deferred(),entered=deferred();let deletes=0,logouts=0;
  const api=createController({...base(),defaultOperationTimeoutMs:500,operationTimeouts:{deleteProfile:20,logout:20},auth:{getSession:async()=>identity,logout:async()=>logouts++},profiles:{read:async()=>({}),remove:async()=>deletes++},system:{applyProfile:async()=>{entered.resolve();return pending.promise;}}});
  const applying=api.applyProfile('one');await entered.promise;
  const deleting=api.deleteProfile('one'),loggingOut=api.logout();
  assert.equal((await api.getState()).operation.queued,2);
  await Promise.all([assert.rejects(deleting,/ação não foi iniciada/),assert.rejects(loggingOut,/ação não foi iniciada/)]);
  assert.equal((await api.getState()).operation.active.status,'running');assert.equal((await api.getState()).operation.queued,0);
  pending.resolve({});await applying;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(deletes,0);assert.equal(logouts,0);
});

test('all five profile writers wait for an application and revalidate authentication',async()=>{
  for(const method of ['saveProfile','deleteProfile','importProfileFile','importGameProfile','importProConfig']){
    const pending=deferred(),entered=deferred();let writes=0,session=identity;
    const api=createController({...base(),auth:{getSession:async()=>session},profiles:{read:async()=>({}),save:async()=>writes++,remove:async()=>writes++},profileTransfer:{importFile:async()=>writes++,importGame:async()=>writes++},proLibrary:{importConfig:async()=>writes++},dialog:{showOpenDialog:async()=>({filePaths:['fixture.cfg']})},system:{applyProfile:async()=>{entered.resolve();return pending.promise;}}});
    const applying=api.applyProfile('one');await entered.promise;
    const writing=api[method]('one');await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0,method);
    session=null;pending.resolve({});await applying;await assert.rejects(writing,/Steam/);assert.equal(writes,0,method);
  }
});

test('deleteProfile runs after applyProfile finishes, preserving the profile during apply',async()=>{
  const pending=deferred(),entered=deferred(),order=[];
  const api=createController({...base(),profiles:{read:async()=>({id:'one'}),remove:async()=>order.push('delete')},system:{applyProfile:async()=>{order.push('apply');entered.resolve();await pending.promise;order.push('applied');}}});
  const applying=api.applyProfile('one');await entered.promise;const deleting=api.deleteProfile('one');pending.resolve();await Promise.all([applying,deleting]);assert.deepEqual(order,['apply','applied','delete']);
});

test('Boost journals are read only for conflicts and each conflicting action checks fresh ownership',async()=>{
  let inspections=0,pendingRestore=false;
  const api=createController({...base(),profiles:{save:async()=>({})},boostPlan:{inspect:async()=>{inspections++;return {pendingRestore,status:'active'};}},optimizations:{restore:async()=>({})}});
  await api.saveProfile({});assert.equal(inspections,0);
  await api.restoreOptimization();pendingRestore=true;
  await assert.rejects(api.restoreOptimization(),/Restaurar Boost/);assert.equal(inspections,2);
});

test('late native rejection is observed and releases quarantine only when settled',async()=>{
  const pending=deferred(),entered=deferred();
  const api=createController({...base(),operationTimeouts:{applyProfile:20},profiles:{read:async()=>({}),save:async()=>({saved:true})},system:{applyProfile:async()=>{entered.resolve();return pending.promise;}}});
  const applying=api.applyProfile('one');await entered.promise;await assert.rejects(applying,/indeterminado/);
  pending.reject(Error('native failure'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await api.getState()).operation.lastSettlement.status,'failed');assert.equal((await api.saveProfile({})).saved,true);
});
