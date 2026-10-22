const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {root,readJson,sha,check,psQuote,verifyDistribution,execFileSync}=require('./distribution-package.cjs');
async function startup(directory,scenario){
  fs.mkdirSync(directory,{recursive:true});const env={...process.env,CSBOOST_VERIFICATION_DIR:directory};delete env.ELECTRON_RUN_AS_NODE;
  const executable=path.join(relocated,'CSBOOST.exe'),log=fs.openSync(path.join(directory,'startup.log'),'wx'),started=Date.now();
  const code=await new Promise((resolve,reject)=>{const child=spawn(executable,['--verify-free','--disable-gpu',...(scenario==='missing-steam-detector-simulation'?['--verify-no-steam']:[])],{cwd:relocated,env,windowsHide:true,stdio:['ignore',log,log]});const timer=setTimeout(()=>{child.kill();reject(Error('Relocated startup timed out.'));},45000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});}).finally(()=>fs.closeSync(log));
  const file=path.join(directory,'verification.json');check(fs.existsSync(file)&&fs.statSync(file).mtimeMs>=started,'No fresh relocated verification.');const result=readJson(file);
  check(code===0&&result.ok&&result.integrity?.verified&&result.scenario===scenario&&!result.consoleErrors.length&&!result.preloadErrors.length&&!result.failedLoads.length&&result.watcher?.running&&result.recoveryGuard?.available,'Relocated startup failed: '+(result.startupError||scenario));
  check(result.view.text.includes('CSBOOST '+release.version),'Relocated renderer version mismatch.');
  if(scenario==='missing-steam-detector-simulation')check(!result.steam.installed&&!result.steam.cs2Installed&&!result.localSteam.available,'Missing-Steam detector simulation failed.');
  return {scenario,ok:true,integrity:result.integrity,watcher:result.watcher.running,recovery:result.recoveryGuard.available,rendererErrors:result.consoleErrors.length,elapsedMs:Date.now()-started,userSettingsChanged:false,gameLaunched:false};
}
const version=readJson(path.join(root,'package.json')).version,zip=path.join(root,'output',`CSBOOST-${version}-Windows-x64.zip`),metadata=zip.replace(/\.zip$/,'-release.json'),release=readJson(metadata);
check(release.sha256===sha(zip)&&release.bytes===fs.statSync(zip).size,'Archive checksum mismatch.');
const qaRoot=path.join(root,'analysis','distribution-qa');fs.mkdirSync(qaRoot,{recursive:true});const target=fs.mkdtempSync(path.join(qaRoot,'Computador de teste — José ')),relocated=path.join(target,'CSBOOST');
(async()=>{
  // Check every ZIP entry before extraction, including case-insensitive aliases and symlinks.
  const command=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $archive=[System.IO.Compression.ZipFile]::OpenRead(${psQuote(zip)}); $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase); try { foreach($entry in $archive.Entries) { $name=$entry.FullName; if(!$name.StartsWith('CSBOOST/') -or $name.Contains('\\') -or $name.Contains(':') -or $name.Split('/') -contains '..' -or $name.Split('/') -contains '.' -or $name.Contains('//') -or !$seen.Add($name) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000 -or $entry.Length -gt 536870912) { throw 'Unsafe ZIP entry' } } } finally { $archive.Dispose() }; [System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(zip)},${psQuote(target)})`;
  execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:120000,stdio:'pipe'});
  const manifest=verifyDistribution(relocated);check(manifest.version===version&&sha(path.join(relocated,'DISTRIBUTION-MANIFEST.json'))===release.distributionManifestSHA256,'Relocated manifest mismatch.');
  const results=[];for(const scenario of ['normal-read-only','missing-steam-detector-simulation'])results.push(await startup(path.join(target,scenario),scenario));
  // Startup must keep the extracted installation unchanged; all state goes to isolated user data.
  verifyDistribution(relocated);
  const report={ok:true,version,archive:path.basename(zip),archiveSHA256:release.sha256,checkedAt:new Date().toISOString(),relocatedDirectory:relocated,files:manifest.files.length,hashMismatches:0,scenarios:results,scope:'Real extracted Windows x64 runtime, Unicode/spaces relocation, fresh isolated app data and read-only native diagnostics. Missing Steam is a detector simulation; no physical Intel/AMD cross-machine certification.',userSettingsChanged:false,gameLaunched:false,physicalCrossVendorValidation:false};
  fs.writeFileSync(path.join(root,'analysis','free-verification','distribution-package-qa.json'),JSON.stringify(report,null,2));
  Object.assign(release,{packageVerifiedAfterExtraction:true,packageVerification:'analysis/free-verification/distribution-package-qa.json',verifiedAt:report.checkedAt});fs.writeFileSync(metadata,JSON.stringify(release,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
