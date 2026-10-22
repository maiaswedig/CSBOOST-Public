import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DEFAULT_SETTINGS,validateSettings,buildLaunchArguments,renderConfig,createProfiles} from '../src/free/profiles.mjs';
import {parseBenchmarkLog,createBenchmarks} from '../src/free/benchmarks.mjs';
import {parseStandings,createContent} from '../src/free/content.mjs';
import {createController} from '../src/free/controller.mjs';
const tmp=async t=>{const d=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-features-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;};

test('all personal config sections serialize only bounded commands and arguments',()=>{
  const s=structuredClone(DEFAULT_SETTINGS);s.binds=[{key:'SPACE',action:'+jump'}];s.launch.console=true;s.video.mode='borderless';
  const normalized=validateSettings(s),text=renderConfig({settings:s});
  assert.equal(normalized.binds[0].key,'space');assert.match(text,/bind "space" "\+jump"/);assert.match(text,/cl_radar_rotate "1"/);assert.match(text,/viewmodel_offset_x "2.5"/);assert.match(text,/hud_scaling "0.9"/);
  assert.deepEqual(buildLaunchArguments(s),['-w','1920','-h','1080','-windowed','-noborder','-console']);
  s.binds=[{key:'mouse4',action:'slot7'},{key:'mouse5',action:'slot8'}];
  const utility=renderConfig({settings:s});assert.match(utility,/bind "mouse4" "slot7"/);assert.match(utility,/bind "mouse5" "slot8"/);
  assert.deepEqual(validateSettings(s).binds,s.binds);
  s.binds[0].action='slot11';assert.throws(()=>validateSettings(s),/Atalho inválido/);
  for(const modify of [x=>x.video.width='1920;exec bad',x=>x.binds[0].action='quit;exec bad',x=>x.binds[0].key='"\nquit',x=>x.binds.push({key:'space',action:'+duck'}),x=>x.radar.scale=0,x=>x.hud.color=99]){const v=structuredClone(s);modify(v);assert.throws(()=>validateSettings(v));}
});
test('VProf parser selects reported results and rejects invalid/no measurements',()=>{
  const result=parseBenchmarkLog('[VProf] Summary of 12000 frames and 120 1-second intervals\n[VProf] FPS: Avg=100.0, P1=70.5');
  assert.equal(result.averageFps,100);assert.equal(result.onePercentLow,70.5);assert.equal(result.frameTimeMs,10);assert.equal(result.durationSeconds,120);
  assert.throws(()=>parseBenchmarkLog('My CPU is fast; 500 FPS'));assert.throws(()=>parseBenchmarkLog('[VProf] FPS: Avg=0, P1=70'));assert.throws(()=>parseBenchmarkLog('[VProf] FPS: Avg=70, P1=100'));
});
test('benchmark history keeps source provenance and exports escaped standalone report',async t=>{
  const root=await tmp(t),file=path.join(root,'console.log');await fs.writeFile(file,'[VProf] FPS: Avg=200.5, P1=110.1');const service=createBenchmarks(path.join(root,'history'));const report=await service.importFile(file);assert.equal((await service.list())[0].averageFps,200.5);assert.equal(report.sourceSHA256.length,64);assert.equal((await service.read(report.id)).onePercentLow,110.1);assert.match(service.renderHtml({...report,sourceName:'<script>bad</script>'}),/&lt;script&gt;/);assert.throws(()=>service.renderHtml(null));await assert.rejects(service.read('../private'));
});
test('official standings parser preserves publication date, ranking and roster',()=>{
  const r=parseStandings('### Standings as of 2026_10_05<br>\n| 1 | 2046 | Spirit | a, b, c | [details](relative) |');assert.equal(r.asOf,'2026-10-05');assert.deepEqual(r.teams[0],{rank:1,points:2046,name:'Spirit',roster:['a','b','c']});assert.throws(()=>parseStandings('No ranking available'));
});
test('public news is cached, degraded explicitly offline and never opens arbitrary schemes',async t=>{
  const root=await tmp(t);let calls=0,now=Date.now(),offline=false;const opened=[];const fetchImpl=async url=>{calls++;assert.match(url,/^https:\/\/api\.steampowered\.com\/ISteamNews/);if(offline)throw Error('Offline');return new Response(JSON.stringify({appnews:{newsitems:[{gid:'1',title:'Update',contents:'<script>unsafe</script><b>Patch</b>',date:1700000000,url:'https://steamcommunity.com/news/1'}]}}),{status:200});};const service=createContent({directory:root,fetchImpl,now:()=>now,openExternal:async u=>opened.push(u)});const first=await service.getNews();assert.equal(first.offline,false);assert.doesNotMatch(first.items[0].summary,/<script>/);await service.getNews();assert.equal(calls,1);now+=3600000;offline=true;const cached=await service.getNews();assert.equal(cached.offline,true);assert.equal(cached.items[0].id,'1');await assert.rejects(service.openArticle('javascript:alert(1)'));await assert.rejects(service.openArticle('https://steamcommunity.com.evil.example/'));await service.openArticle('https://steamcommunity.com/news/1');assert.equal(opened.length,1);
});
test('every private desktop operation requires a genuine auth session and preserves real errors',async t=>{
  const root=await tmp(t),profiles=createProfiles(path.join(root,'profiles'));let session=null,calls=0;const auth={getSession:async()=>session,login:async()=>{session={steamId:'76561198000000000'};return session;},logout:async()=>{session=null;},cancel:()=>{}};const counted=async()=>{calls++;return{};};const api=createController({auth,profiles,system:{getSystemInfo:counted,refreshSteam:counted,launchCS2:counted,getPowerPlans:counted,activatePowerPlan:counted,restorePowerPlan:counted,applyProfile:counted},content:{getNews:counted,getRankings:counted,openArticle:counted},benchmarks:{list:counted},dialog:{},shell:{}});
  for(const name of ['getSystemInfo','refreshSteam','listProfiles','saveProfile','deleteProfile','applyProfile','exportProfile','launchCS2','getPowerPlans','activatePowerPlan','restorePowerPlan','openSteamProfile','openFolder','getNews','getRankings','openArticle','listBenchmarks','importBenchmark','exportBenchmark'])await assert.rejects(api[name](),/Entre com a Steam/);
  assert.equal(calls,0);assert.equal((await api.getState()).session,null);await api.loginSteam();await api.getSystemInfo();assert.equal(calls,1);await assert.rejects(api.applyProfile('../outside'));await api.logout();await assert.rejects(api.getSystemInfo(),/Entre com a Steam/);
});
