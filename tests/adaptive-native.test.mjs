import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createWatcher} from '../src/free/watcher.mjs';

const unsupportedCodes=[5,50,87,120];
async function stopProbe(child){if(!child)return;const exited=child.exitCode!==null?Promise.resolve():once(child,'exit');child.stdin.end('\n');await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1500))]);if(child.exitCode===null)child.kill();}
function nextProbeLine(child){return new Promise((resolve,reject)=>{let output='';const onData=chunk=>{output+=chunk.toString();const index=output.indexOf('\n');if(index>=0){child.stdout.off('data',onData);resolve(output.slice(0,index).trim());}};child.stdout.on('data',onData);child.stdout.once('error',reject);});}

test('native process controls read, verify and restore only owned test instances', {skip:process.platform!=='win32',timeout:30000},async context=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-native-controls-'));
  const gameExe=path.join(directory,'cs2.exe'),backgroundExe=path.join(directory,'chrome.exe'),foreignGameExe=path.join(directory,'other-install','cs2.exe'),source=path.join(directory,'Probe.cs');
  let game,background,foreignGame,watcher,foreignStartedAt,foreignPriority;
  try{
    await fs.writeFile(source,'using System;using System.Diagnostics;using System.Globalization;class Probe{static void Main(){using(var p=Process.GetCurrentProcess()){Console.WriteLine("ready|"+p.StartTime.ToUniversalTime().ToString("o",CultureInfo.InvariantCulture)+"|"+p.PriorityClass.ToString());Console.Out.Flush();}Console.ReadLine();using(var p=Process.GetCurrentProcess()){Console.WriteLine(p.PriorityClass.ToString());Console.Out.Flush();}Console.ReadLine();}}');
    const compiler=path.join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
    await fs.mkdir(path.dirname(foreignGameExe),{recursive:true});
    for(const exe of [gameExe,backgroundExe,foreignGameExe])execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/out:'+exe,source],{windowsHide:true,timeout:15000});
    game=spawn(gameExe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});await once(game.stdout,'data');
    background=spawn(backgroundExe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});await once(background.stdout,'data');
    foreignGame=spawn(foreignGameExe,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});const foreignReady=String((await once(foreignGame.stdout,'data'))[0]).trim().split('|');foreignStartedAt=foreignReady[1];foreignPriority=foreignReady[2];
    watcher=createWatcher({workerPath:path.resolve('vendor/native/csboost-watcher.exe')});await watcher.start({executablePath:gameExe});
    const listing=await watcher.processOperation({action:'list'});assert.ok(Array.isArray(listing.rows));assert.equal(typeof listing.truncated,'boolean');assert.equal(listing.rows.some(row=>row.pid===foreignGame.pid),false);
    const sample=await watcher.processOperation({action:'sample'});assert.equal(typeof sample.gameFocused,'boolean');assert.equal(typeof sample.externalGovernor,'boolean');assert.equal(typeof sample.truncated,'boolean');assert.ok(sample.totalMs>=sample.idleMs);assert.ok(sample.logicalProcessors>0);assert.equal(sample.rows.some(row=>row.pid===foreignGame.pid),false);
    const gameRow=sample.rows.find(row=>row.pid===game.pid),backgroundRow=sample.rows.find(row=>row.pid===background.pid);assert.ok(gameRow&&gameRow.path.toLowerCase()===gameExe.toLowerCase());assert.ok(backgroundRow&&backgroundRow.path.toLowerCase()===backgroundExe.toLowerCase());assert.ok(gameRow.cpuMs>=0);
    await assert.rejects(watcher.processOperation({action:'set',pid:foreignGame.pid,name:'cs2',path:foreignGameExe,startedAt:foreignStartedAt,expected:'Normal',priority:'BelowNormal'}),/CS2 path outside scope/);
    foreignGame.stdin.write('\n');assert.equal(await nextProbeLine(foreignGame),foreignPriority);

    const gamePower=await watcher.processOperation({action:'getPower',...gameRow});
    context.diagnostic('CS2 power preference read: '+gamePower.status+(gamePower.errorCode?' (code '+gamePower.errorCode+')':''));
    if(gamePower.status==='unsupported'){assert.ok(unsupportedCodes.includes(gamePower.errorCode));assert.equal((await watcher.processOperation({action:'setPower',...gameRow,expectedControl:0,expectedState:0,control:1,state:0})).status,'unsupported');}
    else{assert.equal(gamePower.status,'ok');assert.equal((await watcher.processOperation({action:'setPower',...gameRow,expectedControl:gamePower.control,expectedState:gamePower.state,control:1,state:0})).status,'changed');const after=await watcher.processOperation({action:'getPower',...gameRow});assert.equal(after.control,1);assert.equal(after.state,0);assert.equal((await watcher.processOperation({action:'setPower',...gameRow,expectedControl:1,expectedState:0,control:gamePower.control,state:gamePower.state})).status,'changed');const restored=await watcher.processOperation({action:'getPower',...gameRow});assert.equal(restored.control,gamePower.control);if(gamePower.control===1)assert.equal(restored.state,gamePower.state);}

    const memoryBefore=await watcher.processOperation({action:'getMemoryPriority',...backgroundRow});
    context.diagnostic('Background memory priority read: '+memoryBefore.status+(memoryBefore.errorCode?' (code '+memoryBefore.errorCode+')':''));
    if(memoryBefore.status==='unsupported'){assert.ok(unsupportedCodes.includes(memoryBefore.errorCode));assert.equal((await watcher.processOperation({action:'setMemoryPriority',...backgroundRow,expectedPriority:5,priority:2})).status,'unsupported');}
    else{assert.equal(memoryBefore.status,'ok');const desired=memoryBefore.priority===2?4:2;assert.equal((await watcher.processOperation({action:'setMemoryPriority',...backgroundRow,expectedPriority:memoryBefore.priority,priority:desired})).status,'changed');assert.equal((await watcher.processOperation({action:'getMemoryPriority',...backgroundRow})).priority,desired);assert.equal((await watcher.processOperation({action:'setMemoryPriority',...backgroundRow,expectedPriority:desired,priority:memoryBefore.priority})).status,'changed');assert.equal((await watcher.processOperation({action:'getMemoryPriority',...backgroundRow})).priority,memoryBefore.priority);}

    assert.equal((await watcher.processOperation({action:'setPower',...gameRow,startedAt:'2000-01-01T00:00:00Z',expectedControl:gamePower.control,expectedState:gamePower.state,control:1,state:0})).status,'replaced');
    assert.equal((await watcher.processOperation({action:'setMemoryPriority',...backgroundRow,startedAt:'2000-01-01T00:00:00Z',expectedPriority:5,priority:2})).status,'replaced');
    assert.equal((await watcher.processOperation({action:'set',...gameRow,expected:'Normal',priority:'BelowNormal',backgroundOnly:true})).status,'foreground');
  }finally{await watcher?.stop();await stopProbe(foreignGame);await stopProbe(background);await stopProbe(game);await fs.rm(directory,{recursive:true,force:true});}
});
