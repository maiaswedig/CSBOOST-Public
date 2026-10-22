const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {PIN}=require('./vendor-presentmon.cjs');

const MAX_PRESENTMON_BYTES=64*1024*1024;

async function preparePresentMon({root=path.resolve(__dirname,'..'),fetchImpl=globalThis.fetch,pin=PIN}={}){
  if(typeof fetchImpl!=='function')throw Error('A API HTTPS não está disponível para baixar o PresentMon.');
  if(!pin||!/^[\w.-]{1,32}$/.test(pin.version)||!/^[\w.-]{1,100}$/.test(pin.file)||!/^[a-f0-9]{64}$/.test(pin.sha256))throw Error('Fixação do PresentMon inválida.');
  const source=new URL(pin.source);
  if(source.protocol!=='https:'||source.hostname!=='github.com')throw Error('A origem do PresentMon não corresponde ao repositório oficial fixado.');
  const directory=path.join(root,'vendor','presentmon',pin.version),target=path.join(directory,pin.file);
  try{
    const stat=fs.lstatSync(target);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_PRESENTMON_BYTES)throw Error('PresentMon existente não é um arquivo regular dentro do limite esperado.');
    const existing=fs.readFileSync(target);
    const digest=crypto.createHash('sha256').update(existing).digest('hex');
    if(digest!==pin.sha256)throw Error('PresentMon existente tem hash incorreto; recusando sobrescrever.');
    return {path:target,sha256:digest,downloaded:false};
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const response=await fetchImpl(pin.source,{redirect:'follow'});
  if(!response?.ok)throw Error(`Download oficial do PresentMon falhou (${response?.status??'sem resposta'}).`);
  const finalUrl=new URL(response.url||pin.source);
  if(finalUrl.protocol!=='https:')throw Error('O download do PresentMon foi redirecionado para uma origem não segura.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length===0||bytes.length>MAX_PRESENTMON_BYTES)throw Error('Tamanho do PresentMon fora do limite esperado.');
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(digest!==pin.sha256)throw Error('Hash SHA-256 do PresentMon não confere com a versão fixada.');
  fs.mkdirSync(directory,{recursive:true});
  const temporary=path.join(directory,`.${pin.file}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try{
    fs.writeFileSync(temporary,bytes,{flag:'wx'});
    fs.renameSync(temporary,target);
  }catch(error){
    try{fs.rmSync(temporary,{force:true});}catch{}
    if(error.code==='EEXIST'||error.code==='EPERM'){
      const current=fs.readFileSync(target),currentHash=crypto.createHash('sha256').update(current).digest('hex');
      if(currentHash===pin.sha256)return {path:target,sha256:currentHash,downloaded:false};
    }
    throw error;
  }
  return {path:target,sha256:digest,downloaded:true};
}

module.exports={preparePresentMon};
if(require.main===module)preparePresentMon().then(result=>process.stdout.write(`${result.downloaded?'Downloaded and verified':'Already verified'} PresentMon ${PIN.version}: ${result.sha256}\n${result.path}\n`)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
