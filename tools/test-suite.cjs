const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {fingerprint,sha}=require('./verification-evidence.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'analysis','free-verification'),logPath=path.join(directory,'node-tests.log'),evidencePath=path.join(directory,'node-tests-evidence.json');
fs.mkdirSync(directory,{recursive:true});fs.rmSync(evidencePath,{force:true});
const before=fingerprint(),startedAt=new Date().toISOString(),log=fs.openSync(logPath,'w');
const child=spawn(process.execPath,['--test','--test-reporter=tap','tests/*.test.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
for(const [stream,target] of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',data=>{fs.writeSync(log,data);target.write(data);});
child.once('error',error=>{fs.closeSync(log);process.stderr.write(error.message+'\n');process.exitCode=1;});
child.once('close',code=>{
  try{fs.closeSync(log);}catch{}
  try{
    const text=fs.readFileSync(logPath,'utf8'),count=label=>{const matches=[...text.matchAll(new RegExp('^# '+label+' (\\d+)\\s*$','gm'))];if(!matches.length)throw Error('Missing test summary: '+label);return Number(matches.at(-1)[1]);};
    const tests={total:count('tests'),passed:count('pass'),failed:count('fail'),cancelled:count('cancelled'),skipped:count('skipped')};
    const skips=[...text.matchAll(/^ok [^\r\n]*# SKIP[^\r\n]*$/gm)].map(match=>match[0]);
    if(code!==0||tests.failed||tests.cancelled||tests.total!==tests.passed+tests.failed+tests.cancelled+tests.skipped)throw Error('Node test suite did not pass.');
    if(fingerprint()!==before)throw Error('Verification inputs changed while tests were running.');
    fs.writeFileSync(evidencePath,JSON.stringify({schema:1,kind:'node-tests',fingerprint:before,exitCode:code,version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,startedAt,finishedAt:new Date().toISOString(),logSHA256:sha(logPath),tests,skips},null,2));
    process.exitCode=0;
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=code||1;}
});
