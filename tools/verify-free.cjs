const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),build=process.argv[2]||'CSBOOST-Free';
if(!/^CSBOOST-Free(?:-[a-zA-Z0-9-]+)?$/.test(build))throw Error('Invalid build name');
const directory=path.join(root,'analysis','free-verification',build),file=path.join(directory,'verification.json');fs.mkdirSync(directory,{recursive:true});fs.rmSync(file,{force:true});
const started=Date.now(),env={...process.env,CSBOOST_VERIFICATION_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
const log=fs.openSync(path.join(directory,'startup.log'),'w');
const child=spawn(path.join(root,'output',build,'CSBOOST.exe'),['--verify-free','--disable-gpu'],{windowsHide:true,stdio:['ignore',log,log],env});
const timeout=setTimeout(()=>{child.kill();console.error('Verification timed out.');process.exitCode=1;},45000);
child.once('error',error=>{console.error(error.message);process.exitCode=1;clearTimeout(timeout);});
child.once('close',code=>{
 clearTimeout(timeout);fs.closeSync(log);
 try{if(code!==0||!fs.existsSync(file)||fs.statSync(file).mtimeMs<started)throw Error('No fresh successful startup verification.');
 const result=JSON.parse(fs.readFileSync(file,'utf8'));if(!result.ok||!result.integrity?.verified)throw Error('Startup or integrity verification failed.');
 console.log(JSON.stringify(result,null,2));process.exitCode=0;
 }catch(error){console.error(error.message);process.exitCode=code||1;}
});
