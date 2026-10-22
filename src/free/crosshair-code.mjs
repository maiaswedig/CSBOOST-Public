/*
 * CSBOOST crosshair codec, adapted from akiver/csgo-sharecode 7.0.1
 * commit 139b9e284756110b44a894331f285b0ddabdf6ef.
 * https://github.com/akiver/csgo-sharecode
 *
 * The MIT License (MIT)
 * Copyright (c) 2017-present AkiVer
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Differences: strict bounds/quantization instead of clamping, bounded parsing,
 * overflow rejection, raw reserved-bit preservation and explicit editor adapters.
 * Pure data only: no game execution, account, filesystem or network access.
 */

export const CROSSHAIR_CODE_UPSTREAM = Object.freeze({name:'csgo-sharecode',version:'7.0.1',commit:'139b9e284756110b44a894331f285b0ddabdf6ef',license:'MIT',url:'https://github.com/akiver/csgo-sharecode'});
export const CROSSHAIR_CODE_FORMATS = Object.freeze(['legacy-v1','legacy-v3','legacy-v4','cs2-v1']);
const ALPHABET='ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';
const BASE=57n;
const common={style:[0,9],followRecoil:'bool',centerDotEnabled:'bool',tStyleEnabled:'bool',red:[0,255],green:[0,255],blue:[0,255],alpha:[0,255]};
const split={splitDistance:[0,127],innerSplitAlpha:[0,1,20],outerSplitAlpha:[.3,1,20],splitSizeRatio:[0,1,100]};
const pixel={...common,...split,gap:[0,255],length:[0,255],thickness:[0,31],dynamicSpreadLimit:[0,255],screenHeight:[240,65535]};
const specs={
  'legacy-v1':{...common,style:[0,5],gap:[-12.8,12.7,10],outline:[0,127.5,2],splitDistance:[0,7],fixedCrosshairGap:[-12.8,12.7,10],color:[0,5],outlineEnabled:'bool',innerSplitAlpha:[0,1,10],outerSplitAlpha:[0,1,10],splitSizeRatio:[0,1,10],thickness:[0,25.5,10],length:[0,25.5,10],deployedWeaponGapEnabled:'bool',alphaEnabled:'bool'},
  'legacy-v3':{...pixel,style:[0,7],outlineEnabled:'bool'},
  'legacy-v4':{...pixel,style:[0,8],outlineMode:[0,2]},
  'cs2-v1':{...pixel,style:[0,9],gap:[-3840,3840],thickness:[0,32],innerSplitAlpha:[0,1,100],outerSplitAlpha:[.3,1,100],outlineMode:[0,2],outlineRed:[0,255],outlineGreen:[0,255],outlineBlue:[0,255],outlineAlpha:[0,255],scopeDotScale:[.1,2,100],scopeDotUseCrosshairColor:'bool'},
};
export class CrosshairCodeError extends Error {
  constructor(message,reason='invalid'){super(message);this.name='CrosshairCodeError';this.reason=reason;}
}
const fail=(message,reason)=>{throw new CrosshairCodeError(message,reason);};
function fieldProblems(fields){
  const spec=specs[fields?.format];if(!spec)return ['format'];
  return Object.entries(spec).filter(([key,rule])=>{
    const v=fields[key];if(rule==='bool')return typeof v!=='boolean';
    const [min,max,scale=1]=rule;return typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||Math.abs(v*scale-Math.round(v*scale))>1e-8;
  }).map(([key])=>key);
}
function assertFields(fields){const issues=fieldProblems(fields);if(issues.length)fail('Campos da mira ausentes, fora do intervalo ou não representáveis: '+issues.join(', '),'fields');}
function containerOf(format){return format==='cs2-v1'?'cs2':'legacy';}
function parseContainer(input){
  if(typeof input!=='string'||input.length>64)fail('Código de mira inválido.','syntax');
  const code=input.trim();let chars,container;
  if(new RegExp(`^CSGO-[${ALPHABET}]{5}(?:-[${ALPHABET}]{5}){4}$`).test(code)){container='legacy';chars=code.slice(5).replaceAll('-','');}
  else if(new RegExp(`^CS[${ALPHABET}]{44}$`).test(code)){container='cs2';chars=code.slice(2);}
  else fail('Formato, tamanho ou alfabeto do código de mira inválido.','syntax');
  const byteLength=container==='legacy'?18:32;let value=0n;
  for(let i=chars.length-1;i>=0;i--)value=value*BASE+BigInt(ALPHABET.indexOf(chars[i]));
  if(value>=(1n<<BigInt(byteLength*8)))fail('O código excede o tamanho do contêiner.','overflow');
  const bytes=Buffer.from(value.toString(16).padStart(byteLength*2,'0'),'hex');
  if(bytes[0]!==bytes.subarray(1).reduce((a,b)=>a+b,0)%256)fail('Checksum do código de mira inválido.','checksum');
  const format=`${container}-v${bytes[1]}`;
  if(!specs[format])fail('Versão de código de mira desconhecida: '+format+'.','version');
  return {code,container,bytes,format};
}
function serialize(bytes,container){
  bytes[0]=bytes.subarray(1).reduce((a,b)=>a+b,0)%256;
  let value=BigInt('0x'+bytes.toString('hex')),chars='';const count=container==='legacy'?25:44;
  for(let i=0;i<count;i++){chars+=ALPHABET[Number(value%BASE)];value/=BASE;}
  if(value!==0n)fail('O código excede o tamanho do contêiner.','overflow');
  return container==='legacy'?'CSGO-'+chars.match(/.{5}/g).join('-'):'CS'+chars;
}
function unpack(bytes,format){
  const v1=format==='legacy-v1',modern=format==='cs2-v1';
  if(v1)return {format,gap:bytes.readInt8(2)/10,outline:bytes[3]/2,red:bytes[4],green:bytes[5],blue:bytes[6],alpha:bytes[7],splitDistance:bytes[8]&7,followRecoil:!!(bytes[8]&128),fixedCrosshairGap:bytes.readInt8(9)/10,color:bytes[10]&7,outlineEnabled:!!(bytes[10]&8),innerSplitAlpha:(bytes[10]>>>4)/10,outerSplitAlpha:(bytes[11]&15)/10,splitSizeRatio:(bytes[11]>>>4)/10,thickness:bytes[12]/10,style:(bytes[13]>>>1)&7,centerDotEnabled:!!(bytes[13]&16),deployedWeaponGapEnabled:!!(bytes[13]&32),alphaEnabled:!!(bytes[13]&64),tStyleEnabled:!!(bytes[13]&128),length:bytes[14]/10};
  const flags=bytes[modern?4:2],bits=bytes.readUInt32LE(modern?18:10),offset=modern?5:3;
  const fields={format,style:flags&(modern?31:15),followRecoil:!!(flags&(modern?32:16)),centerDotEnabled:!!(flags&64),tStyleEnabled:!!(flags&128),red:bytes[offset],green:bytes[offset+1],blue:bytes[offset+2],alpha:bytes[offset+3],gap:modern?bytes.readInt16LE(14):bytes[7],length:bytes[modern?16:8],dynamicSpreadLimit:bytes[modern?17:9],splitDistance:bits&127,innerSplitAlpha:((bits>>7)&(modern?127:31))/(modern?100:20),outerSplitAlpha:(((bits>>(modern?14:12))&(modern?127:15))+(modern?30:6))/(modern?100:20),splitSizeRatio:((bits>>(modern?21:16))&127)/100,thickness:modern?bytes[13]&63:(bits>>>23)&31,screenHeight:bytes.readUInt16LE(modern?2:14)};
  if(modern)Object.assign(fields,{outlineMode:bytes[13]>>>6,outlineRed:bytes[9],outlineGreen:bytes[10],outlineBlue:bytes[11],outlineAlpha:bytes[12],scopeDotScale:(bytes[22]+10)/100,scopeDotUseCrosshairColor:!!(bits&0x10000000)});
  else if(format==='legacy-v4')fields.outlineMode=(bits>>>28)&3;
  else fields.outlineEnabled=!!(flags&32);
  return fields;
}
function reservedPresent(b,format){
  if(format==='legacy-v1')return !!((b[8]&0x78)||(b[13]&1)||b.subarray(15).some(x=>x));
  if(format==='legacy-v3')return !!((b[13]&0xf0)||b.subarray(16).some(x=>x));
  if(format==='legacy-v4')return !!((b[2]&32)||(b[13]&0xc0)||b.subarray(16).some(x=>x));
  return !!((b[21]&0xe0)||b.subarray(23).some(x=>x));
}
export function decodeCrosshairCode(input){
  const {code,container,bytes,format}=parseContainer(input),fields=unpack(bytes,format),warnings=[];
  if(container==='legacy')warnings.push('Contêiner CSGO histórico: o CS2 atual pode recusar sua importação. Não há conversão automática para o contêiner CS.');
  const issues=fieldProblems(fields);
  if(issues.length)warnings.push('O conteúdo bruto inclui valores fora dos limites documentados do jogo: '+issues.join(', ')+'. O codec preserva os valores; não os limita silenciosamente.');
  if(reservedPresent(bytes,format))warnings.push('Bits reservados preservados no código de origem; o significado deles é desconhecido.');
  return {code,format,container,codeVersion:bytes[1],fields,rawHex:bytes.toString('hex'),warnings,fieldIssues:issues};
}
function writeFields(b,f){
  const modern=f.format==='cs2-v1',r=v=>Math.round(v),flag=(at,mask,value)=>{b[at]=(b[at]&~mask)|(value?mask:0);};
  if(f.format==='legacy-v1'){
    b[2]=r(f.gap*10)&255;b[3]=r(f.outline*2);b[4]=f.red;b[5]=f.green;b[6]=f.blue;b[7]=f.alpha;
    b[8]=(b[8]&0x78)|f.splitDistance|(Number(f.followRecoil)<<7);b[9]=r(f.fixedCrosshairGap*10)&255;
    b[10]=f.color|(Number(f.outlineEnabled)<<3)|(r(f.innerSplitAlpha*10)<<4);b[11]=r(f.outerSplitAlpha*10)|(r(f.splitSizeRatio*10)<<4);b[12]=r(f.thickness*10);
    b[13]=(b[13]&1)|(f.style<<1)|(Number(f.centerDotEnabled)<<4)|(Number(f.deployedWeaponGapEnabled)<<5)|(Number(f.alphaEnabled)<<6)|(Number(f.tStyleEnabled)<<7);b[14]=r(f.length*10);return;
  }
  const at=modern?4:2,offset=modern?5:3;
  b[at]=(modern?0:b[at]&32)|f.style|(Number(f.followRecoil)<<(modern?5:4))|(Number(f.centerDotEnabled)<<6)|(Number(f.tStyleEnabled)<<7);
  ['red','green','blue','alpha'].forEach((key,i)=>b[offset+i]=f[key]);
  if(modern){
    b.writeUInt16LE(f.screenHeight,2);b.writeInt16LE(f.gap,14);b[16]=f.length;b[17]=f.dynamicSpreadLimit;
    ['outlineRed','outlineGreen','outlineBlue','outlineAlpha'].forEach((key,i)=>b[9+i]=f[key]);b[13]=f.thickness|(f.outlineMode<<6);
    const bits=((b.readUInt32LE(18)&0xe0000000)|f.splitDistance|(r(f.innerSplitAlpha*100)<<7)|((r(f.outerSplitAlpha*100)-30)<<14)|(r(f.splitSizeRatio*100)<<21)|(Number(f.scopeDotUseCrosshairColor)<<28))>>>0;
    b.writeUInt32LE(bits,18);b[22]=r(f.scopeDotScale*100)-10;
  }else{
    b[7]=f.gap;b[8]=f.length;b[9]=f.dynamicSpreadLimit;b.writeUInt16LE(f.screenHeight,14);
    let bits=((b.readUInt32LE(10)&(f.format==='legacy-v4'?0xc0000000:0xf0000000))|f.splitDistance|(r(f.innerSplitAlpha*20)<<7)|((r(f.outerSplitAlpha*20)-6)<<12)|(r(f.splitSizeRatio*100)<<16)|(f.thickness<<23))>>>0;
    if(f.format==='legacy-v4')bits=(bits|(f.outlineMode<<28))>>>0;
    else flag(2,32,f.outlineEnabled);
    b.writeUInt32LE(bits,10);
  }
}
/** Full upstream field object, optionally patched over an original code.
 * A source code preserves unknown bits. Format changes are always refused.
 * Missing/new unknown fields and inexact numeric quantization are refused.
 */
