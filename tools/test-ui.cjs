const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {fingerprint}=require('./verification-evidence.cjs');

const root=path.resolve(__dirname,'..'),harness=path.join(root,'tests','free-ui-harness.cjs');
const mode=process.env.CSBOOST_UI_PUBLICATION_ONLY==='1'?'publication':process.env.CSBOOST_UI_3D_ONLY==='1'?'preview3d':process.env.CSBOOST_UI_PRO_MEDIA_ONLY==='1'?'pro-media':process.env.CSBOOST_UI_PREMIUM_ONLY==='1'?'premium':'full';
const output=path.join(root,'analysis','free-ui-qa'),resultFile=path.join(output,mode==='full'?'results.json':mode+'-results.json');
fs.mkdirSync(output,{recursive:true});fs.rmSync(resultFile,{force:true});
function resolveElectron(){
  if(process.env.CSBOOST_ELECTRON_PATH){
    const explicit=path.resolve(process.env.CSBOOST_ELECTRON_PATH);
    if(!fs.existsSync(explicit))throw Error('CSBOOST_ELECTRON_PATH aponta para um arquivo inexistente.');
    if(fs.existsSync(path.join(path.dirname(explicit),'resources','app','package.json')))throw Error('CSBOOST_ELECTRON_PATH precisa apontar para Electron de QA; o aplicativo empacotado ignora o harness.');
    return explicit;
  }
  try{const installed=require('electron');if(typeof installed==='string'&&fs.existsSync(installed))return installed;}catch{}
  for(const candidate of [path.join(root,'vendor','qa-runtime-CSBOOST-Free','CSBOOST.exe')])if(fs.existsSync(candidate))return candidate;
  return null;
}

let electron;
try{electron=resolveElectron();}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;return;}
if(!electron){
  process.stdout.write('SKIP npm run test:ui: Electron não está instalado nem há runtime empacotado. Para executar, instale Electron 44.4.3 ou configure CSBOOST_ELECTRON_PATH.\n');
  process.exit(process.env.CSBOOST_REQUIRE_UI==='1'?1:0);
}
const before=fingerprint(),startedAt=new Date().toISOString();
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[harness,'--disable-gpu'],{cwd:root,windowsHide:true,stdio:'inherit',env});
const timeout=setTimeout(()=>{process.stderr.write('UI test timeout after 180 seconds.\n');child.kill();process.exitCode=1;},180000);
child.on('error',error=>{clearTimeout(timeout);process.stderr.write(`Electron could not start: ${error.message}\n`);process.exitCode=1;});
child.on('exit',code=>{
  clearTimeout(timeout);
  try{
    const result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
    if(code===0&&result.ok===true&&!result.rendererErrors?.length){if(before!==fingerprint())throw Error('Verification inputs changed during UI tests.');result.evidence={schema:1,kind:mode==='full'?'electron-ui':'electron-ui-'+mode,fingerprint:before,exitCode:code,startedAt,finishedAt:new Date().toISOString()};fs.writeFileSync(resultFile,JSON.stringify(result,null,2));process.stdout.write(`UI integration passed (${mode}): ${result.checks?.length??0} checks; ${result.rendererErrors?.length??0} renderer errors.\n`);return;}
    process.stderr.write(`UI integration failed (Electron exit ${code}): ${result.error||'invalid result'}.\n`);
    process.exitCode=1;
  }catch(error){process.stderr.write(`Electron did not produce a valid UI report: ${error.message}\n`);process.exitCode=code||1;}
});
