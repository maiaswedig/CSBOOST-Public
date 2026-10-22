import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),vendor=path.join(root,'vendor','preview3d'),renderer=path.join(root,'src','free','renderer');
await fs.mkdir(vendor,{recursive:true});await fs.mkdir(path.join(renderer,'lib','three'),{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const download=async(url,file)=>{const response=await fetch(url);if(!response.ok)throw Error('Download failed: '+response.status+' '+url);const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(file,bytes);return bytes;};
const extract=async(archive,member,target)=>{const bytes=execFileSync('tar.exe',['-xOf',archive,member],{maxBuffer:16*1024*1024,windowsHide:true});await fs.writeFile(target,bytes);};
for(const [name,version,integrity]of [['three','0.180.0','o+qycAMZrh+TsE01GqWUxUIKR1AL0S8pq7zDkYOQw8GqfX8b8VoCKYUoHbhiX5j+7hr8XsuHDVU6+gkQJQKg9w=='],['meshoptimizer','0.25.0','ewwuAo3ujPZ7T3Y2oTkEoLlXvNOqnr0cjyAxfv5djXJqwD9QlxDDO0qGtsqB4Z9QUVvhruKXg9q/xfK9I5S1xQ==']]){
  const archive=path.join(vendor,name+'-'+version+'.tgz'),bytes=await download('https://registry.npmjs.org/'+name+'/-/'+name+'-'+version+'.tgz',archive);
  if(crypto.createHash('sha512').update(bytes).digest('base64')!==integrity)throw Error('Package integrity mismatch: '+name);
  const files=name==='three'?['build/three.core.min.js','build/three.module.min.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/utils/BufferGeometryUtils.js','LICENSE']:['meshopt_decoder.module.js','LICENSE.md'];
  for(const file of files)await extract(archive,'package/'+file,path.join(vendor,path.basename(file)));
}
for(const file of ['three.core.min.js','three.module.min.js','BufferGeometryUtils.js']){
  let text=await fs.readFile(path.join(vendor,file),'utf8');text=text.replaceAll("from 'three'","from './three.module.min.js'");await fs.writeFile(path.join(renderer,'lib','three',file),text);
}
let loader=await fs.readFile(path.join(vendor,'GLTFLoader.js'),'utf8');
loader=loader.replaceAll("from 'three'","from './three.module.min.js'").replaceAll("'../utils/BufferGeometryUtils.js'","'./BufferGeometryUtils.js'");
// Keep local GLB textures on HTML image loading (img-src blob:) rather than fetch/blob under connect-src none.
loader=loader.replace("typeof createImageBitmap === 'undefined'","true /* CSBOOST: local image loader under connect-src none */");
await fs.writeFile(path.join(renderer,'lib','three','GLTFLoader.js'),loader);
await fs.mkdir(path.join(root,'src','free','licenses'),{recursive:true});await fs.copyFile(path.join(vendor,'LICENSE'),path.join(root,'src','free','licenses','three-MIT.txt'));
const commit='130ac2a5c856401ec36e7d35afcfefe40c5801f4',base='https://raw.githubusercontent.com/cktang88/3d-fps/'+commit+'/public/assets/models/fp/';
const original=await download(base+'ak47.glb',path.join(vendor,'ak47-upstream.glb')),jsonSize=original.readUInt32LE(12),gltf=JSON.parse(original.subarray(20,20+jsonSize).toString()),binOffset=20+jsonSize,bin=original.subarray(binOffset+8,binOffset+8+original.readUInt32LE(binOffset));
if(sha(original)!=='8dbf4a8eaa22a1b79a227fb85a19e99fc01238e174e31a941d8bacafcb1e6c65')throw Error('Upstream model hash mismatch');
const decoder=(await import(pathToFileURL(path.join(vendor,'meshopt_decoder.module.js')).href)).MeshoptDecoder;await decoder.ready;
let parts=[bin],size=bin.length;const add=bytes=>{const padding=Buffer.alloc((4-size%4)%4);parts.push(padding);size+=padding.length;const offset=size;parts.push(bytes);size+=bytes.length;return offset;};
let decoded=0;
for(const view of gltf.bufferViews){const ext=view.extensions?.EXT_meshopt_compression;if(!ext)continue;if(ext.buffer!==0)throw Error('Unexpected compressed buffer');const data=new Uint8Array(ext.count*ext.byteStride);decoder.decodeGltfBuffer(data,ext.count,ext.byteStride,bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);view.buffer=0;view.byteOffset=add(Buffer.from(data));view.byteLength=data.length;delete view.extensions.EXT_meshopt_compression;if(!Object.keys(view.extensions).length)delete view.extensions;decoded++;}
const externalImages=[];
for(const image of gltf.images??[]){if(!image.uri)continue;if(!['arms_basecolor.webp','arms_normal.webp'].includes(image.uri))throw Error('Unexpected external model resource');const bytes=await download(base+image.uri,path.join(vendor,image.uri));externalImages.push({file:image.uri,sha256:sha(bytes)});image.bufferView=gltf.bufferViews.push({buffer:0,byteOffset:add(bytes),byteLength:bytes.length})-1;delete image.uri;}
delete gltf.animations;
gltf.extensionsRequired=gltf.extensionsRequired?.filter(name=>name!=='EXT_meshopt_compression');gltf.extensionsUsed=gltf.extensionsUsed?.filter(name=>name!=='EXT_meshopt_compression');
gltf.buffers=[{byteLength:size}];
const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,32),binary=Buffer.concat(parts),binaryPad=Buffer.alloc((4-binary.length%4)%4),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+jsonPad.length+8+binary.length+binaryPad.length,8);jsonHeader.writeUInt32LE(json.length+jsonPad.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(binary.length+binaryPad.length);binHeader.writeUInt32LE(0x004e4942,4);
const packed=Buffer.concat([header,jsonHeader,json,jsonPad,binHeader,binary,binaryPad]);await fs.writeFile(path.join(vendor,'ak47-preview.glb'),packed);
await fs.writeFile(path.join(renderer,'assets','preview-model.js'),'// Licensed independent 3D model, no executable payload. Provenance: licenses/preview3d-CREDITS.txt\nwindow.CSBoostModelBase64='+JSON.stringify(packed.toString('base64'))+';\n');
const report={source:base+'ak47.glb',commit,upstreamSHA256:sha(original),packedSHA256:sha(packed),bytes:packed.length,externalImages,decodedBufferViews:decoded,changes:['Mesh compression decoded at build preparation; no runtime decoder/WASM','External textures embedded; no network loader','Animation clips removed; static rig retained'],thirdPartyModel:true,originalCSClientAssets:false};
await fs.writeFile(path.join(vendor,'provenance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