export function encodeCrosshairCode(fields,options={}){
  if(!fields||typeof fields!=='object'||Array.isArray(fields))fail('Campos de mira inválidos.','fields');
  const source=options.sourceCode?decodeCrosshairCode(options.sourceCode):null;
  const f={...(source?.fields??{}),...fields};
  if(source&&f.format!==source.format)fail('Conversão entre formatos de mira exige uma decisão explícita e não é suportada.','conversion');
  if(!specs[f.format])fail('Formato de código desconhecido.','version');
  const unknown=Object.keys(f).filter(key=>key!=='format'&&!Object.hasOwn(specs[f.format],key));
  if(unknown.length)fail('Campos desconhecidos não podem ser descartados: '+unknown.join(', '),'fields');
  // Exact source round trips may carry out-of-range raw fields; edits must be valid.
  const same=source&&Object.keys(specs[f.format]).every(key=>f[key]===source.fields[key]);
  if(same)return {code:source.code,format:source.format,warnings:[...source.warnings]};
  assertFields(f);
  const b=source?Buffer.from(source.rawHex,'hex'):Buffer.alloc(containerOf(f.format)==='legacy'?18:32);
  b[1]=Number(f.format.slice(f.format.lastIndexOf('v')+1));writeFields(b,f);
  const code=serialize(b,containerOf(f.format));return {code,format:f.format,warnings:decodeCrosshairCode(code).warnings};
}

