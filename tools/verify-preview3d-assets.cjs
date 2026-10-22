const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function verifyPreview3d(root){
 const directory=path.join(root,'src','free'),manifestFile=path.join(directory,'renderer/assets/preview3d-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(sha(fs.readFileSync(manifestFile))!=='41486cad2e529f0ea96fd60f89201f2e73fe6519ab2282ecea21dd3de0969037')throw Error('3D lock manifest hash mismatch');
 if(manifest.version!==3||manifest.distributionReady!==true||manifest.originalCSClientAssets!==false||manifest.three!=='0.180.0'||manifest.models.length!==1||manifest.files.length!==11||new Set(manifest.files.map(f=>f.path)).size!==11)throw Error('Invalid 3D asset inventory');
 for(const file of manifest.files){const target=path.resolve(directory,file.path);if(!target.startsWith(directory+path.sep)||!fs.lstatSync(target).isFile()||fs.lstatSync(target).isSymbolicLink()||sha(fs.readFileSync(target))!==file.sha256)throw Error('3D asset hash mismatch: '+file.path);}
 const source=fs.readFileSync(path.join(directory,'renderer/assets/preview-model.js'),'utf8'),prefix='window.CSBoostModelsBase64=',index=source.indexOf(prefix);if(index<0)throw Error('Missing local 3D payload');
 const models=JSON.parse(source.slice(index+prefix.length).trim().replace(/;$/,''));let bytes=0,skins=0,meshes=0;
 for(let i=0;i<models.length;i++){const data=Buffer.from(models[i],'base64');if(sha(data)!==manifest.models[i].sha256||data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw Error('Invalid local 3D model');const j=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)));if(j.animations||!j.skins?.length||!j.meshes?.length||j.buffers?.length!==1||j.buffers.some(b=>b.uri)||j.images.some(image=>image.uri)||j.extensionsRequired?.includes('EXT_meshopt_compression'))throw Error('3D payload is not self-contained static rig');bytes+=data.length;skins+=j.skins.length;meshes+=j.meshes.length;}
 if(manifest.models[0].sha256!=='bd6bf07cf17db7c69329d0b3c2886acd92352bbc441104dccec63e252278f0b6')throw Error('Unexpected licensed model identity');
 if(manifest.files.find(file=>file.path==='renderer/assets/preview-weapon-fallback.png')?.sha256==='e0294d21bdabd04e03fa0d733e3b01d9eb15a69f7e266c4592855b14d7404f86')throw Error('Personal reference fallback cannot be redistributed');
 return {distributionReady:true,originalCSClientAssets:false,files:manifest.files.length,modelBytes:bytes,skins,meshes,offline:true};
}
module.exports={verifyPreview3d};
