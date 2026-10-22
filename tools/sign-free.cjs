const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Store certificate thumbprints are public identifiers. No PFX/password or
// download is accepted; signing is opt-in and confined to this new build.
function signBuild({directory,files,env=process.env,run=execFileSync}){
  const tool=env.CSBOOST_SIGNTOOL,certificate=env.CSBOOST_SIGN_CERT_SHA1,timestamp=env.CSBOOST_SIGN_TIMESTAMP_URL;
  if(!tool&&!certificate&&!timestamp)return {configured:false,signed:false,reason:'Certificado de assinatura não configurado.'};
  if(!tool||!path.isAbsolute(tool)||path.basename(tool).toLowerCase()!=='signtool.exe'||fs.lstatSync(tool).isSymbolicLink()||!fs.lstatSync(tool).isFile())throw Error('Configure o caminho absoluto de signtool.exe.');
  if(!/^[a-f\d]{40}$/i.test(certificate||''))throw Error('Configure o thumbprint SHA-1 do certificado no repositório pessoal do Windows.');
  if(!timestamp)throw Error('Configure CSBOOST_SIGN_TIMESTAMP_URL para assinar com carimbo de tempo RFC 3161.');
  let url;try{url=new URL(timestamp);}catch{throw Error('URL de timestamp inválida.');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('O timestamp exige HTTPS sem credenciais.');
  if(!Array.isArray(files)||files.length===0)throw Error('Informe os executáveis próprios da nova build para assinatura.');
  const root=path.resolve(directory);
  const rootStat=fs.lstatSync(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw Error('A pasta da nova build precisa ser um diretório regular.');
  const realRoot=fs.realpathSync(root);
  const targets=files.map(file=>{
    const absolute=path.resolve(file),relative=path.relative(root,absolute);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||path.extname(absolute).toLowerCase()!=='.exe')throw Error('Alvo de assinatura fora da nova build.');
    const stat=fs.lstatSync(absolute);
    if(stat.isSymbolicLink()||!stat.isFile())throw Error('Alvo de assinatura fora da nova build.');
    if(stat.nlink>1)throw Error('Alvo de assinatura possui hard link fora da build.');
    const realRelative=path.relative(realRoot,fs.realpathSync(absolute));
    if(realRelative!==relative)throw Error('Alvo de assinatura redirecionado.');
    return {absolute,path:relative.replaceAll('\\','/'),unsignedSHA256:sha(absolute)};
  });
  if(new Set(targets.map(row=>row.absolute.toLowerCase())).size!==targets.length)throw Error('Alvos de assinatura duplicados.');
  for(const row of targets){
    const args=['sign','/fd','SHA256','/s','My','/sha1',certificate];
    args.push('/tr',timestamp,'/td','SHA256');
    run(tool,[...args,row.absolute],{windowsHide:true,shell:false,stdio:'pipe',timeout:120000});
    run(tool,['verify','/pa',row.absolute],{windowsHide:true,shell:false,stdio:'pipe',timeout:30000});
    row.signedSHA256=sha(row.absolute);
    if(row.signedSHA256===row.unsignedSHA256)throw Error('A assinatura não alterou o executável.');
  }
  return {configured:true,signed:true,certificateSHA1:certificate.toUpperCase(),digest:'SHA256',timestamp,verification:'signtool verify /pa',files:targets.map(({absolute,...row})=>row)};
}
module.exports={signBuild};
