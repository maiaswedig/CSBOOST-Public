const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const assert=require('node:assert/strict');
const execute=promisify(execFile),root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const folder=await fs.mkdtemp(path.join(root,'analysis','free-ui-qa','native-recovery-'));
  const runtime=path.join(folder,'runtime'),app=path.join(runtime,'resources','app'),directory=path.join(folder,'profile');
  await fs.mkdir(runtime,{recursive:true});await fs.mkdir(directory);
  // Owned copies/hard links of the same Electron runtime used by the application.
  // RUN_AS_NODE exercises the actual headless recovery executable as well.
  const runtimeSource=path.join(root,'vendor','qa-runtime');
  for(const entry of await fs.readdir(runtimeSource,{withFileTypes:true})){if(entry.isFile())await fs.link(path.join(runtimeSource,entry.name),path.join(runtime,entry.name));}
  await fs.cp(path.join(runtimeSource,'locales'),path.join(runtime,'locales'),{recursive:true});
  await fs.cp(path.join(root,'src','free'),app,{recursive:true});
  await fs.copyFile(require('./build-cpu.cjs').buildCpuWorker(root),path.join(app,'native','csboost-cpu.exe'));
  await fs.copyFile(require('./build-recovery.cjs').buildRecoveryGuard(root),path.join(app,'native','csboost-recovery.exe'));
  const source=path.join(folder,'Fixture.cs'),fixtureFile=path.join(folder,'chrome.exe');
  await fs.writeFile(source,'using System.Threading; class Fixture {static void Main(){Thread.Sleep(120000);}}');
  await execute(path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+fixtureFile,source],{windowsHide:true});
  const fixture=spawn(fixtureFile,[],{windowsHide:true,stdio:'ignore'}),owned=[fixture];
  const worker=path.join(app,'native','csboost-cpu.exe'),native=async args=>JSON.parse((await execute(worker,args,{windowsHide:true})).stdout);
  const start=mode=>{
    const child=spawn(path.join(runtime,'CSBOOST.exe'),[path.join(root,'tests','recovery-native-parent.mjs'),JSON.stringify({runtime,directory,mode,fixturePid:fixture.pid})],{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe','ipc']});owned.push(child);
    let errors='';child.stderr.on('data',chunk=>errors+=chunk);child.stdout.resume();
    const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native watchdog timed out: '+errors)),20000);child.once('message',value=>{clearTimeout(timer);resolve(value);});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(code&&!child.killed)reject(Error('Fixture parent failed: '+errors));});});
    return {child,ready};
  };
  let report;
  try{
    await delay(100);const first=start('crash'),initial=await first.ready;
    assert.equal(initial.priority,1);assert.equal(initial.affinity,1);
    const changed=await native(['get',String(fixture.pid)]);assert.notEqual(changed.mask,initial.before.mask);
    const waiting=start('wait');let secondReady=false;waiting.ready.then(()=>{secondReady=true;});
    await delay(250);assert.equal(secondReady,false,'new app acquired the mutex before old app exit');
    first.child.kill();const next=await waiting.ready;assert.equal(next.recoveryExists,true,'new app started before recovery finished');
    const restoration=JSON.parse(await fs.readFile(path.join(directory,'crash-recovery.json'),'utf8'));assert.equal(restoration.ok,true,JSON.stringify(restoration));
    const restored=await native(['get',String(fixture.pid)]);assert.equal(restored.mask,initial.before.mask);
    const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const priority=(await execute(ps,['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${fixture.pid}).PriorityClass.ToString()`],{windowsHide:true})).stdout.trim();assert.equal(priority,'Normal');
    await assert.rejects(fs.stat(path.join(directory,'game-session.json')),{code:'ENOENT'});
    waiting.child.send('close');await new Promise(resolve=>waiting.child.once('exit',resolve));await delay(100);
    const reportText=await fs.readFile(path.join(directory,'crash-recovery.json'),'utf8');
    const clean=start('clean');await clean.ready;await new Promise(resolve=>clean.child.once('exit',resolve));await delay(150);
    assert.equal(await fs.readFile(path.join(directory,'crash-recovery.json'),'utf8'),reportText,'clean exit ran crash recovery');
    report={ok:true,scope:'Only owned development processes, a copied application and an isolated profile. No user process, game, registry, power or driver changes. No FPS measured.',runtime:'Electron 44.4.3 headless mode',forcedExit:true,nativePriorityRestored:true,nativeAffinityRestored:true,newInstanceWaitedForRecovery:true,cleanExitSkippedRecovery:true,restoration};
  }finally{for(const child of owned){if(child.exitCode===null)child.kill();}}
  await fs.writeFile(path.join(root,'analysis','free-verification','native-recovery.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
