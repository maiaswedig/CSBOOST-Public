import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createController} from '../src/free/controller.mjs';
test('session report requires login, respects cancel and exports current states',async t=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-report-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const file=path.join(directory,'report.json');let signed=false,canceled=false;const api=createController({auth:{getSession:async()=>signed?{}:null},sessions:{getState:async()=>({status:'running',processReport:{totalApplied:2}})},dialog:{showSaveDialog:async()=>({canceled,filePath:file})},boostPlan:{inspect:async()=>({status:'active'})}});await assert.rejects(()=>api.exportSessionReport(),/Steam/);signed=true;canceled=true;assert.equal((await api.exportSessionReport()).canceled,true);await assert.rejects(()=>fs.access(file));canceled=false;await api.exportSessionReport();const report=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(report.session.processReport.totalApplied,2);assert.equal(report.boost.status,'active');assert.match(report.scope,/não representa histórico completo/);});
