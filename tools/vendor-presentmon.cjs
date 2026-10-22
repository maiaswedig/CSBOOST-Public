const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PIN=Object.freeze({version:'2.3.1',file:'PresentMon-2.3.1-x64.exe',sha256:'364e5d98d4d134bd54dd25c22ed2ca2f4883f8bc3ed6502bee0c151e3436d30c',publishedAt:'2025-06-10T08:45:40Z',source:'https://github.com/GameTechDev/PresentMon/releases/download/v2.3.1/PresentMon-2.3.1-x64.exe'});
function copyPresentMon(root,app){
  if(Date.now()-Date.parse(PIN.publishedAt)<14*86400000)throw Error('PresentMon release must be at least 14 days old.');
  const vendor=path.join(root,'vendor','presentmon',PIN.version),binary=path.join(vendor,PIN.file),sha=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  if(sha!==PIN.sha256)throw Error('PresentMon official binary hash mismatch.');
  const source=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
  if(source.source!==PIN.source||source.sha256!==PIN.sha256||source.upstreamDigest!=='sha256:'+PIN.sha256||source.signatureStatus!=='Valid'||!source.signer.includes('Intel Corporation'))throw Error('Missing verified PresentMon provenance.');
  fs.mkdirSync(path.join(app,'native'),{recursive:true});fs.mkdirSync(path.join(app,'licenses'),{recursive:true});
  fs.copyFileSync(binary,path.join(app,'native',PIN.file));fs.copyFileSync(path.join(vendor,'LICENSE.txt'),path.join(app,'licenses','PresentMon-MIT.txt'));
  fs.writeFileSync(path.join(app,'licenses','PresentMon-PROVENANCE.json'),JSON.stringify({...PIN,signatureAtAcquisition:{status:source.signatureStatus,signer:source.signer},component:'console only; no service, overlay or injection component'},null,2));
  return PIN;
}
module.exports={PIN,copyPresentMon};
