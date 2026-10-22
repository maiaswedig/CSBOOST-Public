import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const {fingerprint,requireCurrent}=createRequire(import.meta.url)('../tools/verification-evidence.cjs');
test('verification evidence changes with source, test and tool content',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-evidence-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 for(const folder of ['src','tests','tools']){await fs.mkdir(path.join(directory,folder));await fs.writeFile(path.join(directory,folder,'input.txt'),'before');}
 await fs.writeFile(path.join(directory,'package.json'),'{"version":"1.30.0"}');let prior=fingerprint(directory);
 for(const folder of ['src','tests','tools']){await fs.writeFile(path.join(directory,folder,'input.txt'),'after');const next=fingerprint(directory);assert.notEqual(prior,next);prior=next;}
});
test('packaging refuses missing, failed, wrong-kind and stale test evidence',()=>{
 const valid={schema:1,kind:'node-tests',fingerprint:'current',exitCode:0};assert.doesNotThrow(()=>requireCurrent(valid,'current','node-tests'));
 for(const evidence of [null,{...valid,exitCode:1},{...valid,fingerprint:'old'},{...valid,kind:'electron-ui'}])assert.throws(()=>requireCurrent(evidence,'current','node-tests'),/evidence/);
});

