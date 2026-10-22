const fs=require('node:fs'),path=require('node:path');
const {root,readJson,sha,check,verifyBuild}=require('./distribution-package.cjs');
const {fingerprint,requireCurrent}=require('./verification-evidence.cjs');
const name=process.argv[2];
const {build,manifest,version,files}=verifyBuild(name);
const reports=path.join(root,'analysis','free-verification');
const verification=readJson(path.join(reports,name,'verification.json'));
const ui=readJson(path.join(root,'analysis','free-ui-qa','results.json'));
const currentFingerprint=fingerprint(),testEvidence=readJson(path.join(reports,'node-tests-evidence.json'));
requireCurrent(testEvidence,currentFingerprint,'node-tests');requireCurrent(ui.evidence,currentFingerprint,'electron-ui');
check(testEvidence.version===version&&testEvidence.logSHA256===sha(path.join(reports,'node-tests.log')),'Node test report does not match its evidence.');
const tests=testEvidence.tests;
check(tests.total>=500&&tests.passed>0&&tests.failed===0&&tests.cancelled===0,'Node test suite did not pass.');
check(verification.ok&&verification.consoleCaptureVerified===true&&verification.integrity?.verified&&verification.scenario==='normal-read-only'&&verification.view?.text?.includes('CSBOOST '+version)&&!verification.consoleErrors.length&&!verification.preloadErrors.length&&!verification.failedLoads.length&&!verification.network.length,'Packaged startup verification failed.');
check(verification.integrity.files===manifest.files.length&&verification.integrity.manifestSHA256===sha(path.join(build,'build-manifest.json')),'Startup verification is for a different build.');
check(ui.ok&&ui.checks?.length>=100&&ui.consoleCaptureVerified===true&&!ui.rendererErrors?.length,'Electron interface/IPC integration failed.');
let distributionPackageQA=null;
const distributionReportPath=path.join(reports,'distribution-package-qa.json');
const archive=path.join(root,'output',`CSBOOST-${version}-Windows-x64.zip`),releasePath=path.join(root,'output',`CSBOOST-${version}-Windows-x64-release.json`);
if(fs.existsSync(distributionReportPath)&&fs.existsSync(archive)&&fs.existsSync(releasePath)){
  const candidate=readJson(distributionReportPath),release=readJson(releasePath);
  const sameBuild=release.build===name&&candidate.scenarios?.every(row=>row.integrity?.manifestSHA256===sha(path.join(build,'build-manifest.json')));
  if(sameBuild){
    check(candidate.ok&&candidate.version===version&&candidate.hashMismatches===0&&candidate.archiveSHA256===sha(archive)&&release.packageVerifiedAfterExtraction===true&&release.sha256===candidate.archiveSHA256,'Extracted package verification is stale or incomplete.');
    check(candidate.scenarios.length===2&&candidate.scenarios.every(row=>row.ok&&row.userSettingsChanged===false&&row.gameLaunched===false),'Extracted package scenario failed.');
    distributionPackageQA={ok:true,archiveSHA256:candidate.archiveSHA256,files:candidate.files,hashMismatches:candidate.hashMismatches,scenarios:candidate.scenarios.map(row=>({scenario:row.scenario,ok:row.ok,rendererErrors:row.rendererErrors,userSettingsChanged:row.userSettingsChanged,gameLaunched:row.gameLaunched})),userSettingsChanged:candidate.userSettingsChanged,gameLaunched:candidate.gameLaunched};
  }
}
if(process.argv.includes('--require-package'))check(distributionPackageQA?.ok===true,'This exact build has not passed extracted-package verification.');

const audit={ok:true,version,build:name,checkedAt:new Date().toISOString(),executableSHA256:manifest.executableSHA256,buildManifestSHA256:sha(path.join(build,'build-manifest.json')),packagedFiles:manifest.files.length,distributionFiles:files.length,sourceHashesVerified:true,hashMismatches:0,personalOrTestFilesIncluded:false,privateOriginalServicesUsed:false,originalVisualAssetsIncluded:false,tests,renderer:{checks:ui.checks.length,errors:ui.rendererErrors.length},packagedStartup:{ok:true,integrity:verification.integrity,networkRequests:verification.network.length,watcher:verification.watcher?.running===true,recovery:verification.recoveryGuard?.available===true},codeSigning:manifest.codeSigning,packageVerifiedAfterExtraction:distributionPackageQA?.ok===true,distributionPackageQA,firmwareWritesPerformed:false,userSettingsChanged:false,gameLaunched:false,fpsGainMeasured:false,physicalCrossVendorValidation:false,pendingScope:['Hosted Windows/Linux CI is not connected to this local copy','Public-data terms review and hardware certification remain open release gates']};
fs.writeFileSync(path.join(reports,'distribution-build-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify({ok:audit.ok,version,build:name,packagedFiles:audit.packagedFiles,tests,rendererChecks:audit.renderer.checks,executableSHA256:audit.executableSHA256},null,2));
