import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Corruption/completeness check, not a substitute for Authenticode or a trusted download.
export async function verifyReleaseIntegrity({appRoot,manifestPath,version}) {
  const root=path.resolve(appRoot),stat=await fs.lstat(manifestPath);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('Manifesto de instalação inválido. Extraia novamente o pacote completo.');
  const bytes=await fs.readFile(manifestPath),manifest=JSON.parse(bytes.toString('utf8'));
  if(manifest.product!=='CSBOOST'||manifest.version!==version||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>512)throw Error('Os arquivos pertencem a versões diferentes do CSBOOST. Extraia a atualização em uma pasta nova.');
  const seen=new Set();
  for(const item of manifest.files){
    if(!item||typeof item.path!=='string'||item.path.includes('\\')||item.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f\d]{64}$/.test(item.sha256)||seen.has(item.path.toLowerCase()))throw Error('Inventário de instalação inválido.');
    seen.add(item.path.toLowerCase());const target=path.resolve(root,item.path);
    if(!target.startsWith(root+path.sep))throw Error('Inventário de instalação fora da pasta do aplicativo.');
    let current=root;for(const part of item.path.split('/')){current=path.join(current,part);const entry=await fs.lstat(current);if(entry.isSymbolicLink())throw Error('A instalação contém arquivos redirecionados. Extraia novamente o pacote.');}
    const info=await fs.lstat(target);if(!info.isFile()||info.size>32*1024*1024)throw Error('Arquivo da instalação inválido.');
    const digest=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
    if(digest!==item.sha256)throw Error('Arquivo incompleto ou alterado: '+item.path+'. Extraia novamente o pacote completo.');
  }
  for(const file of ['main.mjs','preload.cjs','renderer/index.html','package.json',...['cpu','display','nvidia','recovery','system','watcher'].map(name=>'native/csboost-'+name+'.exe')])if(!seen.has(file))throw Error('Componente obrigatório ausente do pacote: '+file);
  async function inventory(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isSymbolicLink())throw Error('A instalação contém arquivos redirecionados.');if(entry.isDirectory())await inventory(target);else if(!seen.has(path.relative(root,target).replaceAll('\\','/').toLowerCase()))throw Error('Arquivos de versões diferentes na mesma pasta. Extraia o pacote em uma pasta nova.');}}
  await inventory(root);
  return {verified:true,files:manifest.files.length,manifestSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),authenticityVerified:false};
}
