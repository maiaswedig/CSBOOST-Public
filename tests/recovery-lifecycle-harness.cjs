const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const directory=process.env.CSBOOST_RECOVERY_QA_DIR,mode=process.env.CSBOOST_RECOVERY_QA_MODE;
if(!directory||!path.isAbsolute(directory)||!['clean','unexpected-exit'].includes(mode))throw Error('QA invocation invalid.');
(async()=>{
  await fs.mkdir(directory,{recursive:true});
  // Empty isolated journals: exercise the native lifetime/pipe/mutex/Node recovery chain
  // without selecting processes, changing registry/driver/power settings or starting CS2.
  const module=await import(pathToFileURL(path.join(path.dirname(process.execPath),'resources','app','recovery-guard.mjs')).href);
  const guard=await module.startRecoveryGuard({directory});
  if(!guard.getState().available)throw Error('Native guard not available.');
  await fs.writeFile(path.join(directory,'harness-ready.json'),JSON.stringify({ready:true,mode,parentPid:process.pid}));
  if(mode==='clean')await guard.disarm();
  process.exit(0);
})().catch(async error=>{await fs.writeFile(path.join(directory,'harness-error.txt'),error.stack);process.exit(1);});
