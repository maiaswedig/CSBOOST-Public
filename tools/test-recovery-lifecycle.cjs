const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {root,check,readJson,buildDirectory,sha}=require('./distribution-package.cjs');
const name=process.argv[2];const build=buildDirectory(name),executable=path.join(build,'CSBOOST.exe'),version=readJson(path.join(build,'build-manifest.json')).version;
const base=path.join(root,'analysis','recovery-lifecycle-qa');fs.mkdirSync(base,{recursive:true});
const fixture=fs.mkdtempSync(path.join(base,'isolated-')),results=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  for(const mode of ['clean','unexpected-exit']){
    const directory=path.join(fixture,mode);fs.mkdirSync(directory);const env={...process.env,CSBOOST_RECOVERY_QA_DIR:directory,CSBOOST_RECOVERY_QA_MODE:mode,ELECTRON_RUN_AS_NODE:'1'};delete env.NODE_OPTIONS;delete env.NODE_PATH;
    const log=fs.openSync(path.join(directory,'runtime.log'),'wx');
    const code=await new Promise((resolve,reject)=>{const child=spawn(executable,[path.join(root,'tests','recovery-lifecycle-harness.cjs'),'--disable-gpu'],{env,windowsHide:true,stdio:['ignore',log,log]});const timer=setTimeout(()=>{child.kill();reject(Error('Recovery lifetime harness timeout.'));},30000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});}).finally(()=>fs.closeSync(log));
    check(code===0&&!fs.existsSync(path.join(directory,'harness-error.txt'))&&readJson(path.join(directory,'harness-ready.json')).ready,'Recovery lifetime parent failed.');
    const reportPath=path.join(directory,'crash-recovery.json');let report=null;
    if(mode==='unexpected-exit'){for(let attempts=0;attempts<60&&!fs.existsSync(reportPath);attempts++)await delay(500);check(fs.existsSync(reportPath),'Native detached recovery did not write its report.');report=readJson(reportPath);check(report.ok&&report.errors.length===0&&JSON.stringify(report.steps.map(step=>step.name))===JSON.stringify(['frame-capture','cpu-affinity','process-priority','benchmark','benchmark-tuning','game-session'])&&report.steps.every(step=>step.ok),'Detached recovery did not complete every independent step.');}
    else {await delay(1500);check(!fs.existsSync(reportPath),'Clean disarm triggered crash recovery.');}
    results.push({mode,ok:true,reportWritten:!!report,steps:report?.steps??[],userSettingsChanged:false,gameLaunched:false});
  }
  const report={ok:true,version,build:name,executableSHA256:sha(executable),checkedAt:new Date().toISOString(),mode:'real-native-guard-and-detached-node-recovery',scope:'Real native parent-handle validation, lifetime pipe, per-user-data mutex and detached Electron-as-Node recovery chain. All journals are empty isolated fixtures. Does not validate restoration of physical hardware changes.',results,userSettingsChanged:false,gameLaunched:false};
  fs.writeFileSync(path.join(root,'analysis','free-verification','reliability-recovery-lifecycle.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
