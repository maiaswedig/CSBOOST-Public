import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBootTimerOptions,readBootTimerOptions} from '../src/free/boot-timer-diagnostics.mjs';

const entry='Windows Boot Loader\nidentifier              {current}\npath                    \\Windows\\system32\\winload.efi\n';

test('timer parser distinguishes forced debug settings from Windows defaults',()=>{
  const parsed=parseBootTimerOptions(entry+'useplatformclock        Yes\ndisabledynamictick       No\n');
  assert.deepEqual(parsed.options,{useplatformclock:true,useplatformtick:null,disabledynamictick:false});
  assert.deepEqual(parsed.forced,['useplatformclock']);
  const defaults=parseBootTimerOptions(entry);
  assert.equal(defaults.available,true);assert.deepEqual(defaults.forced,[]);
});

test('timer parser refuses unconfirmed, duplicate, malformed, or oversized output',()=>{
  assert.equal(parseBootTimerOptions('Access is denied').available,false);
  assert.equal(parseBootTimerOptions(entry+'useplatformclock Yes\nuseplatformclock No\n').available,false);
  assert.equal(parseBootTimerOptions(entry+'useplatformclock Maybe\n').available,false);
  assert.equal(parseBootTimerOptions(entry+'x'.repeat(256*1024)).available,false);
});

test('timer reader invokes only the fixed read-only current-entry command',async()=>{
  let call;
  const result=await readBootTimerOptions({platform:'win32',env:{SystemRoot:'C:\\Windows'},run:async(...args)=>{call=args;return {stdout:entry+'useplatformtick Sim\n'};}});
  assert.equal(call[0],'C:\\Windows\\System32\\bcdedit.exe');assert.deepEqual(call[1],['/enum','{current}']);assert.equal(call[2].shell,false);
  assert.equal(result.options.useplatformtick,true);
});

test('timer reader reports unsupported platforms and malformed Windows roots as unavailable',async()=>{
  assert.equal((await readBootTimerOptions({platform:'linux'})).available,false);
  assert.equal((await readBootTimerOptions({platform:'win32',env:{SystemRoot:'C:\\Windows\\..\\Outside'},run:async()=>{throw Error('must not run');}})).available,false);
});
