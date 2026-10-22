const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function buildWatcherWorker(root=path.resolve(__dirname,'..')){
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  if(!fs.existsSync(compiler))throw new Error('Compilador .NET Framework x64 indisponível para monitor.');
  const output=path.join(root,'vendor','native','csboost-watcher.exe');fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/out:'+output,path.join(root,'src','free','native','WatcherWorker.cs')],{windowsHide:true,encoding:'utf8',timeout:30000});return output;
}
module.exports={buildWatcherWorker};if(require.main===module)console.log(buildWatcherWorker());
