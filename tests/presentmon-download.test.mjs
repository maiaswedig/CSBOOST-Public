import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{preparePresentMon}=require('../tools/prepare-presentmon.cjs');
function pinFor(bytes){return {version:'test-2.3.1',file:'PresentMon-test.exe',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source:'https://github.com/GameTechDev/PresentMon/releases/download/vtest/PresentMon-test.exe'};}
function response(bytes,{ok=true,status=200,url='https://release-assets.githubusercontent.com/PresentMon-test.exe'}={}){return {ok,status,url,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};}

test('downloads PresentMon only after the fixed SHA-256 matches',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csboost-presentmon-')),bytes=Buffer.from('verified fake test asset');t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let calls=0;const result=await preparePresentMon({root,pin:pinFor(bytes),fetchImpl:async()=>{calls++;return response(bytes);}});
  assert.equal(calls,1);assert.equal(result.downloaded,true);assert.equal(result.sha256,pinFor(bytes).sha256);assert.deepEqual(fs.readFileSync(result.path),bytes);
});

test('hash mismatch leaves no downloaded file or vendor directory',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csboost-presentmon-')),pin={...pinFor(Buffer.from('expected')),sha256:'0'.repeat(64)};t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(preparePresentMon({root,pin,fetchImpl:async()=>response(Buffer.from('untrusted'))}),/SHA-256/);
  assert.equal(fs.existsSync(path.join(root,'vendor','presentmon',pin.version)),false);
});

test('an existing verified PresentMon is reused without another network request',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csboost-presentmon-')),bytes=Buffer.from('verified fake test asset'),pin=pinFor(bytes),directory=path.join(root,'vendor','presentmon',pin.version);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,pin.file),bytes);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let calls=0;const result=await preparePresentMon({root,pin,fetchImpl:async()=>{calls++;throw Error('network should not be used');}});
  assert.equal(result.downloaded,false);assert.equal(calls,0);
});

test('a mismatched preexisting binary is not overwritten',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'csboost-presentmon-')),expected=Buffer.from('expected'),actual=Buffer.from('untrusted'),pin=pinFor(expected),directory=path.join(root,'vendor','presentmon',pin.version);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,pin.file),actual);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(preparePresentMon({root,pin,fetchImpl:async()=>response(expected)}),/recusando sobrescrever/);
  assert.deepEqual(fs.readFileSync(path.join(directory,pin.file)),actual);
});
