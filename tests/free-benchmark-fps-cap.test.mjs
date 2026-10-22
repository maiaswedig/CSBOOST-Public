import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createBenchmarkFpsCap,parseBenchmarkFpsCap} from '../src/free/benchmark-fps-cap.mjs';

const id='11111111-2222-4333-8444-555555555555';
const original='// development fixture\r\n"config"\r\n{\r\n\t"convars"\r\n\t{\r\n\t\t"fps_max"\t"400.000000" // preserve this comment\r\n\t\t"unrelated"\t"original"\r\n\t}\r\n}\r\n';
async function fixture(t,overrides={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-fps-fixture-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const steamPath=path.join(root,'steam'),folder=path.join(steamPath,'userdata','1','730','local','cfg'),target=path.join(folder,'cs2_machine_convars.vcfg'),directory=path.join(root,'own-data'),journal=path.join(directory,'benchmark-fps-cap.json');
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(target,original);
  let running=false,active='1',installation={cs2Installed:true,steamPath};
  const system={refreshSteam:async()=>installation,isGameRunning:async()=>running};
  const options={directory,system,getSteamId:async()=>'76561197960265729',readActiveAccount:async()=>active,...overrides};
  return {root,steamPath,target,directory,journal,system,options,module:createBenchmarkFpsCap(options),setRunning:value=>{running=value;},setActive:value=>{active=value;},setInstallation:value=>{installation=value;}};
}

test('fps cap parser returns exact quoted token span and rejects ambiguous structures',()=>{
  const parsed=parseBenchmarkFpsCap(original);assert.equal(parsed.value,'400.000000');assert.equal(original.slice(parsed.start,parsed.end),'"400.000000"');
  for(const text of [original.replace('"fps_max"','"wrong_key"'),original.replace('"400.000000"','"NaN"'),original.replace('"400.000000"','"100001"'),original.replace('"unrelated"','"FPS_MAX"'),original+'"config" {}',original.replace('"400.000000"','{ "nested" "0" }')])assert.throws(()=>parseBenchmarkFpsCap(text));
  assert.equal(parseBenchmarkFpsCap(original.replace('400.000000','0')).value,'0');
});

test('capture binds to the authenticated active Steam account and leaves convars unchanged',async t=>{
  const f=await fixture(t);const preview=await f.module.inspect();assert.equal(preview.previous,'400.000000');assert.equal(preview.pending,false);
  const captured=await f.module.capture({id});assert.equal(captured.captured,true);assert.equal(captured.previous,'400.000000');assert.equal(await fs.readFile(f.target,'utf8'),original);
  const journal=JSON.parse(await fs.readFile(f.journal,'utf8'));assert.equal(journal.account,'1');assert.equal(journal.id,id);assert.equal(Buffer.from(journal.before,'base64').toString(),original);
  assert.equal((await f.module.inspect()).pending,true);await assert.rejects(f.module.capture({id}),/anterior aguardando/);
});

test('different active account, stopped Steam, invalid identity or running CS2 reject before journaling',async t=>{
  for(const kind of ['different','steam-off','invalid-id','running']){
    const f=await fixture(t,kind==='invalid-id'?{getSteamId:async()=>'../another'}:{});
    if(kind==='different')f.setActive('2');if(kind==='steam-off')f.setActive('0');if(kind==='running')f.setRunning(true);
    await assert.rejects(f.module.capture({id}));await assert.rejects(fs.stat(f.journal),{code:'ENOENT'});assert.equal(await fs.readFile(f.target,'utf8'),original);
  }
});

test('restoration waits for game exit then replaces only fps_max and preserves every other byte',async t=>{
  const f=await fixture(t);await f.module.capture({id});
  const during=original.replace('400.000000','0').replace('"original"','"modified by game"');await fs.writeFile(f.target,during);f.setRunning(true);
  assert.equal((await f.module.restore({id})).pending,true);assert.equal(await fs.readFile(f.target,'utf8'),during);
  f.setRunning(false);const restored=await f.module.restore({id});assert.deepEqual(restored,{restored:true,changed:true,previous:'400.000000'});
  assert.equal(await fs.readFile(f.target,'utf8'),original.replace('"original"','"modified by game"'));await assert.rejects(fs.stat(f.journal),{code:'ENOENT'});
});

test('restore-only helper does not require a login getter and is idempotent',async t=>{
  const f=await fixture(t);await f.module.capture({id});await fs.writeFile(f.target,original.replace('400.000000','0'));
  const helper=createBenchmarkFpsCap({directory:f.directory,system:f.system});assert.equal((await helper.restore({id})).restored,true);
  assert.deepEqual(await helper.restore({id}),{restored:false,pending:false});
});

test('unchanged or numerically identical cap drops only its own backup without replacing the convars file',async t=>{
  const f=await fixture(t);await f.module.capture({id});const normalized=original.replace('400.000000','400');await fs.writeFile(f.target,normalized);
  assert.deepEqual(await f.module.restore({id}),{restored:true,changed:false,previous:'400.000000'});assert.equal(await fs.readFile(f.target,'utf8'),normalized);
});

test('externally chosen nonzero cap is preserved with durable recovery backup',async t=>{
  const f=await fixture(t);await f.module.capture({id});const changed=original.replace('400.000000','333');await fs.writeFile(f.target,changed);
  await assert.rejects(f.module.restore({id}),/alterado fora do benchmark/);assert.equal(await fs.readFile(f.target,'utf8'),changed);await fs.stat(f.journal);
  await fs.writeFile(f.target,original);assert.equal((await f.module.restore({id})).changed,false);
});

test('another run UUID or Steam installation cannot consume the saved cap',async t=>{
  const f=await fixture(t);await f.module.capture({id});await fs.writeFile(f.target,original.replace('400.000000','0'));
  await assert.rejects(f.module.restore({id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'}),/outra execução/);await fs.stat(f.journal);
  const replacement=path.join(f.root,'new-steam');await fs.mkdir(replacement);f.setInstallation({cs2Installed:true,steamPath:replacement});
  await assert.rejects(f.module.restore({id}),/instalação da Steam mudou/);assert.equal(parseBenchmarkFpsCap(await fs.readFile(f.target,'utf8')).value,'0');await fs.stat(f.journal);
});

test('concurrent convars edits during restore are detected before replacement',async t=>{
  const f=await fixture(t);await f.module.capture({id});await fs.writeFile(f.target,original.replace('400.000000','0'));
  let calls=0;f.system.isGameRunning=async()=>{if(++calls===2)await fs.writeFile(f.target,original.replace('400.000000','300'));return false;};
  await assert.rejects(f.module.restore({id}),/mudaram durante a restauração/);assert.equal(parseBenchmarkFpsCap(await fs.readFile(f.target,'utf8')).value,'300');await fs.stat(f.journal);
});

test('corrupted backup and malformed current convars retain both current file and backup',async t=>{
  const f=await fixture(t);await f.module.capture({id});const record=await fs.readFile(f.journal,'utf8');await fs.writeFile(f.journal,record.replace('400.000000','NaN'));
  await assert.rejects(f.module.restore({id}),/inconsistente/);assert.equal(await fs.readFile(f.target,'utf8'),original);
  await fs.writeFile(f.journal,record);await fs.writeFile(f.target,'not a convars file');await assert.rejects(f.module.restore({id}));await fs.stat(f.journal);assert.equal(await fs.readFile(f.target,'utf8'),'not a convars file');
});
