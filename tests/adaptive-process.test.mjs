import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAdaptiveProcesses} from '../src/free/adaptive-process.mjs';
import {createGameSessions} from '../src/free/sessions.mjs';
import {validateProcessPolicy} from '../src/free/process-tuning.mjs';

async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-adaptive-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const gamePath=path.join(directory,'CS2'),rows=['cs2','chrome','Discord','obs64'].map((name,i)=>({pid:100+i,name,path:name==='cs2'?path.join(gamePath,'game','bin','win64','cs2.exe'):path.join(directory,name+'.exe'),startedAt:'2026-10-19T12:00:00Z',priority:'Normal',cpuMs:0}));
  const env={clock:1000,totalMs:0,idleMs:0,focused:true,governor:false,governorNames:[],supported:true,truncated:false,deny:false,failAfterSet:false,power:{control:0,state:0},writes:[],reads:0};
  const processes=async request=>{if(request.action==='sample'){env.reads++;if(env.deny)throw Error('Counter denied');return {supported:env.supported,logicalProcessors:12,totalMs:env.totalMs,idleMs:env.idleMs,gameFocused:env.focused,externalGovernor:env.governor||env.governorNames.length>0,externalGovernorNames:[...env.governorNames],rows:structuredClone(rows),truncated:env.truncated};}const row=rows.find(item=>item.pid===request.pid);if(!row)return {status:'exited'};if(row.startedAt!==request.startedAt||row.path!==request.path)return {status:'replaced'};if(request.action==='getPower')return {status:'ok',...env.power};if(request.action==='setPower'){if(env.power.control!==request.expectedControl||env.power.control===1&&env.power.state!==request.expectedState)return {status:'conflict'};env.writes.push({...structuredClone(request),at:env.clock});env.power={control:request.control,state:request.state};return {status:'changed'};}if(request.action!=='set')throw Error('Unknown action');if(request.backgroundOnly&&!env.focused)return {status:'foreground'};if(row.priority!==request.expected)return {status:'conflict'};env.writes.push({...structuredClone(request),at:env.clock});row.priority=request.priority;if(env.failAfterSet){env.failAfterSet=false;throw Error('Write completed but transport failed');}return {status:'changed'};};
  const deps={directory,system:{refreshSteam:async()=>({cs2Installed:true,gamePath})},processes,now:()=>env.clock},api=createAdaptiveProcesses(deps);
  async function advance({busy=90,browser=15,adaptiveOptions}={}){env.clock+=1500;env.totalMs+=18000;env.idleMs+=18000*(1-busy/100);rows.forEach(row=>row.cpuMs+=18000*(row.name==='cs2'?30:browser)/100);return api.tick(adaptiveOptions);}
  async function restrain({adaptiveOptions}={}){await api.tick(adaptiveOptions);await advance({adaptiveOptions});return advance({adaptiveOptions});}
  return {directory,rows,env,deps,api,advance,restrain};
}
test('automatic policy is distinct from legacy manual priorities and validates its configurable anti-oscillation limits',()=>{
  assert.deepEqual(validateProcessPolicy({automatic:true}),{prioritizeGame:false,backgroundApps:[],automatic:true,adaptiveOptions:{maxReductionsPerProcess:3,reapplicationWindowMs:600000,backoffBaseMs:30000}});
  assert.deepEqual(validateProcessPolicy({automatic:true,adaptiveOptions:{maxReductionsPerProcess:4,reapplicationWindowMs:900000,backoffBaseMs:60000}}).adaptiveOptions,{maxReductionsPerProcess:4,reapplicationWindowMs:900000,backoffBaseMs:60000});
  for(const other of [{prioritizeGame:true},{backgroundApps:['chrome']},{cpuDistribution:true}])assert.throws(()=>validateProcessPolicy({automatic:true,...other}));
  assert.throws(()=>validateProcessPolicy({automatic:'yes'}));
  assert.throws(()=>validateProcessPolicy({automatic:true,adaptiveOptions:{maxReductionsPerProcess:5}}));
  assert.throws(()=>validateProcessPolicy({adaptiveOptions:{maxReductionsPerProcess:2}}));
});
test('sustained contention lowers only eligible background tasks without changing game QoS',async t=>{const f=await fixture(t);const report=await f.restrain();assert.equal(f.rows[0].priority,'Normal');assert.equal(f.rows[1].priority,'BelowNormal');assert.equal(f.rows[2].priority,'Normal');assert.equal(f.rows[3].priority,'Normal');assert.deepEqual(f.env.power,{control:0,state:0});assert.equal(report.totalApplied,1);assert.equal(f.env.writes.filter(row=>row.action==='set').length,1);assert.equal(f.env.writes.find(row=>row.action==='set').backgroundOnly,true);await f.api.restore();assert.equal(f.rows[1].priority,'Normal');assert.deepEqual(f.env.power,{control:0,state:0});});
test('automatic balancing also restrains Brave, Opera and Vivaldi under sustained game load',async t=>{const f=await fixture(t);for(const [index,name]of ['brave','opera','vivaldi'].entries())f.rows.push({pid:200+index,name,path:path.join(f.directory,name+'.exe'),startedAt:'2026-10-19T12:00:00Z',priority:'Normal',cpuMs:0});const report=await f.restrain();assert.equal(report.totalApplied,4);assert.ok(f.rows.filter(row=>['chrome','brave','opera','vivaldi'].includes(row.name)).every(row=>row.priority==='BelowNormal'));assert.equal(f.rows.find(row=>row.name==='Discord').priority,'Normal');await f.api.restore();assert.ok(f.rows.every(row=>row.priority==='Normal'));});
test('automatic balancing includes Dropbox and Google Drive only under sustained CPU pressure and restores both',async t=>{const f=await fixture(t);for(const [index,name]of ['Dropbox','GoogleDriveFS'].entries())f.rows.push({pid:220+index,name,path:path.join(f.directory,name+'.exe'),startedAt:'2026-10-19T12:00:00Z',priority:'Normal',cpuMs:0});const report=await f.restrain();assert.equal(report.totalApplied,3);assert.ok(f.rows.filter(row=>['chrome','Dropbox','GoogleDriveFS'].includes(row.name)).every(row=>row.priority==='BelowNormal'));assert.equal(f.rows.find(row=>row.name==='Discord').priority,'Normal');assert.equal(f.rows.find(row=>row.name==='obs64').priority,'Normal');await f.api.restore();assert.ok(f.rows.every(row=>row.priority==='Normal'));});
test('light load and brief CPU spikes never lower background priorities',async t=>{const f=await fixture(t);await f.api.tick();await f.advance({busy:30});await f.advance({busy:95});await f.advance({busy:30});assert.equal(f.rows[1].priority,'Normal');assert.equal(f.env.writes.filter(row=>row.action==='set').length,0);});
test('Alt-Tab immediately releases owned priorities while leaving game power settings untouched',async t=>{const f=await fixture(t);await f.restrain();f.env.focused=false;await f.advance();assert.equal(f.rows[1].priority,'Normal');assert.deepEqual(f.env.power,{control:0,state:0});assert.equal((await f.api.inspect()).active,false);});
test('declining pressure restores priority and cooldown prevents repeated immediate restraint',async t=>{const f=await fixture(t);await f.restrain();await f.advance({busy:40});assert.equal(f.rows[1].priority,'Normal');await f.advance();await f.advance();assert.equal(f.rows[1].priority,'Normal');});
test('ten minutes of sustained pressure stay within the per-process reduction limit and use progressive backoff',async t=>{
  const f=await fixture(t),adaptiveOptions={maxReductionsPerProcess:3,reapplicationWindowMs:600000,backoffBaseMs:30000};
  await f.api.tick(adaptiveOptions);let report;
  for(let index=0;index<400;index++)report=await f.advance({adaptiveOptions});
  const reductions=f.env.writes.filter(request=>request.action==='set'&&request.pid===101&&request.priority==='BelowNormal');
  assert.equal(reductions.length,3);
  assert.equal(f.rows[1].priority,'Normal');
  const counter=report.reapplication.processes.find(item=>item.pid===101);
  assert.deepEqual({count:counter.count,limit:counter.limit,windowMs:counter.windowMs},{count:3,limit:3,windowMs:600000});
  assert.ok(report.events.some(item=>item.action.includes('limite de reaplicações atingido (3/3')));
  assert.ok(report.events.some(item=>item.action.includes('recuo progressivo de 30 s')));
  assert.ok(report.events.some(item=>item.action.includes('recuo progressivo de 60 s')));
  assert.ok(report.events.some(item=>item.action.includes('recuo progressivo de 120 s')));
  await f.api.restore();
  assert.equal((await f.api.inspect()).reapplication.processes.length,0);
});
test('custom anti-oscillation policy reaches the governor and never exceeds its selected rolling-window limit',async t=>{
  const f=await fixture(t),adaptiveOptions={maxReductionsPerProcess:2,reapplicationWindowMs:300000,backoffBaseMs:15000};
  await f.restrain({adaptiveOptions});
  for(let index=0;index<400;index++)await f.advance({adaptiveOptions});
  const reductions=f.env.writes.filter(request=>request.action==='set'&&request.pid===101&&request.priority==='BelowNormal').map(request=>request.at);
  for(const start of reductions){assert.ok(reductions.filter(at=>at>=start&&at<start+adaptiveOptions.reapplicationWindowMs).length<=2);}
  assert.ok(reductions.length>=2);
  await f.api.restore();
});
test('confirmed external governors release owned priorities and explain why rules are paused',async t=>{
  for(const [name,label] of [['ProcessLasso','Process Lasso'],['ProcessGovernor','ProcessGovernor']]){
    const f=await fixture(t);await f.restrain();f.env.governorNames=[name];const report=await f.advance();
    assert.equal(report.status,'external-governor');assert.equal(f.rows[1].priority,'Normal');assert.ok(report.warnings.some(message=>message.includes(label)&&message.includes('pausou as regras automáticas')));assert.ok(report.events.some(item=>item.action.includes(label)));
    assert.deepEqual(f.env.power,{control:0,state:0});assert.equal(f.env.writes.filter(row=>row.action==='set').length,2);
  }
});
test('custom process priority and existing HighQoS are preserved without claiming writes',async t=>{const f=await fixture(t);f.rows[1].priority='AboveNormal';f.env.power={control:1,state:0};const result=await f.restrain();assert.equal(result.totalApplied,0);assert.equal(f.env.writes.length,0);});
test('user changes are preserved during restore and never retuned in the same session',async t=>{const f=await fixture(t);await f.restrain();f.rows[1].priority='High';f.env.focused=false;await f.advance();assert.equal(f.rows[1].priority,'High');f.env.focused=true;f.rows[1].priority='Normal';await f.advance();await f.advance();await f.advance();assert.equal(f.rows[1].priority,'Normal');});
test('counter errors release owned rules and produce an unavailable report',async t=>{const f=await fixture(t);await f.restrain();f.env.deny=true;const result=await f.api.tick();assert.equal(result.status,'unavailable');assert.equal(f.rows[1].priority,'Normal');assert.deepEqual(f.env.power,{control:0,state:0});});
test('foreign game executable and unsupported topology do not acquire any rule',async t=>{const f=await fixture(t);f.rows[0].path=path.join(f.directory,'lookalike','cs2.exe');await f.restrain();assert.equal(f.env.writes.length,0);f.rows[0].path=path.join(f.directory,'CS2','game','bin','win64','cs2.exe');f.env.supported=false;await f.advance();await f.advance();assert.equal(f.env.writes.length,0);});
test('durable journal restores a write whose native response failed, through a fresh instance',async t=>{const f=await fixture(t);await f.api.tick();await f.advance();f.env.failAfterSet=true;const report=await f.advance();assert.ok(report.warnings.some(message=>message.includes('transport')));assert.equal(f.rows[1].priority,'BelowNormal');await createAdaptiveProcesses(f.deps).restore();assert.equal(f.rows[1].priority,'Normal');assert.deepEqual(f.env.power,{control:0,state:0});});
test('300-row inventory is truncated with a warning, retains the matching CS2, and ignores a foreign CS2',async t=>{
  const f=await fixture(t),game=f.rows.find(row=>row.name==='cs2'),foreign={...game,pid:9900,path:path.join(f.directory,'other-install','cs2.exe')};
  const browsers=Array.from({length:298},(_,index)=>({pid:1000+index,name:'chrome',path:path.join(f.directory,`chrome-${index}.exe`),startedAt:'2026-10-19T12:00:00Z',priority:'Normal',cpuMs:0}));
  f.rows.splice(0,f.rows.length,...browsers,foreign,game);f.env.truncated=true;
  const report=await f.restrain();
  assert.equal(report.status,'monitoring');assert.ok(report.applied>0);assert.ok(report.warnings.some(message=>message.includes('limite de 256')));
  assert.equal(f.rows.find(row=>row.pid===game.pid).priority,'Normal');assert.equal(f.env.writes.some(row=>row.path===foreign.path),false);assert.equal(f.env.writes.some(row=>row.action==='setPower'),false);
  await f.api.restore();assert.ok(f.rows.filter(row=>row.name==='chrome').every(row=>row.priority==='Normal'));
});
test('older power journal entries remain restorable but are never newly created',async t=>{
  const f=await fixture(t),game=f.rows[0],file=path.join(f.directory,'adaptive-restore.json');
  await f.restrain();const current=JSON.parse(await fs.readFile(file,'utf8'));assert.ok(current.entries.every(entry=>entry.kind==='priority'));await f.api.restore();
  await fs.writeFile(file,JSON.stringify({version:1,entries:[{pid:game.pid,name:game.name,path:game.path,startedAt:game.startedAt,kind:'power',before:{control:0,state:0},after:{control:1,state:0},at:f.env.clock}]}));
  f.env.power={control:1,state:0};const restored=await createAdaptiveProcesses(f.deps).restore();
  assert.equal(restored.restored,1);assert.deepEqual(f.env.power,{control:0,state:0});assert.equal(f.env.writes.filter(row=>row.action==='setPower').length,1);
});
test('recycled PID cannot restore a prior instance over a replacement process',async t=>{const f=await fixture(t);await f.restrain();f.rows[1].startedAt='2026-10-19T13:00:00Z';f.rows[1].priority='AboveNormal';await createAdaptiveProcesses(f.deps).restore();assert.equal(f.rows[1].priority,'AboveNormal');});
test('automatic session samples every 1.5 seconds while legacy manual interval remains independent',async t=>{const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-auto-session-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));let clock=1000,running=false,ticks=0,restored=0;const session=createGameSessions({directory,now:()=>clock,pollMs:100000,isGameRunning:async()=>running,system:{launchCS2:async()=>{}},processTuning:{apply:async policy=>{assert.equal(policy.automatic,true);ticks++;return {automatic:true,applied:0};},restore:async()=>restored++}});t.after(()=>session.dispose());await session.start({preset:'balanced',processPolicy:{automatic:true}});running=true;await session.poll();clock+=1499;await session.poll();assert.equal(ticks,1);clock++;await session.poll();assert.equal(ticks,2);running=false;await session.poll();assert.equal(restored,1);assert.equal(await session.getState(),null);});
