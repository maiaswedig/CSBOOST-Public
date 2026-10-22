// Keep a real child process handle and persistent log descriptors. Windows GUI
// executables must not be launched through a shell that returns before the child.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),type=process.argv[2];
if(!['baseline','boosted','recover'].includes(type))throw Error('Use baseline, boosted ou recover.');
const logPath=path.join(root,'analysis','free-verification','live-benchmark-runtime.log');
const log=fs.openSync(logPath,'a');
const child=spawn(path.join(root,'output','CSBOOST-Free-Benchmark-AMD','CSBOOST.exe'),[path.join(root,'tools','run-live-benchmark.mjs'),type],{cwd:root,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore',log,log],shell:false});
child.once('spawn',()=>console.log(JSON.stringify({pid:child.pid,log:logPath,type})));
child.once('error',error=>{fs.closeSync(log);console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{fs.closeSync(log);console.log(JSON.stringify({exitCode:code}));process.exitCode=code??1;});
