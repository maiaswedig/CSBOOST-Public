import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBenchmarks} from '../src/free/benchmarks.mjs';
import {DEFAULT_SETTINGS,validateSettings,renderConfig} from '../src/free/profiles.mjs';
test('history CSV preserves measured values and escapes filenames that could become spreadsheet formulas',async t=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-history-export-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const file=path.join(directory,'=formula.log');await fs.writeFile(file,'[VProf] Summary of 12000 frames and 120 1-second intervals\n[VProf] FPS: Avg=100, P1=70');const benchmarks=createBenchmarks(path.join(directory,'history'));await benchmarks.importFile(file);const csv=await benchmarks.exportHistory('csv');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=formula.log"'));assert.ok(csv.includes('"100";"70";"120"'));const json=JSON.parse(await benchmarks.exportHistory('json'));assert.equal(json.format,'csboost-benchmarks');assert.equal(json.reports[0].averageFps,100);await assert.rejects(benchmarks.exportHistory('shell'));});
test('optional reload binding targets only the fixed own cfg and cannot collide or inject commands',()=>{const settings=structuredClone(DEFAULT_SETTINGS);settings.launch.reloadKey='f8';settings.zoomSensitivity=.819;assert.match(renderConfig({settings}),/bind "f8" "exec csboost.cfg"/);assert.match(renderConfig({settings}),/zoom_sensitivity_ratio "0.819"/);settings.binds=[{key:'f8',action:'+jump'}];assert.throws(()=>validateSettings(settings),/já usada/);settings.binds=[];settings.launch.reloadKey='f8;quit';assert.throws(()=>validateSettings(settings));});
