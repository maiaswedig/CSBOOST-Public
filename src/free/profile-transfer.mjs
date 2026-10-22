import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {DEFAULT_SETTINGS,validateSettings,BIND_ACTIONS} from './profiles.mjs';
import {steamAccountDirectory} from './optimizations.mjs';
const MAX=512*1024;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const cleanName=value=>String(value||'Config importada').replace(/[\x00-\x1f]/g,'').trim().slice(0,64)||'Config importada';
const RULES={sensitivity:['sensitivity',.01,100],volume:['volume',0,1],fps_max:['fpsMax',0,1000,true],viewmodel_fov:['viewmodelFov',54,68],viewmodel_offset_x:['viewmodel.x',-2,2.5],viewmodel_offset_y:['viewmodel.y',-2,2],viewmodel_offset_z:['viewmodel.z',-2,2],hud_scaling:['hud.scale',.5,1],cl_hud_color:['hud.color',0,12,true],safezonex:['hud.safeZoneX',.5,1],safezoney:['hud.safeZoneY',.85,1],cl_radar_scale:['radar.scale',.25,1],cl_hud_radar_scale:['radar.hudScale',.8,1.3],cl_hud_radar_background_alpha:['radar.backgroundAlpha',0,1],cl_radar_always_centered:['radar.centered',0,1,'bool'],cl_radar_rotate:['radar.rotate',0,1,'bool'],cl_crosshairstyle:['crosshair.style',0,8,true],cl_crosshairsize:['crosshair.size',0,10],cl_crosshairgap:['crosshair.gap',-10,10],cl_crosshairthickness:['crosshair.thickness',0,5],cl_crosshaircolor:['crosshair.color',0,5,true],cl_crosshaircolor_r:['crosshair.red',0,255,true],cl_crosshaircolor_g:['crosshair.green',0,255,true],cl_crosshaircolor_b:['crosshair.blue',0,255,true],cl_crosshairalpha:['crosshair.alpha',0,255,true],cl_crosshaircolor_a:['crosshair.alpha',0,255,true],cl_crosshairusealpha:['crosshair.useAlpha',0,1,'bool'],cl_crosshairdot:['crosshair.dot',0,1,'bool'],cl_crosshair_t:['crosshair.tStyle',0,1,'bool'],cl_crosshair_recoil:['crosshair.followRecoil',0,1,'bool'],cl_crosshair_sniper_width:['crosshair.sniperWidth',0,10,true],cl_crosshair_outlinethickness:['crosshair.outlineThickness',0,3],cl_crosshair_length:['crosshair.lengthPixels',0,255,true],cl_crosshair_gap:['crosshair.gapPixels',0,255,true],cl_crosshair_thickness:['crosshair.thicknessPixels',0,31,true],cl_crosshair_screen_height:['crosshair.screenHeight',0,16384,true],cl_crosshair_dynamic_spread_limit:['crosshair.spreadLimit',0,255,true], 'setting.defaultres':['video.width',640,7680,true],'setting.defaultresheight':['video.height',480,4320,true]};
function set(settings,key,value){const parts=key.split('.');if(parts.length===1)settings[key]=value;else settings[parts[0]][parts[1]]=value;}

