import crypto from 'node:crypto';
import {parseVideoConfig,patchVideoConfig} from './optimizations.mjs';

// Closed, game-file catalog. Values were checked against the installed game's
// video defaults and video settings layout; see analysis/pro-video-plan.md.
export const PRO_VIDEO_FIELDS=Object.freeze([
  ['setting.mat_vsync','VSync',['0','1']],
  ['setting.msaa_samples','MSAA',['0','2','4','8']],
  ['setting.r_csgo_cmaa_enable','CMAA',['0']],
  ['setting.videocfg_shadow_quality','Qualidade das sombras',['0','1','2','3']],
  ['setting.videocfg_dynamic_shadows','Sombras dinâmicas',['0','1']],
  ['setting.videocfg_texture_detail','Detalhe das texturas',['0','1','2']],
  ['setting.videocfg_ao_detail','Oclusão de ambiente',['0','2','3']],
  ['setting.videocfg_particle_detail','Detalhe das partículas',['0','1','2','3']],
  ['setting.videocfg_hdr_detail','HDR',['3','-1']],
  ['setting.shaderquality','Detalhe dos shaders',['0','1']],
  ['setting.r_texturefilteringquality','Filtragem das texturas',['0','1','2','3','4','5']],
].map(([key,label,values])=>Object.freeze({key,label,values:Object.freeze(values)})));
const AA=['setting.msaa_samples','setting.r_csgo_cmaa_enable'];
const DEFINITIONS=[
  {source:'wait_for_vertical_sync',label:'VSync',keys:['setting.mat_vsync'],map:{disabled:['0'],enabled:['1']}},
  {source:'multisampling_anti-aliasing_mode',label:'Antisserrilhamento',keys:AA,map:{none:['0','0'],disabled:['0','0'],'2x msaa':['2','0'],'4x msaa':['4','0'],'8x msaa':['8','0']}},
  {source:'global_shadow_quality',label:'Qualidade das sombras',keys:['setting.videocfg_shadow_quality'],map:{low:['0'],medium:['1'],high:['2'],'very high':['3']}},
  {source:'dynamic_shadows',label:'Sombras dinâmicas',keys:['setting.videocfg_dynamic_shadows'],map:{'sun only':['0'],all:['1']}},
  {source:'model_texture_detail',label:'Detalhe das texturas',keys:['setting.videocfg_texture_detail'],map:{low:['0'],medium:['1'],high:['2']}},
  {source:'ambient_occlusion',label:'Oclusão de ambiente',keys:['setting.videocfg_ao_detail'],map:{disabled:['0'],medium:['2'],high:['3']}},
  {source:'particle_detail',label:'Detalhe das partículas',keys:['setting.videocfg_particle_detail'],map:{low:['0'],medium:['1'],high:['2'],'very high':['3']}},
  {source:'high_dynamic_range',label:'HDR',keys:['setting.videocfg_hdr_detail'],map:{performance:['3'],quality:['-1']}},
  {source:'shader_detail',label:'Detalhe dos shaders',keys:['setting.shaderquality'],map:{low:['0'],high:['1']}},
  {source:'texture_filtering_mode',label:'Filtragem das texturas',keys:['setting.r_texturefilteringquality'],map:{bilinear:['0'],trilinear:['1'],'anisotropic 2x':['2'],'anisotropic 4x':['3'],'anisotropic 8x':['4'],'anisotropic 16x':['5']}},
];
const REFERENCE_ONLY={boost_player_contrast:'Contraste dos jogadores',nvidia_reflex_low_latency:'NVIDIA Reflex','nvidia_g-sync':'NVIDIA G-Sync',fidelityfx_super_resolution:'FSR',brightness:'Brilho',scaling_mode:'Escalonamento'};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function dataObject(value,maximum,message){
  if(!plain(value)||Reflect.ownKeys(value).length>maximum||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!Object.getOwnPropertyDescriptor(value,key)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))throw Error(message);
}

