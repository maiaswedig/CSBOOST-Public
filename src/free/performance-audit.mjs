import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {NVIDIA_SETTINGS} from './nvidia.mjs';

const UUID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const HASH=/^[a-f\d]{64}$/;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean=value=>typeof value==='string'?value.slice(0,180):null;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const entry=(id,label,value)=>({id,label,value});
const registryValue=item=>{const value=item.before;if(!value?.exists)return {exists:false};if(value.type==='DWord')return {exists:true,type:'DWord',data:numeric(value.data)};const text=typeof value.data==='string'?value.data:'';return {exists:true,type:clean(value.type),gpuPreference:item.id==='gpu'?numeric(Number(text.match(/(?:^|;)\s*GpuPreference=([0-2])(?:;|$)/)?.[1]??NaN)):null,valueSHA256:digest(text)};};
const section=(label,entries,unavailableFields=[])=>({available:true,label,entries,unavailableFields:[...new Set(unavailableFields)].sort()});
const unavailable=(label)=>({available:false,label,entries:[],reason:'Consulta indisponível; não é possível concluir se houve alteração.'});
const SECTION_IDS=['hardware','video','windows','nvidia','power','displays','firmware','memory'];
const ENTRY_IDS={hardware:['cpu','gpu','ram','logicalCores'],video:['width','height','setting.mat_vsync','setting.msaa_samples','setting.r_csgo_cmaa_enable','setting.videocfg_shadow_quality','setting.videocfg_texture_detail','setting.videocfg_ao_detail','setting.videocfg_particle_detail','setting.videocfg_hdr_detail','setting.shaderquality','setting.r_texturefilteringquality','setting.fullscreen','setting.nowindowborder'],windows:['gameMode','gpu','capture'],nvidia:['driver',...NVIDIA_SETTINGS.map(item=>item.key)],power:['active'],firmware:['board','bios'],memory:['modules','frequency']};
const numericText=value=>typeof value==='string'&&/^-?\d{1,8}(?:\.\d{1,6})?$/.test(value)?value:null;
function validateSnapshot(value){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const scalar=(v,depth=0)=>{if(depth>6)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);if(typeof v==='string')return v.length<=180;if(Array.isArray(v))return v.length<=64&&v.every(item=>scalar(item,depth+1));return object(v)&&Object.keys(v).length<=16&&Object.entries(v).every(([key,item])=>key.length<=80&&scalar(item,depth+1));};
  if(!object(value)||value.version!==1||value.readOnly!==true||!HASH.test(value.ownerKey)||!HASH.test(value.hardwareKey)||!Number.isFinite(Date.parse(value.startedAt))||!Number.isFinite(Date.parse(value.capturedAt))||!object(value.sections)||JSON.stringify(Object.keys(value.sections).sort())!==JSON.stringify([...SECTION_IDS].sort()))throw Error('Snapshot de diagnóstico incompleto ou inválido.');
  for(const [key,s]of Object.entries(value.sections)){
    if(!object(s)||typeof s.available!=='boolean'||typeof s.label!=='string'||s.label.length>180||!Array.isArray(s.entries)||s.entries.length>64||(!s.available&&s.entries.length)||s.available&&(!Array.isArray(s.unavailableFields)||s.unavailableFields.length>64||s.unavailableFields.some(item=>typeof item!=='string'||item.length>180)))throw Error('Consulta de diagnóstico inválida.');
    const ids=new Set();for(const item of s.entries){if(!object(item)||typeof item.id!=='string'||ids.has(item.id)||typeof item.label!=='string'||item.label.length>180||!scalar(item.value)||(key==='displays'?!/^(?:\\\\\.\\DISPLAY\d+|DISPLAY\d+)$/i.test(item.id):!ENTRY_IDS[key].includes(item.id))||(key==='video'&&item.value!==null&&(typeof item.value==='string'?numericText(item.value)===null:typeof item.value!=='number')))throw Error('Opção de diagnóstico inválida.');ids.add(item.id);}
    const legacyNvidia=key==='nvidia'&&[5,8,9].includes(ids.size)&&['driver',...NVIDIA_SETTINGS.slice(0,ids.size-1).map(item=>item.key)].every(id=>ids.has(id));
    if(s.available&&key!=='video'&&key!=='displays'&&!legacyNvidia&&ENTRY_IDS[key].some(id=>!ids.has(id)))throw Error('Consulta de diagnóstico incompleta.');
    if(s.available&&key==='video'&&(!ids.has('width')||!ids.has('height')))throw Error('Dimensões ausentes no diagnóstico.');
    if(s.available&&key==='displays'&&!s.entries.length)throw Error('Monitores ausentes no diagnóstico.');
  }
  return value;
}
const esc=value=>String(value??'Não informado').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const PERFORMANCE_AUDIT_LIMITS=Object.freeze([
  'Consulta limitada às opções de vídeo do catálogo próprio, três preferências do Windows, oito ajustes NVIDIA do CS2, energia, modos atuais, BIOS e memória SMBIOS.',
  'As leituras são sequenciais/concorrentes durante um intervalo, não um snapshot atômico de todo o PC. Outros programas podem alterar valores nesse intervalo.',
  'Uma diferença não identifica qual programa a causou e não comprova ganho de FPS. Confirme o resultado com benchmarks comparáveis.',
  'Não lê valores PBO/CO ativos, perfil XMP/EXPO, clocks/timings completos, serviços, tarefas, todo o Registro ou todos os ajustes privados do CSCLIENT.',
  'Este diagnóstico não aplica nem restaura as diferenças. Use a restauração do módulo que aplicou o ajuste.'
]);

