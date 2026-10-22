import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createOwnedState} from '../src/free/owned-state.mjs';
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-owned-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
test('owned journal retries transient Windows rename locks without deleting its previous state',async t=>{
 const directory=await fixture(t);await createOwnedState(directory).write('state.json',{value:'old'});let calls=0;
 const store=createOwnedState(directory,{wait:async()=>{},rename:async(source,target)=>{calls++;if(calls<3)throw Object.assign(Error('locked'),{code:'EPERM'});return fs.rename(source,target);}});
 await store.write('state.json',{value:'new'});assert.equal(calls,3);assert.deepEqual(await store.read('state.json'),{value:'new'});
});
test('persistent rename failure preserves original state and removes only the temporary file',async t=>{
 const directory=await fixture(t);await createOwnedState(directory).write('state.json',{value:'old'});let calls=0;
 const store=createOwnedState(directory,{wait:async()=>{},rename:async()=>{calls++;throw Object.assign(Error('locked'),{code:'EACCES'});}});
 await assert.rejects(store.write('state.json',{value:'new'}),/locked/);assert.equal(calls,6);assert.deepEqual(await store.read('state.json'),{value:'old'});assert.deepEqual(await fs.readdir(directory),['state.json']);
});
test('an external journal replacement during backoff is preserved instead of retried over',async t=>{
 const directory=await fixture(t),base=createOwnedState(directory);await base.write('state.json',{value:'old'});
 const store=createOwnedState(directory,{rename:async()=>{throw Object.assign(Error('locked'),{code:'EPERM'});},wait:async()=>{await base.write('state.json',{value:'external change'});}});
 await assert.rejects(store.write('state.json',{value:'ours'}),/mudou durante/);assert.deepEqual(await base.read('state.json'),{value:'external change'});
});