const editorShared={style:'style',followRecoil:'followRecoil',dot:'centerDotEnabled',tStyle:'tStyleEnabled',red:'red',green:'green',blue:'blue',alpha:'alpha'};
const editorLegacy={...editorShared,size:'length',gap:'gap',thickness:'thickness',color:'color',useAlpha:'alphaEnabled',outline:'outlineEnabled',outlineThickness:'outline'};
const editorPixel={...editorShared,lengthPixels:'length',gapPixels:'gap',thicknessPixels:'thickness',screenHeight:'screenHeight',spreadLimit:'dynamicSpreadLimit'};
const ranges={size:[0,10],gap:[-10,10],thickness:[0,5],color:[0,5],outlineThickness:[0,3],style:[0,8],lengthPixels:[0,255],gapPixels:[0,255],thicknessPixels:[0,31],screenHeight:[0,16384],spreadLimit:[0,255]};
/** A source is retained for fields outside the editor. To apply the whole mira,
 * integration must retain shareCodeSource AND emit crosshairCodeToConVars after
 * overlaying the edited fields through editorCrosshairToCode. Geometry which the
 * present editor cannot represent yields canImport:false, never a clamped patch.
 */
export function crosshairCodeToEditor(decoded,baseCrosshair={}){
  const d=decodeCrosshairCode(typeof decoded==='string'?decoded:decoded?.code),f=d.fields,legacy=f.format==='legacy-v1',mapping=legacy?editorLegacy:editorPixel;
  const crosshair={...baseCrosshair,version:legacy?2:3,shareCodeSource:d.code},warnings=[...d.warnings],unsupportedFields=[];
  for(const [editorKey,fieldKey] of Object.entries(mapping))crosshair[editorKey]=f[fieldKey];
  if(!legacy){crosshair.color=5;crosshair.useAlpha=true;crosshair.outlineMode=f.format==='legacy-v3'?Number(f.outlineEnabled):f.outlineMode;crosshair.outline=crosshair.outlineMode!==0;}
  for(const [key,bounds] of Object.entries(ranges))if(Object.hasOwn(crosshair,key)&&(crosshair[key]<bounds[0]||crosshair[key]>bounds[1]))unsupportedFields.push(key);
  if(legacy&&f.style>5)unsupportedFields.push('style');
  const represented=new Set([...Object.values(mapping),'format',...(legacy?[]:f.format==='legacy-v3'?['outlineEnabled']:['outlineMode'])]);
  const preservedFields=Object.keys(f).filter(key=>!represented.has(key));
  if(preservedFields.length)warnings.push('Campos adicionais são preservados no código de origem: '+preservedFields.join(', ')+'. A aplicação completa precisa usar o código de origem junto das edições.');
  if(unsupportedFields.length)warnings.push('O editor atual não representa: '+unsupportedFields.join(', ')+'. Importe outro código ou mantenha o original sem editar.');
  if(d.fieldIssues.length)warnings.push('Importação no editor recusada por valores fora dos limites documentados.');
  return {crosshair,canImport:unsupportedFields.length===0&&d.fieldIssues.length===0,unsupportedFields,preservedFields,requiresSourcePreservation:true,warnings};
}
/** Without sourceCode, complete extraFields are required rather than guessed. */
export function editorCrosshairToCode(crosshair,options={}){
  if(!crosshair||![2,3].includes(crosshair.version))fail('Formato de editor desconhecido.','editor');
  const sourceCode=options.sourceCode??crosshair.shareCodeSource,source=sourceCode?decodeCrosshairCode(sourceCode):null;
  const format=options.format??source?.format??(crosshair.version===2?'legacy-v1':'legacy-v4');
  if(!specs[format])fail('Formato de código desconhecido.','version');
  if((crosshair.version===2)!==(format==='legacy-v1'))fail('Não é permitido converter medidas legadas em pixels automaticamente.','conversion');
  if(source&&format!==source.format)fail('O formato escolhido difere do código de origem.','conversion');
  const fields={...(source?.fields??{}),...(options.extraFields??{}),format};
  for(const [key,field] of Object.entries(crosshair.version===2?editorLegacy:editorPixel))fields[field]=crosshair[key];
  if(crosshair.version===3){
    if(typeof crosshair.outline!=='boolean')fail('Opção de contorno inválida.','fields');
    const mode=crosshair.outline?crosshair.outlineMode:0;
    if(format==='legacy-v3'){
      if(![0,1].includes(mode))fail('O formato legacy-v3 não representa contorno parcial.','conversion');
      fields.outlineEnabled=mode===1;
    }else fields.outlineMode=mode;
    if(crosshair.color!==5){const color=[[255,0,0],[0,255,0],[255,255,0],[0,100,255],[0,255,255]][crosshair.color];if(!color)fail('Cor da mira inválida.','fields');[fields.red,fields.green,fields.blue]=color;}
  }
  const result=encodeCrosshairCode(fields,{sourceCode});
  result.warnings.push('A largura da mira sniper e outras opções externas ao layout do código não fazem parte do compartilhamento.');
  return result;
}
/** Closed ConVar list from audited layouts; never accepts arbitrary commands. */
export function crosshairCodeToConVars(input){
  const f=typeof input==='string'?decodeCrosshairCode(input).fields:input?.fields??input;assertFields(f);
  const pairs=[['cl_crosshairstyle',f.style],['cl_crosshair_recoil',Number(f.followRecoil)],['cl_crosshairdot',Number(f.centerDotEnabled)],['cl_crosshair_t',Number(f.tStyleEnabled)],['cl_crosshaircolor_r',f.red],['cl_crosshaircolor_g',f.green],['cl_crosshaircolor_b',f.blue],['cl_crosshair_dynamic_splitdist',f.splitDistance],['cl_crosshair_dynamic_splitalpha_innermod',f.innerSplitAlpha],['cl_crosshair_dynamic_splitalpha_outermod',f.outerSplitAlpha],['cl_crosshair_dynamic_maxdist_splitratio',f.splitSizeRatio]];
  if(f.format==='legacy-v1')pairs.push(['cl_crosshair_drawoutline',Number(f.outlineEnabled)],['cl_crosshairsize',f.length],['cl_crosshairgap',f.gap],['cl_crosshairthickness',f.thickness],['cl_crosshair_outlinethickness',f.outline],['cl_crosshaircolor',f.color],['cl_crosshairalpha',f.alpha],['cl_crosshairusealpha',Number(f.alphaEnabled)],['cl_fixedcrosshairgap',f.fixedCrosshairGap],['cl_crosshairgap_useweaponvalue',Number(f.deployedWeaponGapEnabled)]);
  else pairs.push(['cl_crosshair_drawoutline',f.format==='legacy-v3'?Number(f.outlineEnabled):f.outlineMode],['cl_crosshair_length',f.length],['cl_crosshair_gap',f.gap],['cl_crosshair_thickness',f.thickness],['cl_crosshair_screen_height',f.screenHeight],['cl_crosshair_dynamic_spread_limit',f.dynamicSpreadLimit],['cl_crosshaircolor_a',f.alpha]);
  if(f.format==='cs2-v1')pairs.push(['cl_crosshairoutline_r',f.outlineRed],['cl_crosshairoutline_g',f.outlineGreen],['cl_crosshairoutline_b',f.outlineBlue],['cl_crosshairoutline_a',f.outlineAlpha],['cl_ironsight_dot_scale',f.scopeDotScale],['cl_ironsight_usecrosshaircolor',Number(f.scopeDotUseCrosshairColor)]);
  return pairs.map(([key,value])=>`${key} "${value}"`).join('\r\n');
}