export function comparePerformanceSnapshots(before,after){
  validateSnapshot(before);validateSnapshot(after);
  const changes=[],unknown=[],warnings=[];
  if(before.hardwareKey!==after.hardwareKey)warnings.push('CPU, GPU, capacidade de RAM ou placa mudaram; as medições podem pertencer a configurações de hardware diferentes.');
  for(const [key,left] of Object.entries(before.sections)){
    const right=after.sections[key];
    if(!left.available||!right?.available){unknown.push({section:key,label:left.label,beforeAvailable:left.available,afterAvailable:!!right?.available});continue;}
    const leftMissing=[...left.unavailableFields],rightMissing=[...right.unavailableFields];
    if(key==='nvidia')for(const rule of NVIDIA_SETTINGS){if(!left.entries.some(item=>item.id===rule.key))leftMissing.push(rule.label);if(!right.entries.some(item=>item.id===rule.key))rightMissing.push(rule.label);}
    const missing=new Set([...leftMissing,...rightMissing]);
    for(const label of missing)unknown.push({section:key,label:left.label+' · '+label,beforeAvailable:!leftMissing.includes(label),afterAvailable:!rightMissing.includes(label)});
    const ids=new Set([...left.entries.map(item=>item.id),...right.entries.map(item=>item.id)]);
    for(const id of ids){
      const old=left.entries.find(item=>item.id===id),current=right.entries.find(item=>item.id===id);
      if(missing.has(old?.label)||missing.has(current?.label))continue;
      if(!old||!current||JSON.stringify(old.value)!==JSON.stringify(current.value))changes.push({section:key,sectionLabel:left.label,id,label:current?.label||old.label,before:old?.value??null,after:current?.value??null,missingBefore:!old,missingAfter:!current});
    }
  }
  if(unknown.length)warnings.push('Uma ou mais consultas ficaram indisponíveis. Ausência de diferenças conhecidas não significa que nada mudou.');
  return {beforeAt:before.capturedAt,afterAt:after.capturedAt,changes,unknown,warnings,coverageComplete:unknown.length===0,changed:changes.length>0,fpsGain:null,attribution:null,limits:[...PERFORMANCE_AUDIT_LIMITS]};
}

