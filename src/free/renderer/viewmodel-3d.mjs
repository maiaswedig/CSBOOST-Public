import * as THREE from './lib/three/three.module.min.js';
import {GLTFLoader} from './lib/three/GLTFLoader.js';
let active=null,bytesPromise=null;
const counters={created:0,disposed:0,frames:0,liveContexts:0};
function modelBytes(){
  return bytesPromise??=new Promise((resolve,reject)=>{
    const decode=()=>{try{const models=window.CSBoostModelsBase64.map(encoded=>{const text=atob(encoded),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return bytes.buffer;});delete window.CSBoostModelsBase64;resolve(models);}catch(error){reject(error);}};
    const script=document.createElement('script');script.src='./assets/preview-model.js';script.onload=()=>{decode();script.remove();};script.onerror=()=>{script.remove();reject(Error('Modelo local indisponível.'));};document.head.append(script);
  });
}
function disposeModel(root){const seen=new Set();root?.traverse(object=>{if(object.geometry&&!seen.has(object.geometry)){seen.add(object.geometry);object.geometry.dispose();}for(const material of Array.isArray(object.material)?object.material:[object.material]){if(!material||seen.has(material))continue;seen.add(material);for(const value of Object.values(material))if(value?.isTexture&&!seen.has(value)){seen.add(value);value.source?.data?.close?.();value.dispose();}material.dispose();}});}
function setStatus(instance,status,message){const box=instance.box;if(!box?.isConnected)return;box.dataset.renderer=status;if(status==='3d')delete box.dataset.previewError;box.querySelector('.preview-live').textContent=message;box.querySelector('.preview-weapon-image').hidden=status==='3d';}
function release(){
  const instance=active;if(!instance)return;active=null;instance.disposed=true;instance.resize.disconnect();instance.intersection.disconnect();
  instance.canvas.removeEventListener('webglcontextlost',instance.lost);disposeModel(instance.model);instance.environment.dispose();instance.renderer.dispose();instance.renderer.forceContextLoss();instance.canvas.remove();counters.disposed++;counters.liveContexts--;
  if(instance.box){instance.box.scene3D=null;setStatus(instance,'fallback','PRÉVIA AO VIVO');}
}
function render(instance){
  if(instance.disposed||!instance.model||!instance.visible||document.hidden||!instance.box?.isConnected)return;
  const scene=instance.box.querySelector('.preview-scene'),width=Math.max(1,scene.clientWidth),height=Math.max(1,scene.clientHeight);
  if(instance.canvas.width!==Math.floor(width*instance.ratio)||instance.canvas.height!==Math.floor(height*instance.ratio))instance.renderer.setSize(width,height,false);
  const settings=instance.box.getPreviewSettings(),p=window.CSBoostPreview.projection(settings);
  instance.camera.aspect=width/height;
  // Independent licensed rig camera. FOV follows the console 4:3 reference.
  instance.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(p.fov)/2)/(4/3)));
  instance.camera.position.set(0,0,0);instance.camera.lookAt(0,0,-1);
  instance.camera.updateProjectionMatrix();
  instance.model.position.set(.1+(p.x-2.5)*.025,-.1+(p.z+1.5)*.025,-.1-p.y*.025);
  instance.box.dataset.modelPosition=JSON.stringify(instance.model.position.toArray());
  instance.renderer.render(instance.scene,instance.camera);counters.frames++;
  instance.box.dataset.cameraFov=String(instance.camera.fov);instance.box.dataset.renderFrames=String(counters.frames);
}
async function attachInternal(box){
  if(document.hidden)return;
  if(active){active.box=box;box.scene3D={update:()=>render(active)};box.querySelector('.preview-weapon').append(active.canvas);active.intersection.disconnect();active.intersection.observe(box.querySelector('.preview-scene'));active.resize.disconnect();active.resize.observe(box.querySelector('.preview-scene'));setStatus(active,active.model?'3d':'loading',active.model?'PRÉVIA AO VIVO · ARMA 3D':'CARREGANDO 3D');render(active);return;}
  const canvas=document.createElement('canvas');canvas.className='preview-3d-canvas';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!context){box.querySelector('.preview-weapon-image').hidden=false;box.dataset.renderer='fallback';box.querySelector('.preview-live').textContent='PRÉVIA AO VIVO · 3D INDISPONÍVEL';return;}
  let renderer;try{renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true});}catch(error){context.getExtension('WEBGL_lose_context')?.loseContext();throw error;}renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const ratio=Math.min(window.devicePixelRatio||1,1.5);renderer.setPixelRatio(ratio);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(53,16/9,.01,10);
  scene.add(new THREE.HemisphereLight(0xe7f2ff,0x777260,1.3));
  const key=new THREE.DirectionalLight(0xffeed6,2);key.position.set(-.8,1.3,1);scene.add(key);
  const fill=new THREE.DirectionalLight(0xc2dcff,.8);fill.position.set(1,.3,-.5);scene.add(fill);
  const faces=Array.from({length:6},(_,index)=>{const face=document.createElement('canvas');face.width=64;face.height=64;const ctx=face.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,64);gradient.addColorStop(0,index===3?'#848076':'#c6def5');gradient.addColorStop(.5,index===2?'#e8f3ff':'#d4d1c1');gradient.addColorStop(1,'#656c61');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return face;});
  const environment=new THREE.CubeTexture(faces);environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;scene.environment=environment;
  const instance={box,canvas,renderer,ratio,scene,camera,environment,model:null,disposed:false,visible:true};active=instance;counters.created++;counters.liveContexts++;
  instance.resize=new ResizeObserver(()=>render(instance));instance.resize.observe(box.querySelector('.preview-scene'));
  instance.intersection=new IntersectionObserver(entries=>{instance.visible=entries.some(entry=>entry.isIntersecting);if(instance.visible)render(instance);});instance.intersection.observe(box.querySelector('.preview-scene'));
  instance.lost=event=>{event.preventDefault();if(active===instance){release();box.dataset.renderer='fallback';box.querySelector('.preview-live').textContent='PRÉVIA AO VIVO · CONTEXTO 3D PERDIDO';}};canvas.addEventListener('webglcontextlost',instance.lost);
  box.scene3D={update:()=>render(instance)};box.querySelector('.preview-weapon').append(canvas);setStatus(instance,'loading','CARREGANDO 3D');
  try{
    const bytes=await modelBytes();if(instance.disposed)return;
    const models=await Promise.all(bytes.map(data=>new GLTFLoader().parseAsync(data,'')));
    if(instance.disposed){for(const gltf of models)disposeModel(gltf.scene);return;}
    instance.model=new THREE.Group();for(const gltf of models)instance.model.add(gltf.scene);instance.model.scale.setScalar(.5);instance.model.rotation.z=-.04;
    for(const name of ['SpareMagazine','Suppressor','OpticRailAdapterGeometry']){const part=instance.model.getObjectByName(name);if(part)part.visible=false;}
    instance.model.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){if(!material)continue;material.envMapIntensity=.35;}});
    scene.add(instance.model);setStatus(instance,'3d','PRÉVIA AO VIVO · ARMA 3D');render(instance);
  }catch(error){if(active===instance){release();box.dataset.renderer='fallback';box.dataset.previewError=String(error.message||error).slice(0,250);box.querySelector('.preview-live').textContent='PRÉVIA AO VIVO · MODELO 3D INDISPONÍVEL';}}
}
async function attach(box){try{return await attachInternal(box);}catch(error){if(active?.box===box)release();if(box.isConnected){box.dataset.renderer='fallback';box.dataset.previewError=String(error.message||error).slice(0,250);box.querySelector('.preview-live').textContent='PRÉVIA AO VIVO · 3D INDISPONÍVEL';box.querySelector('.preview-weapon-image').hidden=false;}}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)release();else{const box=document.querySelector('.viewmodel-scene');if(box)attach(box);}});
export {attach,release};
export const diagnostics=()=>({...counters,active:!!active,ready:!!active?.model});
