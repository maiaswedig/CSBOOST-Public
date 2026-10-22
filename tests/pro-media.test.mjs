import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProMedia,mediaRequest} from '../src/free/pro-media.mjs';
import {parseProPlayer,parseProTeams,publicImageUrl,teamKey,findPublicPlayer,publicPlayerAliases} from '../src/free/pro-source.mjs';
import {createProLibrary} from '../src/free/pro-library.mjs';
import {createProfiles} from '../src/free/profiles.mjs';
import {playerHtml} from './fixtures/pro-publication.mjs';
import {sanitizeTeamSvg} from '../src/free/team-svg.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const image='https://prosettings.net/wp-content/uploads/qa.png';
const teamsHtml=()=>'<section><div class="js-team-card" data-games="468,479" data-name="Team QA"><a href="https://prosettings.net/teams/team-qa/">Team QA</a><img src="'+image+'"></div></section>';
async function fixture(t,options={}){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-media-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const state={calls:0,decodes:0,busy:false,fail:false,time:Date.now()};const args={directory,now:()=>state.time,isBusy:()=>state.busy,resolve:async()=>({url:image,sourceUrl:'https://prosettings.net/players/qa/',label:'QA'}),decodeImage:async()=>{state.decodes++;return png;},fetchImpl:async(_url,options)=>{state.calls++;assert.equal(options.redirect,'error');assert.ok(options.signal);if(state.fail)throw Error('Offline');return new Response(png,{headers:{'content-type':'image/png'}});},...options};return {directory,state,args,media:createProMedia(args)};}
test('image references are confined to raster uploads and identities never accept URLs',()=>{
  for(const value of ['https://evil.test/x.png','https://prosettings.net@evil.test/x.png','http://prosettings.net/wp-content/uploads/x.png','https://prosettings.net/wp-content/uploads/x.svg','https://prosettings.net/wp-content/uploads/../x.png',image+'?x=1','data:image/png;base64,abc'])assert.equal(publicImageUrl(value),null);
  assert.equal(publicImageUrl(image),image);for(const value of [{kind:'player',id:'../qa'},{kind:'team',name:'QA',url:image},{kind:'player',id:'qa',kind2:'team'},null,[],{kind:'team',name:''}])assert.throws(()=>mediaRequest(value));
});
test('public portrait is taken from the player avatar, not a sponsor, flag or comment',()=>{
  const plain=playerHtml().replace(/<section class="avatar">[\s\S]*?<\/section>/,'');const h=plain.replace('<h1>','<img src="https://prosettings.net/wp-content/uploads/sponsor.png"><h1>').replace('<div id="cs2-settings">','<section class="avatar"><img src="'+image+'"></section><div id="cs2-settings">');assert.equal(parseProPlayer(h,'qa').portrait,image);assert.equal(parseProPlayer(plain,'qa').portrait,null);
});
test('public CS2 teams only and unique exact player identity preserve punctuation',()=>{
  const teams=parseProTeams(teamsHtml());assert.equal(teams[0].logo,image);assert.equal(teamKey('Team Spirit'),teamKey('Spirit'));assert.equal(teamKey('G2 Esports'),teamKey('G2'));assert.throws(()=>parseProTeams(teamsHtml().replace('468,479','479')));
  const player={id:'correct-slug',name:'huNter-'};assert.equal(findPublicPlayer([player],'HUNTER-'),player);assert.equal(findPublicPlayer([player],'hunter'),null);assert.equal(findPublicPlayer([player,{...player,id:'other'}],'hunter-'),null);
});
test('image fetch deduplicates, decodes, persists and works offline after reopening',async t=>{
  const {state,args,media}=await fixture(t),request={kind:'player',id:'qa'};const [a,b]=await Promise.all([media.get(request),media.get(request)]);assert.deepEqual(a,b);assert.equal(a.available,true);assert.equal(state.calls,1);assert.equal(state.decodes,1);
  state.fail=true;const reopened=createProMedia(args);assert.equal((await reopened.get(request)).dataUrl,a.dataUrl);assert.equal(state.calls,1);state.time+=8*86400000;const stale=await createProMedia(args).get(request);assert.equal(stale.available,true);assert.equal(stale.offline,true);
});
test('active benchmarks defer fetch and decode; unsupported media keeps a fallback',async t=>{
  const {state,media}=await fixture(t);state.busy=true;assert.equal((await media.get({kind:'team',name:'QA'})).deferred,true);assert.equal(state.calls,0);assert.equal(state.decodes,0);state.busy=false;
  const bad=createProMedia((await fixture(t,{resolve:async()=>({url:'https://evil.test/x.png'})})).args);assert.equal((await bad.get({kind:'team',name:'QA'})).available,false);
});
test('SVG, wrong magic, oversized streams and invalid decoded output never reach the renderer',async t=>{
  for(const [body,type,decode] of [['<svg/>','image/svg+xml',png],['<html/>','image/png',png],[Buffer.alloc(1024*1024+1),'image/png',png],[png,'image/png',Buffer.from('<svg/>')]]){
    const {media}=await fixture(t,{fetchImpl:async()=>new Response(body,{headers:{'content-type':type}}),decodeImage:async()=>decode});assert.equal((await media.get({kind:'player',id:'qa'})).available,false);
  }
});
test('public team resolution refuses ambiguous normalized team names',async t=>{
  const {directory}=await fixture(t);const profiles=createProfiles(path.join(directory,'profiles'));const lib=createProLibrary({directory:path.join(directory,'library'),profiles,fetchImpl:async()=>new Response(teamsHtml().replace('</section>','<div class="js-team-card" data-games="468" data-name="QA"><a href="https://prosettings.net/teams/other-qa/">QA</a><img src="'+image+'"></div></section>'),{headers:{'content-type':'text/html'}})});assert.equal((await lib.media({kind:'team',name:'QA'})).url,null);await assert.rejects(()=>lib.media({kind:'team',name:'QA',url:image}));
});
test('corrupt cached image is discarded and rewritten from valid bytes',async t=>{
  const {directory,args,media,state}=await fixture(t),request={kind:'player',id:'qa'};await media.get(request);const file=(await fs.readdir(directory)).find(name=>name.endsWith('.json'));await fs.writeFile(path.join(directory,file),'{}');assert.equal((await createProMedia(args).get(request)).available,true);assert.equal(state.calls,2);
});
test('image CDN MIME negotiation does not reject valid raster bytes',async t=>{
  const {media,state}=await fixture(t,{fetchImpl:async()=>new Response(png,{headers:{'content-type':'image/webp'}})});assert.equal((await media.get({kind:'player',id:'qa'})).available,true);assert.equal(state.decodes,1);
});
test('team SVG is rebuilt into geometry with class colors and remains idempotent',()=>{
  const source='<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="800px"><style>.st0{fill:#E9493E;}</style><g><polygon class="st0" points="20.2,17.5 21.9,22.7 27.5,22.7"/></g></svg>';
  const clean=sanitizeTeamSvg(source);assert.match(clean,/fill="#E9493E"/);assert.doesNotMatch(clean,/class|style|xml version/);assert.equal(sanitizeTeamSvg(clean),clean);
  for(const bad of ['<script>evil()</script>','<image href="https://evil.test/1.png"/>','<foreignObject><div>evil</div></foreignObject>','<path onclick="evil()" d="M0 0"/>','<path fill="url(https://evil.test/x)" d="M0 0"/>','<use href="#x"/>'])assert.throws(()=>sanitizeTeamSvg('<svg viewBox="0 0 40 40">'+bad+'</svg>'));
  assert.throws(()=>sanitizeTeamSvg('<!DOCTYPE svg><svg viewBox="0 0 1 1"></svg>'));assert.throws(()=>sanitizeTeamSvg('<svg viewBox="0 0 1 1"><g></svg>'));
});
test('sanitized team SVG reaches only an image data URL and is rejected for portraits',async t=>{
  const source='<svg viewBox="0 0 40 40"><path fill="#eee" d="M0 0 L40 40"/></svg>',args={resolve:async()=>({url:image.replace('.png','.svg'),sourceUrl:'https://prosettings.net/teams/qa/',label:'QA'}),fetchImpl:async()=>new Response(source,{headers:{'content-type':'image/svg+xml'}})};
  const {media,state}=await fixture(t,args);const logo=await media.get({kind:'team',name:'QA'});assert.equal(logo.available,true);assert.match(logo.dataUrl,/^data:image\/svg\+xml;base64,/);assert.equal(state.decodes,0);assert.equal((await media.get({kind:'player',id:'qa'})).available,false);
});
test('WebP remains bounded and static before using Chromium image decoding',async t=>{
  const webp=Buffer.alloc(32);webp.write('RIFF');webp.writeUInt32LE(24,4);webp.write('WEBPVP8X',8);webp.writeUInt32LE(10,16);webp.writeUIntLE(119,24,3);webp.writeUIntLE(119,27,3);
  const {media,state}=await fixture(t,{fetchImpl:async()=>new Response(webp,{headers:{'content-type':'image/webp'}})});assert.match((await media.get({kind:'player',id:'qa'})).dataUrl,/^data:image\/webp;base64,/);assert.equal(state.decodes,0);
  for(const [width,flags]of [[3000,0],[120,2]]){webp.writeUIntLE(width,24,3);webp[20]=flags;const {media}=await fixture(t,{fetchImpl:async()=>new Response(webp,{headers:{'content-type':'image/webp'}})});assert.equal((await media.get({kind:'player',id:'qa'})).available,false);}
});
test('confirmed publisher nickname alias is bound to its canonical ID and rejects collisions',()=>{
  const hunter={id:'hunter',name:'huNter'};assert.equal(findPublicPlayer([hunter],'huNter-'),hunter);assert.deepEqual(publicPlayerAliases('hunter','huNter'),['huNter-']);assert.deepEqual(publicPlayerAliases('other','huNter'),[]);assert.equal(findPublicPlayer([{id:'other',name:'huNter'}],'huNter-'),null);assert.equal(findPublicPlayer([hunter,{id:'different',name:'huNter-'}],'huNter-'),null);
});