export function validateProVideo(values){
  dataObject(values,PRO_VIDEO_FIELDS.length,'Opções avançadas de vídeo inválidas.');
  for(const [key,value]of Object.entries(values)){
    const field=PRO_VIDEO_FIELDS.find(item=>item.key===key);
    if(!field||typeof value!=='string'||!field.values.includes(value))throw Error('Opção avançada de vídeo fora do catálogo: '+key);
  }
  if(AA.some(key=>Object.hasOwn(values,key))){
    if(!AA.every(key=>Object.hasOwn(values,key)))throw Error('MSAA e CMAA precisam ser salvos juntos.');
    if(values[AA[0]]!=='0'&&values[AA[1]]!=='0')throw Error('MSAA e CMAA não podem ser ativados juntos neste perfil.');
  }
  return Object.fromEntries(PRO_VIDEO_FIELDS.filter(field=>Object.hasOwn(values,field.key)).map(field=>[field.key,values[field.key]]));
}

export function normalizeProVideo(fields){
  dataObject(fields,150,'Campos publicados de vídeo inválidos.');
  const values={},supported=[],unsupported=[];
  for(const definition of DEFINITIONS){
    if(!Object.hasOwn(fields,definition.source)||fields[definition.source]===null)continue;
    const raw=fields[definition.source];
    const key=typeof raw==='string'&&raw.length<=180?raw.trim().toLowerCase().replace(/×/g,'x').replace(/\s+/g,' '):null;
    const mapped=key!==null&&Object.hasOwn(definition.map,key)?definition.map[key]:null;
    if(!mapped){unsupported.push({source:definition.source,label:definition.label,reason:'Valor publicado sem equivalência validada no catálogo de vídeo.'});continue;}
    definition.keys.forEach((target,index)=>{values[target]=mapped[index];supported.push({source:definition.source,key:target,label:PRO_VIDEO_FIELDS.find(field=>field.key===target).label,value:mapped[index]});});
  }
  for(const [source,label]of Object.entries(REFERENCE_ONLY))if(Object.hasOwn(fields,source)&&fields[source]!==null)unsupported.push({source,label,reason:'Apenas consulta; este catálogo não altera esse ajuste de jogo, monitor ou driver.'});
  return {values:validateProVideo(values),supported,unsupported};
}

export function planProVideo(text,values){
  values=validateProVideo(values);
  if(!Object.keys(values).length)throw Error('Nenhuma opção avançada de vídeo compatível foi selecionada.');
  if(typeof text!=='string'||Buffer.byteLength(text)>256*1024)throw Error('Configuração de vídeo excede o limite de leitura.');
  const entries=parseVideoConfig(text),changes=[],already=[],unsupported=[],applicable={};
  // AA is one UI choice represented by two native keys. Never apply half of it.
  const incompleteAA=AA.some(key=>Object.hasOwn(values,key))&&AA.some(key=>!entries.has(key));
  for(const field of PRO_VIDEO_FIELDS){
    if(!Object.hasOwn(values,field.key))continue;
    const entry=entries.get(field.key);
    if(!entry||incompleteAA&&AA.includes(field.key)){unsupported.push(field.label);continue;}
    const item={key:field.key,label:field.label,before:entry.value,after:values[field.key]};
    (entry.value===item.after?already:changes).push(item);applicable[field.key]=item.after;
  }
  const dimensions=['setting.defaultres','setting.defaultresheight'].map(key=>entries.get(key).value);
  if(dimensions.some(value=>!/^\d{3,5}$/.test(value)||Number(value)<100||Number(value)>16384))throw Error('Resolução atual de vídeo inválida.');
  const [width,height]=dimensions.map(Number);
  return {preset:'professional',name:'Vídeo do perfil profissional',description:'Copia somente os valores publicados compatíveis. Mantém resolução, modo de tela, Reflex e opções fora do catálogo; não comprova ganho de FPS.',changes,already,unsupported,sourceSHA256:crypto.createHash('sha256').update(Buffer.from(text)).digest('hex'),text:patchVideoConfig(text,applicable),width,height,resolution:'keep',pixelChangePercent:0};
}
