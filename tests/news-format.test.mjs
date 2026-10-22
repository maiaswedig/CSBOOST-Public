import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {plainNewsText,createContent} from '../src/free/content.mjs';
test('Steam block/list markup preserves readable boundaries and escaped headings without executable markup',()=>{
  const text=plainNewsText('[p]\\[ UI ][/p][p]Updates:[/p][list][*][p]First change[/p][/*][*][p]Second [b]change[/b][/p][/*][/list]<script>alert(1)</script>');
  assert.match(text,/\[ UI \]/);assert.match(text,/Updates:\n/);assert.match(text,/•\s*First change/);assert.match(text,/•\s*Second change/);assert.doesNotMatch(text,/alert|\[p\]|\[list\]|\[b\]|\\\[/);assert.ok(plainNewsText('a'.repeat(4000)).length<=1200);
});
test('legacy news summaries are refreshed from full Steam markup even when their old cache TTL is fresh',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-news-format-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const now=Date.now();await fs.writeFile(path.join(directory,'news.json'),JSON.stringify({loadedAt:new Date(now).toISOString(),items:[{summary:'OldJoinedText'}]}));let calls=0;
  const service=createContent({directory,now:()=>now,fetchImpl:async url=>{calls++;assert.match(url,/maxlength=0(?:&|$)/);return new Response(JSON.stringify({appnews:{newsitems:[{gid:'1',title:'Fixture update',contents:'[p]First[/p][p]Second[/p]',date:1700000000,url:'https://steamcommunity.com/news/1'}]}}));}});
  const result=await service.getNews();assert.equal(result.formatVersion,2);assert.match(result.items[0].summary,/^First\n+Second$/);await service.getNews();assert.equal(calls,1);
});
