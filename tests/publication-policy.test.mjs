import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPublicationServices,PUBLICATION_POLICY,PUBLICATION_LINKS} from '../src/free/publication-policy.mjs';

test('public candidate denies every third-party extraction before network or cache access',async()=>{
  const dir=path.join(os.tmpdir(),'csboost-absent-'+Date.now()),opened=[];
  const service=createPublicationServices({directory:dir,openExternal:async u=>opened.push(u)});
  assert.ok(Object.isFrozen(PUBLICATION_POLICY));assert.ok(Object.values(PUBLICATION_POLICY).every(v=>v===false));
  for(const method of Object.values(service.proLibrary))await assert.rejects(method({id:'example'}),/indisponível/);
  await assert.rejects(service.content.getNews(),/indisponível/);await assert.rejects(service.content.getRankings(),/indisponível/);
  assert.deepEqual(await service.proMedia.get({kind:'player',id:'example'}),{available:false,disabled:true});
  assert.deepEqual(opened,[]);await assert.rejects(fs.stat(dir),{code:'ENOENT'});
});
test('publication links use exact fixed destinations, never renderer supplied URLs',async()=>{
  const opened=[],s=createPublicationServices({directory:'unused',openExternal:async u=>opened.push(u)});
  for(const key of Object.keys(PUBLICATION_LINKS))await s.openSource(key);
  for(const bad of ['constructor','__proto__','https://example.com',{},null])await assert.rejects(s.openSource(bad));
  for(const bad of ['https://github.com/attacker/project',PUBLICATION_LINKS.news+'?url=bad','http://store.steampowered.com/news/app/730'])await assert.rejects(s.content.openArticle(bad));
  assert.deepEqual(opened,Object.values(PUBLICATION_LINKS));
});
test('cache cleanup deletes recognized cache only and preserves profiles and backups',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-publication-'));
  try{
    for(const folder of ['content','pro-library','pro-media','profiles','video-backups'])await fs.mkdir(path.join(dir,folder));
    const owned=['content/news.json','content/rankings.json','pro-library/catalog.json','pro-library/player-example.json','pro-media/'+ 'a'.repeat(64)+'.json'];
    const preserved=['profiles/profile.json','video-backups/backup.json','pro-library/unknown.json','content/other.json'];
    for(const file of [...owned,...preserved])await fs.writeFile(path.join(dir,file),'fixture');
    const s=createPublicationServices({directory:dir,openExternal:async()=>{}});
    assert.equal((await s.clearCache()).removed,owned.length);assert.equal((await s.clearCache()).removed,0);
    for(const file of preserved)assert.equal(await fs.readFile(path.join(dir,file),'utf8'),'fixture');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