export function createPerformanceAudit({directory,system,optimizations,windowsTuning,nvidia,displays,amdTuning,memoryTuning,getSteamId,now=()=>new Date().toISOString()}){
  let queue=Promise.resolve();
  const serial=fn=>{const result=queue.then(fn,fn);queue=result.catch(()=>{});return result;};
  const owner=async()=>{const id=await getSteamId();if(typeof id!=='string'||!/^\d{17}$/.test(id))throw Error('Entre com a Steam para criar ou consultar a referência.');return digest(['csboost-performance-reference',id]);};
  const file=name=>path.join(directory,name);
  async function canonicalDirectory(){const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||(await fs.realpath(directory)).toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('Pasta de diagnóstico redirecionada ou inválida.');}
  async function read(name){try{await canonicalDirectory();const target=file(name),info=await fs.lstat(target);if(!info.isFile()||info.isSymbolicLink()||info.size>512*1024)throw Error('Arquivo de diagnóstico inválido.');const envelope=JSON.parse(await fs.readFile(target,'utf8'));if(envelope.version!==1||!envelope.data||envelope.sha256!==digest(envelope.data))throw Error('Diagnóstico alterado ou incompleto.');return envelope.data;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function write(name,data){await fs.mkdir(directory,{recursive:true});await canonicalDirectory();const target=file(name),existing=await fs.lstat(target).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});if(existing&&(!existing.isFile()||existing.isSymbolicLink()))throw Error('Destino de diagnóstico inválido.');const temporary=target+'.'+crypto.randomUUID()+'.tmp';const handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify({version:1,data,sha256:digest(data)},null,2));await handle.sync();}finally{await handle.close();}try{await fs.rename(temporary,target);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}}
  async function stopped(){if(await system.isGameRunning())throw Error('Feche o CS2 antes de guardar ou conferir o diagnóstico.');}
  async function snapshot(){
    await stopped();const ownerKey=await owner(),startedAt=now();
    const results=await Promise.allSettled([system.getSystemInfo(),system.getPowerPlans(),optimizations.inspect(await getSteamId(),{preset:'fps',resolution:'keep'}),windowsTuning.inspect(),nvidia.inspect(),displays.inspect(),amdTuning.inspect(),memoryTuning.snapshot()]);
    const result=index=>results[index].status==='fulfilled'?results[index].value:null;
    const hardware=result(0),power=result(1),video=result(2),windows=result(3),gpu=result(4),monitor=result(5),amd=result(6),memory=result(7);
    const sections={
      hardware:hardware?section('Hardware',[entry('cpu','CPU',clean(hardware.cpu)),entry('gpu','GPU',clean(hardware.gpu)),entry('ram','RAM (GB)',numeric(hardware.ramGB)),entry('logicalCores','Processadores lógicos',numeric(hardware.logicalCores))]):unavailable('Hardware'),
      video:video?section('Vídeo do CS2',[... [...(video.changes||[]),...(video.already||[])].filter(item=>ENTRY_IDS.video.includes(item.key)).map(item=>entry(item.key,clean(item.label),numericText(item.before))),entry('width','Largura',numeric(video.width)),entry('height','Altura',numeric(video.height))].sort((a,b)=>a.id.localeCompare(b.id)),[...(video.unsupported||[]),...[...(video.changes||[]),...(video.already||[])].filter(item=>numericText(item.before)===null).map(item=>clean(item.label)),...(numeric(video.width)===null?['Largura']:[]),...(numeric(video.height)===null?['Altura']:[])]):unavailable('Vídeo do CS2'),
      windows:windows?section('Preferências do Windows',windows.items.filter(item=>['gameMode','gpu','capture'].includes(item.id)).map(item=>entry(item.id,clean(item.name),registryValue(item))).sort((a,b)=>a.id.localeCompare(b.id))):unavailable('Preferências do Windows'),
      nvidia:gpu?.supported&&gpu.snapshot?section('Perfil NVIDIA do CS2',[entry('driver','Versão do driver',numeric(gpu.snapshot.driverVersion)),...NVIDIA_SETTINGS.map(rule=>{const value=gpu.snapshot.settings.find(item=>item.id===rule.id);return entry(rule.key,rule.label,!value?.recognized?{recognized:false}:{recognized:true,exists:!!value.exists,...(value.exists?{type:value.type,value:value.value,location:value.location,userOverride:!!value.userOverride}:{})});})],NVIDIA_SETTINGS.filter(rule=>!gpu.snapshot.settings.find(item=>item.id===rule.id)?.recognized).map(rule=>rule.label)):unavailable('Perfil NVIDIA do CS2'),
      power:power&&typeof power.activeGuid==='string'?section('Energia',[entry('active','Plano ativo',clean(power.activeGuid))]):unavailable('Energia'),
      displays:monitor?.supported?section('Monitores',monitor.displays.map(item=>entry(item.id,clean(item.monitorName)||'Monitor',Object.fromEntries(['width','height','refreshHz','bitsPerPixel','orientation','interlaced'].map(key=>[key,item.current[key]??null])))).sort((a,b)=>a.id.localeCompare(b.id))):unavailable('Monitores'),
      firmware:amd?.available?section('Firmware informado pelo Windows',[entry('board','Placa-mãe',clean(amd.board?.product)),entry('bios','Versão da BIOS',clean(amd.bios?.version))],[...(!amd.board?.product?['Placa-mãe']:[]),...(!amd.bios?.version?['Versão da BIOS']:[])]):unavailable('Firmware informado pelo Windows'),
      memory:memory?.available?section('Memória SMBIOS',[entry('modules','Módulos',memory.modules.map(item=>({locator:clean(item.locator),capacityBytes:numeric(item.capacityBytes),configuredClockMHz:numeric(item.configuredClockMHz),configuredVoltageMv:numeric(item.configuredVoltageMv),type:clean(item.type)})).sort((a,b)=>String(a.locator).localeCompare(String(b.locator)))),entry('frequency','Frequências configuradas (MHz)',memory.configuredClocksMHz.filter(value=>numeric(value)!==null).sort((a,b)=>a-b))]):unavailable('Memória SMBIOS')
    };
    await stopped();if(await owner()!==ownerKey)throw Error('A conta mudou durante a consulta. Tente novamente.');
    return validateSnapshot({version:1,capturedAt:now(),startedAt,ownerKey,hardwareKey:digest([hardware?.cpu??null,hardware?.gpu??null,hardware?.ramGB??null,amd?.board?.product??null]),sections,readOnly:true,limits:[...PERFORMANCE_AUDIT_LIMITS]});
  }
  async function reference(){const ownerKey=await owner(),pointer=await read('reference-'+ownerKey+'.json');if(!pointer)return null;if(!UUID.test(pointer.id))throw Error('Referência inválida.');const record=await read(pointer.id+'.json');if(!record||record.version!==1||record.id!==pointer.id||record.ownerKey!==ownerKey||record.snapshot?.ownerKey!==ownerKey)throw Error('Referência alterada ou incompleta.');validateSnapshot(record.snapshot);return record;}
  const publicReference=record=>record?{id:record.id,label:record.label,capturedAt:record.snapshot.capturedAt,availableSections:Object.values(record.snapshot.sections).filter(item=>item.available).length,totalSections:Object.keys(record.snapshot.sections).length}:null;
  async function comparison(record){if(!record)return null;const report=await read(record.id+'.comparison.json');if(!report)return null;if(report.referenceId!==record.id||report.referenceSHA256!==digest(record.snapshot)||report.ownerKey!==record.ownerKey||!report.current||report.current.ownerKey!==record.ownerKey)throw Error('Comparação não corresponde à referência.');return comparePerformanceSnapshots(record.snapshot,report.current);}
  async function inspect(){const record=await reference();return {reference:publicReference(record),comparison:await comparison(record),readOnly:true,limits:[...PERFORMANCE_AUDIT_LIMITS]};}
  async function capture({label='Referência antes dos ajustes'}={}){return serial(async()=>{if(typeof label!=='string'||!label.trim()||label.length>80)throw Error('Nome da referência inválido.');const current=await snapshot();if(!current.sections.hardware.available)throw Error('Não foi possível identificar o hardware para guardar a referência.');if(Object.values(current.sections).filter(item=>item.available).length<2)throw Error('Poucas consultas disponíveis para guardar uma referência útil.');const record={version:1,id:crypto.randomUUID(),label:label.trim(),ownerKey:current.ownerKey,snapshot:current};await write(record.id+'.json',record);await write('reference-'+record.ownerKey+'.json',{id:record.id});return inspect();});}
  async function compare(){return serial(async()=>{const record=await reference();if(!record)throw Error('Guarde a referência antes dos ajustes.');const current=await snapshot();if(current.ownerKey!==record.ownerKey)throw Error('A conta mudou durante a comparação.');await write(record.id+'.comparison.json',{referenceId:record.id,referenceSHA256:digest(record.snapshot),ownerKey:record.ownerKey,current});return {reference:publicReference(record),comparison:comparePerformanceSnapshots(record.snapshot,current),readOnly:true,limits:[...PERFORMANCE_AUDIT_LIMITS]};});}
  async function renderHtml(){const info=await inspect();if(!info.comparison)throw Error('Confira o diagnóstico antes de exportar.');const report=info.comparison;const value=input=>input===null?'Não informado':typeof input==='object'?JSON.stringify(input):String(input);return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>CSBOOST — diagnóstico Antes/Depois</title><style>body{font:16px system-ui;max-width:1100px;margin:36px auto;padding:0 20px;color:#17201c}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #bbc5c0;padding:9px;text-align:left;overflow-wrap:anywhere}p,li{line-height:1.6}</style><h1>CSBOOST — diagnóstico Antes/Depois</h1><p>${esc(info.reference.label)} · Antes: ${esc(report.beforeAt)} · Depois: ${esc(report.afterAt)}</p><p>${report.changes.length} diferenças conhecidas; ${report.unknown.length} consultas sem comparação. Ganho de FPS não medido por este relatório.</p><table><thead><tr><th>Área / opção</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${report.changes.map(item=>`<tr><td>${esc(item.sectionLabel)} · ${esc(item.label)}</td><td>${item.missingBefore?'Ausente na consulta':esc(value(item.before))}</td><td>${item.missingAfter?'Ausente na consulta':esc(value(item.after))}</td></tr>`).join('')}</tbody></table><h2>Cobertura e limites</h2><ul>${[...report.warnings,...report.unknown.map(item=>item.label+': indisponível antes ou depois'),...report.limits].map(text=>'<li>'+esc(text)+'</li>').join('')}</ul></html>`;}
  return {snapshot,inspect,capture,compare,renderHtml};
}
