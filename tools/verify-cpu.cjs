const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {pathToFileURL}=require('node:url');
const execute=promisify(execFile),root=path.resolve(__dirname,'..');
(async()=>{
  const folder=await fs.mkdtemp(path.join(root,'analysis','free-ui-qa','native-affinity-'));
  const source=path.join(folder,'Fixture.cs'),fixture=path.join(folder,'chrome.exe');
  await fs.writeFile(source,'using System.Threading; class Fixture {static void Main(){Thread.Sleep(30000);}}');
  await execute(path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+fixture,source],{windowsHide:true});
  const worker=require('./build-cpu.cjs').buildCpuWorker(root);
  const child=spawn(fixture,[],{windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  let report;
  try{
    const run=async args=>JSON.parse((await execute(worker,args,{windowsHide:true})).stdout);
    const topology=await run(['topology']);const {planCpuDistribution}=await import(pathToFileURL(path.join(root,'src','free','cpu-affinity.mjs')).href);const plan=planCpuDistribution(topology);
    if(!plan.supported)throw Error(plan.reason);
    let before;for(let i=0;i<20;i++){try{before=await run(['get',String(child.pid)]);if(before.status==='ok')break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
    if(!before)throw Error('Fixture identity unavailable');
    const identity=[String(child.pid),before.startedAt,Buffer.from(fixture).toString('base64')];let changed;
    try{changed=await run(['set',...identity,before.mask,plan.backgroundMask]);if(changed.status!=='changed')throw Error('Native set was not confirmed');const actual=await run(['get',String(child.pid)]);if(actual.mask!==plan.backgroundMask)throw Error('Native mask mismatch');}
    finally{if(changed?.status==='changed')await run(['set',...identity,plan.backgroundMask,before.mask]);}
    const restored=await run(['get',String(child.pid)]);if(restored.mask!==before.mask)throw Error('Native restoration mismatch');
    report={ok:true,scope:'Only an owned development fixture process was assigned and restored. No user application or CS2 affinity changed. No FPS measured.',physicalCores:plan.physicalCores,systemMask:topology.systemMask,gameMask:plan.gameMask,backgroundMask:plan.backgroundMask,nativeSetConfirmed:true,nativeRestoreConfirmed:true};
  }finally{child.kill();}
  await fs.writeFile(path.join(root,'analysis','free-verification','native-affinity.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
