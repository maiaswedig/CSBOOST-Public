import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createProfiles,DEFAULT_SETTINGS} from '../src/free/profiles.mjs';
import {createContent} from '../src/free/content.mjs';
import {createController} from '../src/free/controller.mjs';
import {createGameSessions} from '../src/free/sessions.mjs';
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-reliability-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
const article={gid:'1',title:'Update QA',contents:'[p]Valid[/p]',date:1700000000,url:'https://steamcommunity.com/news/1'};
const response=items=>new Response(JSON.stringify({appnews:{newsitems:items}}));
test('background session journal failures remain observable without an unhandled rejection',async t=>{
  const root=await fixture(t),directory=path.join(root,'data'),preserved=path.join(root,'preserved-data');let running=false;const service=createGameSessions({directory,system:{launchCS2:async()=>{}},isGameRunning:async()=>running,pollMs:20});t.after(()=>service.dispose());await service.start({preset:'balanced'});assert.equal(path.dirname(directory),root);assert.equal(path.dirname(preserved),root);await fs.rename(directory,preserved);await fs.writeFile(directory,'QA blocks journal directory');running=true;for(let i=0;i<50&&(await service.getState()).status!=='recovery-required';i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal((await service.getState()).status,'recovery-required');await new Promise(resolve=>setTimeout(resolve,50));assert.match((await service.getState()).error,/registro da sessão/);assert.ok((await fs.stat(path.join(preserved,'game-session.json'))).isFile());
});
test('one damaged or non-regular profile cannot hide healthy profiles or overwrite originals',async t=>{
  const directory=await fixture(t),profiles=createProfiles(directory),good=await profiles.save({name:'Valid profile',settings:structuredClone(DEFAULT_SETTINGS)}),bad=crypto.randomUUID(),folder=crypto.randomUUID();
  await fs.writeFile(path.join(directory,bad+'.json'),'null');await fs.mkdir(path.join(directory,folder+'.json'));
  assert.deepEqual((await profiles.list()).map(item=>item.id),[good.id]);const health=profiles.getHealth();assert.equal(health.invalidCount,2);assert.equal(health.originalFilesPreserved,true);health.issues[0].reason='modified copy';assert.notEqual(profiles.getHealth().issues[0].reason,'modified copy');
  await assert.rejects(profiles.save({id:bad,name:'Replacement',settings:structuredClone(DEFAULT_SETTINGS)}));assert.equal(await fs.readFile(path.join(directory,bad+'.json'),'utf8'),'null');
  await fs.unlink(path.join(directory,bad+'.json'));await fs.rmdir(path.join(directory,folder+'.json'));await profiles.list();assert.equal(profiles.getHealth().invalidCount,0);
});
for(const name of ['null','wrong shape','invalid row','future timestamp'])test('invalid '+name+' public cache is never returned to the renderer when offline',async t=>{
  const directory=await fixture(t),now=Date.now();const rows={null:null,'wrong shape':{formatVersion:2,loadedAt:new Date(now).toISOString(),items:null},'invalid row':{formatVersion:2,source:'Steam / Valve',loadedAt:new Date(now).toISOString(),items:[null]},'future timestamp':{formatVersion:2,source:'Steam / Valve',loadedAt:new Date(now+86400000).toISOString(),items:[]}};
  await fs.writeFile(path.join(directory,'news.json'),JSON.stringify(rows[name]));const service=createContent({directory,now:()=>now,fetchImpl:async()=>{throw Error('Offline QA');}});await assert.rejects(service.getNews(),/Offline QA/);
});
test('malformed individual Steam articles do not discard the valid articles',async t=>{
  const directory=await fixture(t),service=createContent({directory,fetchImpl:async()=>response([null,{...article,date:1e100},{...article,url:'javascript:bad'},article])});const result=await service.getNews();assert.equal(result.items.length,1);assert.equal(result.items[0].id,'1');assert.equal(result.offline,false);
});
test('online content remains usable when its cache cannot be written',async t=>{
  const directory=await fixture(t);await fs.mkdir(path.join(directory,'news.json'));const service=createContent({directory,fetchImpl:async()=>response([article])}),result=await service.getNews();assert.equal(result.items.length,1);assert.equal(result.offline,false);assert.match(result.cacheWarning,/não foi possível guardar/);assert.equal((await fs.stat(path.join(directory,'news.json'))).isDirectory(),true);
});
test('oversized public cache is ignored and replaced with a bounded valid response',async t=>{
  const directory=await fixture(t);await fs.writeFile(path.join(directory,'news.json'),' '.repeat(5*1024*1024+1));let calls=0;const service=createContent({directory,fetchImpl:async()=>{calls++;return response([article]);}});assert.equal((await service.getNews()).items.length,1);assert.equal(calls,1);assert.ok((await fs.stat(path.join(directory,'news.json'))).size<10000);
});
test('monitor recovery remains accessible after local Steam identity is lost',async()=>{
  let checked=0,exits=0;const controller=createController({auth:{getSession:async()=>null},monitor:{status:()=>({running:false,failed:'EPIPE'})},recoveryGuard:{ensureAvailable(){checked++;}},recoveryExit:async()=>{exits++;return {canceled:true};}});
  assert.deepEqual(await controller.recoverAndQuit(),{canceled:true});assert.equal(checked,1);assert.equal(exits,1);await assert.rejects(controller.listProfiles(),/Steam/);
});
test('recovery cannot exit a healthy monitor or bypass a missing recovery guard',async()=>{
  let exits=0;const recoveryExit=async()=>{exits++;};const healthy=createController({monitor:{status:()=>({running:true,failed:null})},recoveryExit});await assert.rejects(healthy.recoverAndQuit(),/não necessária/);
  const missing=createController({monitor:{status:()=>({running:false,failed:'EPIPE'})},recoveryGuard:{ensureAvailable(){throw Error('Recovery unavailable');}},recoveryExit});await assert.rejects(missing.recoverAndQuit(),/Recovery unavailable/);assert.equal(exits,0);
});
