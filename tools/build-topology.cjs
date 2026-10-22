const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function buildTopologyWorker(root=path.resolve(__dirname,'..')){
  if(process.platform!=='win32')throw Error('O diagnóstico de topologia é compilado no Windows.');
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
  if(!fs.existsSync(compiler))throw Error('Compilador .NET Framework x64 indisponível.');
  const target=path.join(root,'vendor','native','csboost-topology.exe');fs.mkdirSync(path.dirname(target),{recursive:true});
  execFileSync(compiler,['/nologo','/target:exe','/platform:x64','/optimize+','/reference:System.Web.Extensions.dll','/reference:System.Core.dll','/out:'+target,path.join(root,'src','free','native','TopologyWorker.cs')],{windowsHide:true,encoding:'utf8',timeout:30000});return target;
}
module.exports={buildTopologyWorker};if(require.main===module)console.log(buildTopologyWorker());
