const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const check=(value,message)=>{if(!value)throw Error(message);};
const psQuote=value=>"'"+String(value).replaceAll("'","''")+"'";
function inventory(directory){
  const result=[];
  function walk(current){for(const name of fs.readdirSync(current).sort()){const file=path.join(current,name),stat=fs.lstatSync(file);check(!stat.isSymbolicLink(),'Linked distribution file: '+file);if(stat.isDirectory())walk(file);else{check(stat.isFile(),'Non-regular distribution file: '+file);result.push({path:path.relative(directory,file).replaceAll('\\','/'),size:stat.size,sha256:sha(file)});}}}
  walk(directory);return result;
}
function buildDirectory(name){check(/^CSBOOST-Free-[A-Za-z0-9-]+$/.test(name??''),'Supply a new packaged build name.');return path.join(root,'output',name);}
function verifyBuild(name){
  const build=buildDirectory(name),app=path.join(build,'resources','app'),manifest=readJson(path.join(build,'build-manifest.json')),version=readJson(path.join(root,'package.json')).version;
  check(manifest.product==='CSBOOST'&&manifest.version===version&&readJson(path.join(app,'package.json')).version===version,'Release version mismatch.');
  check(manifest.originalCSClientCodeIncluded===false&&manifest.originalCSClientVisualReferenceIncluded===false&&manifest.originalServicesUsed===false&&manifest.distributionAssetsReviewed===true,'Release origins are not approved for sharing.');
  check(manifest.executableSHA256===sha(path.join(build,'CSBOOST.exe')),'Executable hash mismatch.');
  const actual=inventory(app),listed=manifest.files.map(item=>({path:item.path,sha256:item.sha256})).sort((a,b)=>a.path.localeCompare(b.path)),observed=actual.map(({path,sha256})=>({path,sha256})).sort((a,b)=>a.path.localeCompare(b.path));
  check(JSON.stringify(listed)===JSON.stringify(observed),'App manifest mismatch.');
  for(const file of inventory(path.join(root,'src','free')))check(sha(path.join(app,file.path))===file.sha256,'Stale packaged source: '+file.path);
  const expectedWorkers=['cpu','display','frame','nvidia','recovery','system','topology','watcher'].map(name=>'native/csboost-'+name+'.exe').sort();
  const presentMon='native/PresentMon-2.3.1-x64.exe';
  check(JSON.stringify(actual.filter(item=>item.path.endsWith('.exe')).map(item=>item.path).sort())===JSON.stringify([...expectedWorkers,presentMon].sort()),'Native component inventory mismatch.');
  for(const worker of expectedWorkers)check(sha(path.join(app,worker))===sha(path.join(root,'vendor','native',path.basename(worker))),'Native build mismatch.');
  const presentMonPin=require('./vendor-presentmon.cjs').PIN;
  check(sha(path.join(app,presentMon))===presentMonPin.sha256,'Pinned PresentMon binary mismatch.');
  for(const [source,target] of [['docs/COMO-USAR.txt','COMO-USAR.txt'],['docs/DEPENDENCIAS.md','DEPENDENCIAS.md'],['LICENSE','LICENSE-CSBOOST.txt'],['NOTICE','NOTICE-CSBOOST.txt'],['LICENSE','LICENSE'],['NOTICE','NOTICE'],['docs/COMPATIBILIDADE.md','docs/COMPATIBILIDADE.md'],['docs/FONTES-DE-DADOS.md','docs/FONTES-DE-DADOS.md'],['docs/PRIVACIDADE.md','docs/PRIVACIDADE.md'],['docs/VERIFICACAO-1.30.0.md','docs/VERIFICACAO-1.30.0.md'],['docs/CREDITOS.md','docs/CREDITOS.md']])check(sha(path.join(root,source))===sha(path.join(build,target)),'Stale distribution guide: '+target);
  let releaseGuide=fs.readFileSync(path.join(root,'docs/DISTRIBUICAO.md'),'utf8');for(const file of ['COMPATIBILIDADE.md','FONTES-DE-DADOS.md','PRIVACIDADE.md'])releaseGuide=releaseGuide.replaceAll(`(${file})`,`(docs/${file})`);
  check(crypto.createHash('sha256').update(releaseGuide).digest('hex')===sha(path.join(build,'LEIA-ME.md')),'Stale distribution guide: LEIA-ME.md');
  check(sha(path.join(build,'LICENSE-Electron.txt'))==='5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d','Original Electron copyright notice is missing.');
  check(manifest.thirdPartyNotices?.length===7,'Missing third-party notices.');
  for(const component of manifest.thirdPartyNotices)for(const notice of component.notices)check(sha(path.join(build,notice.path))===notice.sha256,'Third-party notice mismatch.');
  const preview=require('./verify-preview3d-assets.cjs').verifyPreview3d(root);
  const files=inventory(build);
  for(const file of files){
    check(!/(?:^|\/)(?:analysis|tests|vendor|profiles|userdata|logs|benchmark-runs|content-cache)\/|(?:^|\/)(?:steam-session\.json|cs2_video\.txt)|\.(?:log|vcfg|cfg|pfx|pem|key)$/i.test(file.path),'Private or test file in package: '+file.path);
    if(/\.(?:mjs|cjs|js|html|json|md|txt)$/i.test(file.path)&&file.size<32*1024*1024){const text=fs.readFileSync(path.join(build,file.path),'utf8');check(!/C:[\\/]+Users[\\/]+[^\\/]+/i.test(text),'Personal workspace path: '+file.path);check(!/https?:\/\/[^\s/"']*csclient/i.test(text),'Original private service endpoint: '+file.path);check(![...text.matchAll(/\b7656119\d{10}\b/g)].some(match=>match[0]!=='76561197960265728'),'Embedded Steam identity: '+file.path);}
  }
  return {build,app,manifest,version,files,preview};
}
function verifyDistribution(directory){
  const manifest=readJson(path.join(directory,'DISTRIBUTION-MANIFEST.json'));
  check(manifest.format==='csboost-distribution'&&manifest.product==='CSBOOST'&&Array.isArray(manifest.files)&&manifest.files.length>100&&manifest.files.length<2000,'Invalid distribution manifest.');
  const seen=new Set();for(const item of manifest.files){check(typeof item.path==='string'&&!item.path.includes('\\')&&!item.path.includes(':')&&!item.path.split('/').some(part=>!part||part==='.'||part==='..')&&/^[a-f\d]{64}$/.test(item.sha256)&&Number.isSafeInteger(item.size)&&item.size>=0&&!seen.has(item.path.toLowerCase()),'Invalid distribution entry.');seen.add(item.path.toLowerCase());}
  const actual=inventory(directory).filter(item=>item.path!=='DISTRIBUTION-MANIFEST.json');
  check(JSON.stringify(actual.sort((a,b)=>a.path.localeCompare(b.path)))===JSON.stringify([...manifest.files].sort((a,b)=>a.path.localeCompare(b.path))),'Extracted distribution inventory/hash mismatch.');
  return manifest;
}
module.exports={root,readJson,sha,check,psQuote,inventory,buildDirectory,verifyBuild,verifyDistribution,execFileSync};