export function parseConfigCommands(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('Escolha uma config de texto de até 512 KB.');
  const commands=[];let tokens=[],token='',quoted=false,inToken=false;
  const flushToken=()=>{if(inToken){tokens.push(token);token='';inToken=false;}};
  const flushCommand=()=>{flushToken();if(tokens.length){commands.push(tokens);tokens=[];}};
  for(let i=0;i<text.length;i++){
    const char=text[i];if(quoted){if(char==='"'){quoted=false;}else if(char==='\\'&&['"','\\'].includes(text[i+1]))token+=text[++i];else if(char==='\n'||char==='\r')throw new Error('Aspas não concluídas na configuração.');else token+=char;continue;}
    if(char==='/'&&text[i+1]==='/'){flushCommand();while(i<text.length&&text[i]!=='\n')i++;continue;}
    if(char==='"'){if(inToken&&token)throw new Error('Token com aspas inválido.');quoted=true;inToken=true;}
    else if(char===';'||char==='\n'||char==='\r')flushCommand();
    else if(/\s/.test(char))flushToken();else{token+=char;inToken=true;}
    if(token.length>8192||tokens.length>128||commands.length>20000)throw new Error('Configuração excede os limites de importação.');
  }
  if(quoted)throw new Error('Aspas não concluídas na configuração.');flushCommand();return commands;
}
export function parseVcfgPairs(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('Configuração VCFG inválida.');
  const tokens=[];let cursor=0;
  while(cursor<text.length){
    const char=text[cursor];if(/\s/.test(char)){cursor++;continue;}
    if(char==='/'&&text[cursor+1]==='/'){while(cursor<text.length&&text[cursor]!=='\n')cursor++;continue;}
    if(char==='{'||char==='}'){tokens.push({brace:char});cursor++;continue;}
    let value='';
    if(char==='"'){
      cursor++;let closed=false;while(cursor<text.length){const current=text[cursor++];if(current==='"'){closed=true;break;}if(current==='\\'&&['"','\\'].includes(text[cursor]))value+=text[cursor++];else if(current==='\n'||current==='\r')throw new Error('Texto VCFG com aspas não concluídas.');else value+=current;}
      if(!closed)throw new Error('Texto VCFG com aspas não concluídas.');
    }else{while(cursor<text.length&&!/[\s{}]/.test(text[cursor]))value+=text[cursor++];}
    tokens.push({value});if(tokens.length>40000||value.length>8192)throw new Error('Configuração VCFG excede os limites.');
  }
  const pairs=[];let position=0;
  function block(depth,closing){
    if(depth>32)throw new Error('Configuração VCFG com muitos níveis.');
    while(position<tokens.length){
      const key=tokens[position++];if(key.brace==='}'&&closing)return;if(key.brace)throw new Error('Estrutura VCFG inválida.');
      const value=tokens[position++];if(!value||value.brace==='}')throw new Error('Configuração VCFG incompleta.');
      if(value.brace==='{')block(depth+1,true);else pairs.push([key.value,value.value]);
    }
    if(closing)throw new Error('Bloco VCFG não concluído.');
  }
  block(0,false);return pairs;
}
export function parseProfileConfig(text,{format='cfg',baseSettings=DEFAULT_SETTINGS}={}){
  if(!['cfg','vcfg'].includes(format)||typeof text!=='string'||Buffer.byteLength(text)>MAX)throw new Error('Formato de configuração inválido.');
  const commands=(format==='cfg'?parseConfigCommands(text):parseVcfgPairs(text)).map(([key,...values])=>[key.toLowerCase(),...values]);
  const settings=clone(validateSettings(baseSettings)),fields=new Set(),ignored=new Set(),warnings=[];
  const current=commands.some(([key])=>['cl_crosshair_length','cl_crosshair_gap','cl_crosshair_thickness','cl_crosshair_screen_height'].includes(key));
  const legacy=commands.some(([key])=>['cl_crosshairsize','cl_crosshairgap','cl_crosshairthickness','cl_crosshair_outlinethickness','cl_crosshaircolor','cl_crosshairusealpha'].includes(key));
  if(current)settings.crosshair.version=3;else if(legacy)settings.crosshair.version=2;
  const binds=new Map(settings.binds.map(item=>[item.key,item.action]));
  for(const tokens of commands){
    const key=String(tokens[0]).toLowerCase(),raw=tokens[1];
    if(key==='bind'&&format==='cfg'){
      const button=String(raw||'').toLowerCase(),action=tokens[2];if(tokens.length===3&&/^[a-z0-9_]{1,20}$/.test(button)&&BIND_ACTIONS.includes(action)&&binds.size<40){binds.set(button,action);fields.add('bind '+button);}else warnings.push('Um atalho contém comando ou tecla não compatível e foi ignorado.');continue;
    }
    if(key==='cl_crosshair_drawoutline'){
      let value=['true','false'].includes(String(raw).toLowerCase())?String(raw).toLowerCase()==='true'?1:0:Number(raw);
      if(tokens.length!==2||!Number.isInteger(value)||value<0||value>(settings.crosshair.version===3?2:1)){warnings.push('Contorno inválido ignorado.');continue;}
      settings.crosshair.outline=value>0;if(settings.crosshair.version===3)settings.crosshair.outlineMode=value;fields.add(key);continue;
    }
    const rule=key==='zoom_sensitivity_ratio'||key==='zoom_sensitivity_ratio_mouse'?['zoomSensitivity',.01,100]:Object.hasOwn(RULES,key)?RULES[key]:null;
    if(!rule){if(/^[a-z_+.][a-z\d_.+-]{0,63}$/i.test(key))ignored.add(key);continue;}
    if(tokens.length!==2){warnings.push(`${key}: quantidade de valores inválida; ignorado.`);continue;}
    let value=rule[3]==='bool'?String(raw).toLowerCase()==='true'?1:String(raw).toLowerCase()==='false'?0:Number(raw):Number(raw);
    if(typeof raw!=='string'||!raw.trim()||!Number.isFinite(value)||value<rule[1]||value>rule[2]||(rule[3]&& !Number.isInteger(value))||(key==='cl_crosshairstyle'&&settings.crosshair.version===2&&value>5)){warnings.push(`${key}: valor fora dos limites; ignorado.`);continue;}
    set(settings,rule[0],rule[3]==='bool'?!!value:value);fields.add(key);
  }
  if([...fields].some(key=>/^cl_crosshaircolor_[rgb]$/.test(key))&&(settings.crosshair.version===3||!fields.has('cl_crosshaircolor')))settings.crosshair.color=5;
  if(commands.some(([key])=>/^setting\.(?:fullscreen|nowindowborder|refreshrate_)/.test(key)))warnings.push('Modo de tela e taxa de atualização não são importados automaticamente. Confira essas opções no editor e dentro do CS2.');
  settings.binds=[...binds].map(([key,action])=>({key,action}));
  if(!fields.size)throw new Error('Nenhuma opção compatível foi encontrada. Comandos arbitrários não são executados.');
  return {settings:validateSettings(settings),fields:[...fields],ignored:[...ignored].slice(0,50),warnings:[...new Set(warnings)].slice(0,50),format,crosshairVersion:settings.crosshair.version};
}
export function serializePortableProfile(profile){const name=cleanName(profile.name),settings=validateSettings(profile.settings),payload={format:'csboost-profile',version:1,name,settings};return JSON.stringify({...payload,sha256:hash(JSON.stringify(payload))},null,2);}
export function parsePortableProfile(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX)throw new Error('Perfil portátil muito grande.');
  let record;try{record=JSON.parse(text);}catch{throw new Error('Perfil JSON inválido.');}
  if(!object(record)||record.format!=='csboost-profile'||record.version!==1||typeof record.name!=='string'||record.name!==cleanName(record.name)||!object(record.settings))throw new Error('Arquivo não é um perfil portátil CSBOOST compatível.');
  const payload={format:record.format,version:record.version,name:record.name,settings:validateSettings(record.settings)};
  // Older version-1 exports predate these optional fields. Verify their original
  // normalized shape before returning the migrated defaults, without weakening
  // validation or accepting changes to any other field covered by the checksum.
  const previousPayload=clone(payload);
  for(const [group,key]of [['hud','safeZoneX'],['hud','safeZoneY'],['radar','backgroundAlpha']])if(!Object.hasOwn(record.settings[group]??{},key))delete previousPayload.settings[group][key];
  if(record.sha256!==hash(JSON.stringify(payload))&&record.sha256!==hash(JSON.stringify(previousPayload)))throw new Error('O conteúdo do perfil foi alterado ou está incompleto.');
  return {name:payload.name,settings:payload.settings};
}
async function readRegular(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX)throw new Error('A configuração precisa ser um arquivo regular de até 512 KB.');const bytes=await fs.readFile(file),text=bytes.toString('utf8').replace(/^\uFEFF/,'');if(text.includes('\uFFFD'))throw new Error('Codificação não reconhecida. Salve a config como UTF-8.');return {text,sha256:hash(bytes)};}

