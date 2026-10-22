const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('./verify-preview3d-assets.cjs').verifyPreview3d(root);
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const name=process.argv[2]||'CSBOOST-Free';
if(!/^CSBOOST-Free(?:-[a-zA-Z0-9-]+)?$/.test(name))throw new Error('Invalid build name.');
const output=path.join(root,'output',name);
if(fs.existsSync(output))throw new Error('Build directory already exists. Supply a new CSBOOST-Free-NAME argument.');
const runtime=path.join(root,'vendor','electron-v44.4.3-win32-x64.zip');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(sha(runtime)!=='790a355b684d5c7cc8dc3cdd8c4cca7c4b2d054685427c7554a956879a82e70b')throw new Error('Electron hash mismatch.');
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(runtime)},${psQuote(output)})`],{windowsHide:true});
fs.renameSync(path.join(output,'electron.exe'),path.join(output,'CSBOOST.exe'));
fs.copyFileSync(path.join(output,'LICENSE'),path.join(output,'LICENSE-Electron.txt'));
const app=path.join(output,'resources','app');
fs.cpSync(path.join(root,'src','free'),app,{recursive:true});
fs.copyFileSync(require('./build-cpu.cjs').buildCpuWorker(root),path.join(app,'native','csboost-cpu.exe'));
fs.copyFileSync(require('./build-nvidia.cjs').buildNvidiaWorker(root),path.join(app,'native','csboost-nvidia.exe'));
fs.copyFileSync(require('./build-recovery.cjs').buildRecoveryGuard(root),path.join(app,'native','csboost-recovery.exe'));
fs.copyFileSync(require('./build-display.cjs').buildDisplayWorker(root),path.join(app,'native','csboost-display.exe'));
fs.copyFileSync(require('./build-watcher.cjs').buildWatcherWorker(root),path.join(app,'native','csboost-watcher.exe'));
fs.copyFileSync(require('./build-system.cjs').buildSystemWorker(root),path.join(app,'native','csboost-system.exe'));
fs.copyFileSync(require('./build-topology.cjs').buildTopologyWorker(root),path.join(app,'native','csboost-topology.exe'));
fs.copyFileSync(require('./build-frame.cjs').buildFrameWorker(root),path.join(app,'native','csboost-frame.exe'));
const presentMon=require('./vendor-presentmon.cjs').copyPresentMon(root,app);
const font=path.join(root,'vendor','inter','InterVariable.woff2');
if(sha(font)!=='693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3')throw new Error('Inter font hash mismatch.');
const fonts=path.join(app,'renderer','fonts');fs.mkdirSync(fonts,{recursive:true});
for(const file of ['Inter-Regular.woff2','Inter-SemiBold.woff2'])fs.copyFileSync(font,path.join(fonts,file));
fs.copyFileSync(path.join(root,'vendor','inter','OFL.txt'),path.join(fonts,'OFL.txt'));
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'csboost-free',productName:'CSBOOST',version,private:true,type:'module',main:'main.mjs',description:'CSBOOST — configurações e desempenho para CS2'},null,2));
const editor=path.join(root,'vendor','rcedit-x64.exe');
if(sha(editor)!=='3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a')throw new Error('Resource editor hash mismatch.');
const icon=path.join(root,'vendor','csboost-free.ico');
require('./create-free-icon.cjs').createIcon(icon);
fs.copyFileSync(icon,path.join(output,'resources','csboost.ico'));
execFileSync(editor,[path.join(output,'CSBOOST.exe'),'--set-version-string','ProductName','CSBOOST','--set-version-string','FileDescription','CSBOOST','--set-version-string','OriginalFilename','CSBOOST.exe','--set-version-string','InternalName','CSBOOST','--set-version-string','CompanyName','CSBOOST','--set-file-version',version,'--set-product-version',version,'--set-icon',icon],{windowsHide:true});
fs.copyFileSync(path.join(root,'docs','DISTRIBUICAO.md'),path.join(output,'LEIA-ME.md'));
fs.copyFileSync(path.join(root,'docs','COMO-USAR.txt'),path.join(output,'COMO-USAR.txt'));
const releaseDocs=path.join(output,'docs');fs.mkdirSync(releaseDocs,{recursive:true});
for(const file of ['COMPATIBILIDADE.md','FONTES-DE-DADOS.md','PRIVACIDADE.md','VERIFICACAO-1.30.0.md','CREDITOS.md'])fs.copyFileSync(path.join(root,'docs',file),path.join(releaseDocs,file));
const readme=path.join(output,'LEIA-ME.md');let readmeText=fs.readFileSync(readme,'utf8');
for(const file of ['COMPATIBILIDADE.md','FONTES-DE-DADOS.md','PRIVACIDADE.md'])readmeText=readmeText.replaceAll(`(${file})`,`(docs/${file})`);
fs.writeFileSync(readme,readmeText);
for(const [source,target] of [['LICENSE','LICENSE-CSBOOST.txt'],['NOTICE','NOTICE-CSBOOST.txt']])if(fs.existsSync(path.join(root,source)))fs.copyFileSync(path.join(root,source),path.join(output,target));
for(const file of ['LICENSE','NOTICE'])fs.copyFileSync(path.join(root,file),path.join(output,file));
fs.copyFileSync(path.join(root,'docs','DEPENDENCIAS.md'),path.join(output,'DEPENDENCIAS.md'));
const thirdPartyNotices=[
  {component:'Intel PresentMon console',version:presentMon.version,license:'MIT',assetSHA256:presentMon.sha256,source:presentMon.source,licenseFiles:['resources/app/licenses/PresentMon-MIT.txt','resources/app/licenses/PresentMon-PROVENANCE.json']},
  {component:'Electron / bundled Chromium and Node dependencies',version:'44.4.3',licenseFiles:['LICENSE-Electron.txt','LICENSES.chromium.html']},
  {component:'Inter',license:'OFL-1.1',assetSHA256:sha(font),licenseFiles:['resources/app/renderer/fonts/OFL.txt']},
  {component:'NVIDIA NVAPI public header definitions',license:'MIT',commit:'70d337db9186e968eab622f7e786de7e437faf3d',licenseFiles:['resources/app/licenses/NVAPI-MIT.txt']},
  {component:'akiver/csgo-sharecode adapted codec',version:'7.0.1',license:'MIT',commit:'139b9e284756110b44a894331f285b0ddabdf6ef',licenseFiles:['resources/app/licenses/csgo-sharecode-MIT.txt']},
  {component:'three.js and GLTFLoader',version:'0.180.0',license:'MIT',licenseFiles:['resources/app/licenses/three-MIT.txt']},
  {component:'Independent first-person preview model',license:'CC-BY-4.0 / upstream CC0 components',provenance:'resources/app/renderer/assets/preview-distribution-provenance.json',licenseFiles:['resources/app/licenses/preview3d-CREDITS.txt','resources/app/licenses/CC-BY-4.0.txt']}
].map(({licenseFiles,...component})=>({...component,notices:licenseFiles.map(file=>{const target=path.join(output,file);if(!fs.statSync(target).isFile())throw Error('Missing third-party notice: '+file);return {path:file,sha256:sha(target)};})}));
const expectedWorkers=['csboost-cpu.exe','csboost-display.exe','csboost-frame.exe','csboost-nvidia.exe','csboost-recovery.exe','csboost-system.exe','csboost-topology.exe','csboost-watcher.exe'];
const ownWorkers=fs.readdirSync(path.join(app,'native')).filter(file=>/^csboost-.*\.exe$/i.test(file)).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
if(JSON.stringify(ownWorkers.map(file=>file.toLowerCase()))!==JSON.stringify(expectedWorkers.slice().sort().map(file=>file.toLowerCase())))throw new Error('Expected exactly eight CSBOOST native workers before signing.');
const signingFiles=[path.join(output,'CSBOOST.exe'),...ownWorkers.map(file=>path.join(app,'native',file))];
const codeSigning=require('./sign-free.cjs').signBuild({directory:output,files:signingFiles});
if(codeSigning.signed&&codeSigning.files.length!==9)throw new Error('All nine CSBOOST executables must be signed and verified before writing the manifest.');
const files=[];function inventory(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())inventory(file);else files.push({path:path.relative(app,file).replaceAll('\\','/'),sha256:sha(file)});}}inventory(app);
fs.writeFileSync(path.join(output,'build-manifest.json'),JSON.stringify({product:'CSBOOST',edition:'independent-free',version,builtAt:new Date().toISOString(),runtime:'44.4.3',executableSHA256:sha(path.join(output,'CSBOOST.exe')),codeSigning,thirdPartyNotices,files,originalCSClientCodeIncluded:false,originalCSClientVisualReferenceIncluded:false,distributionAssetsReviewed:true,originalServicesUsed:false},null,2));
console.log(JSON.stringify({executable:path.join(output,'CSBOOST.exe'),files:files.length,edition:'independent-free'}));
