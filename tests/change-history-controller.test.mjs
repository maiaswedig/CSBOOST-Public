import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createController} from '../src/free/controller.mjs';
import {createChangeHistory} from '../src/free/change-history.mjs';

test('history APIs require Steam login and export a sanitized JSON report',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-history-controller-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const history=createChangeHistory({directory:path.join(directory,'history')});await history.record({moduleId:'power',label:'Plano ativo',previous:'Equilibrado',applied:'Alto desempenho',reason:'Política de energia Steam 76561198000000000',restoration:'pending'});
  let session=null;const api=createController({auth:{getSession:async()=>session},changeHistory:history,dialog:{showSaveDialog:async options=>({canceled:false,filePath:path.join(directory,options.defaultPath)})}});
  await assert.rejects(()=>api.getChangeHistory(),/Steam/);await assert.rejects(()=>api.exportChangeHistory(),/Steam/);
  session={steamId:'76561198000000000'};const result=await api.getChangeHistory();assert.equal(result.personalDataIncluded,false);assert.equal(result.events[0].reason.includes(session.steamId),false);
  const exported=await api.exportChangeHistory(),text=await fs.readFile(exported.path,'utf8');assert.equal(exported.personalDataIncluded,false);assert.equal(text.includes(session.steamId),false);assert.match(text,/Política de energia/);
});