export function createProfileTransfer({profiles,system,getSteamId}){
  async function importFile(file){const {text}=await readRegular(file);let input,detail;
    if(path.extname(file).toLowerCase()==='.json'){input=parsePortableProfile(text);detail={fields:[],ignored:[],warnings:[]};}
    else{detail=parseProfileConfig(text,{format:path.extname(file).toLowerCase()==='.vcfg'?'vcfg':'cfg'});input={name:cleanName(path.basename(file,path.extname(file))),settings:detail.settings};}
    const profile=await profiles.save(input);return {profile,fields:detail.fields,ignored:detail.ignored,warnings:detail.warnings,appliedToGame:false};
  }
  async function previewGame(){
    const account=steamAccountDirectory(await getSteamId()),installation=await system.refreshSteam();if(!installation.installed||!installation.cs2Installed)throw new Error('Steam e CS2 precisam estar instalados.');
    const root=await fs.realpath(installation.steamPath);let directory=root;
    for(const part of ['userdata',account,'730','local','cfg']){directory=path.join(directory,part);const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||path.normalize(await fs.realpath(directory)).toLowerCase()!==path.normalize(directory).toLowerCase())throw new Error('Pasta de configuração Steam inválida.');}
    const sources=[],warnings=[];let settings=clone(DEFAULT_SETTINGS),fields=[];
    for(const name of ['cs2_user_convars_0_slot0.vcfg','cs2_machine_convars.vcfg','cs2_video.txt']){
      try{const file=await readRegular(path.join(directory,name)),parsed=parseProfileConfig(file.text,{format:'vcfg',baseSettings:settings});settings=parsed.settings;fields.push(...parsed.fields);warnings.push(...parsed.warnings);sources.push({name,sha256:file.sha256,fields:parsed.fields.length});}
      catch(error){if(error.code==='ENOENT')warnings.push(`${name}: ainda não criado pelo jogo.`);else if(/Nenhuma opção/.test(error.message))warnings.push(`${name}: nenhuma opção compatível.`);else throw error;}
    }
    if(!sources.length)throw new Error('Nenhuma configuração compatível foi encontrada. Abra o CS2 uma vez e salve suas opções.');
    return {settings,fields:[...new Set(fields)],sources,sourceFingerprint:hash(JSON.stringify(sources)),warnings:[...new Set(warnings)],appliedToGame:false,message:'Somente opções compatíveis são lidas do disco. O perfil será salvo no CSBOOST, sem aplicar alterações ao jogo. Atalhos do VCFG não são importados.'};
  }
  async function importGame({sourceFingerprint}={}){if(typeof sourceFingerprint!=='string'||!/^[a-f\d]{64}$/.test(sourceFingerprint))throw new Error('Confira a prévia antes de importar.');const preview=await previewGame();if(preview.sourceFingerprint!==sourceFingerprint)throw new Error('A configuração do jogo mudou. Atualize a prévia antes de importar.');return {profile:await profiles.save({name:'Importada do meu CS2',settings:preview.settings}),warnings:preview.warnings,fields:preview.fields,appliedToGame:false};}
  return {importFile,previewGame,importGame,serializeProfile:serializePortableProfile};
}
