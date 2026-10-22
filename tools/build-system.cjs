const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function buildSystemWorker(root=path.resolve(__dirname,'..')){
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  const output=path.join(root,'vendor','native','csboost-system.exe');fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Management.dll','/reference:System.Core.dll','/out:'+output,path.join(root,'src','free','native','SystemWorker.cs')],{windowsHide:true,timeout:30000});return output;
}
module.exports={buildSystemWorker};if(require.main===module)console.log(buildSystemWorker());
