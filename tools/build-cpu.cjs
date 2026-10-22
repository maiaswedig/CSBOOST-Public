const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function buildCpuWorker(root=path.resolve(__dirname,'..')){
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  if(!fs.existsSync(compiler))throw new Error('O compilador .NET Framework x64 não está disponível para o worker CPU.');
  const output=path.join(root,'vendor','native','csboost-cpu.exe');fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/out:'+output,path.join(root,'src','free','native','CpuWorker.cs')],{windowsHide:true,encoding:'utf8',timeout:30000});return output;
}
module.exports={buildCpuWorker};if(require.main===module)console.log(buildCpuWorker());
