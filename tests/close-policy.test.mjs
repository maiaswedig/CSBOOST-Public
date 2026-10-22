import test from 'node:test';
import assert from 'node:assert/strict';
import {decideClose} from '../src/free/close-policy.mjs';
test('close policy preserves the window for every outstanding recovery',()=>{
  assert.equal(decideClose().allowed,true);
  for(const state of [{session:{}},{benchmark:{active:true}},{benchmark:{fpsCapRestoration:{pending:true}}},{boost:{pendingRestore:true}},{operation:{active:{name:'applyProfile',status:'indeterminate'}}}])assert.equal(decideClose(state).allowed,false);
  assert.match(decideClose({benchmark:{fpsCapRestoration:{pending:true}}}).reasons.join(' '),/limite FPS/);
  assert.equal(decideClose({boost:{pendingRestore:true,status:'active'}}).allowed,true);
  for(const status of ['applying','restoring','recovery-required'])assert.equal(decideClose({boost:{pendingRestore:true,status}}).allowed,false);
});
