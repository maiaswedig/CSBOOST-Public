import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readSystemInventory} from './system-worker.mjs';
import {compareAmdStability} from './amd-tuning.mjs';

const execute=promisify(execFile);
const ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=value=>typeof value==='string'&&value.length<=256&&!/[\x00-\x1f]/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape=value=>String(value??'Não informado').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const COPY='A frequência informada pelo SMBIOS não confirma XMP/EXPO ativado, perfis disponíveis ou operação em dual channel. O CSBOOST não lê SPD nem altera memória/firmware.';

export function memoryGuide(board){
  const manufacturer=board?.manufacturer||'',product=board?.product||'';
  if(/gigabyte/i.test(manufacturer))return {vendor:'Gigabyte',profileLabel:'Extreme Memory Profile (X.M.P.) / EXPO',url:/^B450M AORUS ELITE$/i.test(product.trim())?'https://download.gigabyte.com/FileList/Manual/mb_manual_b450m-aorus-elite_e_1201.pdf':'https://www.gigabyte.com/Support',location:/^B450M AORUS ELITE$/i.test(product.trim())?'M.I.T. → Advanced Memory Settings → Extreme Memory Profile (X.M.P.)':'Consulte o manual da revisão exata da placa; o menu varia com a BIOS.'};
  if(/asus|asustek/i.test(manufacturer))return {vendor:'ASUS',profileLabel:'XMP / DOCP / EXPO',url:'https://www.asus.com/support/faq/1042256/',location:'Procure o perfil de memória em Ai Tweaker/Extreme Tweaker, conforme o manual da placa.'};
  if(/micro-star|\bmsi\b/i.test(manufacturer))return {vendor:'MSI',profileLabel:'A-XMP / XMP / EXPO',url:'https://us.msi.com/support/technical_details/MB_OC_RAM',location:'Procure o perfil de memória no menu OC; confirme o nome e as opções no manual da placa.'};
  if(/asrock/i.test(manufacturer))return {vendor:'ASRock',profileLabel:'Load XMP Setting / EXPO',url:'https://www.asrock.com/support/faq.asp?k=memory',location:'Consulte o menu de memória no manual da placa e a revisão da BIOS.'};
  return {vendor:null,profileLabel:'XMP / EXPO (se disponível)',url:'https://www.intel.com/content/www/us/en/support/articles/000094616/processors.html',location:'Confirme no manual do fabricante se CPU, placa e módulos aceitam um perfil de memória.'};
}

export function describeMemory(value){
  if(!object(value)||!string(value.cpu)||!object(value.board)||!['manufacturer','product','version'].every(key=>string(value.board[key]))||!string(value.bios)||!Array.isArray(value.modules)||!value.modules.length||value.modules.length>256)throw new Error('Inventário de memória incompleto.');
  const modules=value.modules.map(item=>{
    if(!object(item)||!['locator','bank','manufacturer','partNumber'].every(key=>string(item[key]))||!integer(item.capacityBytes,1,2**50)||!integer(item.configuredClockMHz,0,100000)||!integer(item.reportedSpeed,0,100000)||!integer(item.smbiosType,0,1024)||!integer(item.configuredVoltageMv,0,10000)||!integer(item.formFactor,0,255))throw new Error('O firmware retornou propriedades de memória inválidas.');
    const type={24:'DDR3',26:'DDR4',34:'DDR5',30:'LPDDR4',35:'LPDDR5'}[item.smbiosType]||'Não identificado';
    return {locator:item.locator.trim(),bank:item.bank.trim(),capacityBytes:item.capacityBytes,manufacturer:item.manufacturer.trim(),partNumber:item.partNumber.trim(),configuredClockMHz:item.configuredClockMHz||null,reportedSpeed:item.reportedSpeed||null,smbiosType:item.smbiosType,configuredVoltageMv:item.configuredVoltageMv||null,formFactor:item.formFactor,type};
  }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const totalBytes=modules.reduce((sum,item)=>sum+item.capacityBytes,0);if(!Number.isSafeInteger(totalBytes))throw new Error('Capacidade de memória inválida.');
  const configuration={cpu:value.cpu.trim(),board:{manufacturer:value.board.manufacturer,product:value.board.product,version:value.board.version},bios:value.bios,modules};
  const configuredClocksMHz=[...new Set(modules.map(item=>item.configuredClockMHz))].sort((a,b)=>(a??0)-(b??0));
  const warnings=[];
  if(configuredClocksMHz.includes(null))warnings.push('O firmware não informou a frequência configurada de todos os módulos.');
  if(configuredClocksMHz.filter(Boolean).length>1)warnings.push('O SMBIOS informa frequências diferentes entre módulos; confira a leitura na BIOS.');
  if(modules.some(item=>!item.partNumber||/^unknown|^not specified|^undefined$/i.test(item.partNumber)))warnings.push('O modelo de um ou mais módulos não foi identificado; confira a etiqueta e o manual antes de escolher um perfil.');
  return {available:true,readOnly:true,canApply:false,xmpEnabled:null,expoEnabled:null,profileSupport:null,dualChannel:null,source:'Win32_PhysicalMemory / SMBIOS',...configuration,totalBytes,totalGB:totalBytes/2**30,moduleCount:modules.length,configuredClocksMHz,configurationSHA256:digest(configuration),guide:memoryGuide(value.board),warnings,message:COPY,reason:'Ativação direta de XMP/EXPO não está implementada. O perfil é selecionado na BIOS ou em uma ferramenta compatível do fabricante.'};
}

export function compareMemoryConfigurations(before,after){
  if(!before?.available||!after?.available)return {available:false,changes:[],warnings:['Não foi possível ler a memória antes e depois.']};
  const changes=[];
  const add=(field,label,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))changes.push({field,label,before:a,after:b});};
  add('cpu','Processador',before.cpu,after.cpu);add('board','Placa-mãe',before.board,after.board);add('bios','BIOS',before.bios,after.bios);
  add('capacity','Capacidade total em GB',before.totalGB,after.totalGB);add('moduleCount','Quantidade de módulos',before.moduleCount,after.moduleCount);
  add('configuredClocksMHz','Frequência configurada informada pelo SMBIOS (MHz)',before.configuredClocksMHz,after.configuredClocksMHz);
  const dimms=info=>info.modules.map(item=>({capacityBytes:item.capacityBytes,manufacturer:item.manufacturer,partNumber:item.partNumber,smbiosType:item.smbiosType})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  add('modules','Identificação dos módulos',dimms(before),dimms(after));
  add('configuredVoltageMv','Tensão configurada informada pelo SMBIOS (mV)',before.modules.map(item=>item.configuredVoltageMv).sort(),after.modules.map(item=>item.configuredVoltageMv).sort());
  const warnings=[COPY];if(changes.some(item=>['cpu','board','modules','capacity','moduleCount'].includes(item.field)))warnings.push('A composição do hardware mudou. Essa referência não isola o efeito de um perfil de memória.');
  return {available:true,changed:changes.length>0,changes,warnings,xmpEnabled:null,expoEnabled:null};
}

export function createMemoryTuning({directory,amdTuning,runInventory,platform=process.platform,arch=process.arch,now=()=>new Date().toISOString()}={}){
  if(runInventory!==undefined&&typeof runInventory!=='function')throw new Error('Leitor de memória inválido.');
  async function snapshot(){
    if(platform!=='win32'||arch!=='x64')throw new Error('Diagnóstico de memória exige Windows de 64 bits.');
    if(runInventory)return describeMemory(await runInventory());
    return describeMemory(await readSystemInventory({operation:'memory'}));
  }
  async function readFile(name){if(!directory)return null;const file=path.join(directory,name);let stat;try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)throw new Error('Referência de hardware inválida.');return JSON.parse(await fs.readFile(file,'utf8'));}
  async function write(name,value,{exclusive=false}={}){if(!directory)throw new Error('Armazenamento de referência indisponível.');await fs.mkdir(directory,{recursive:true});const target=path.join(directory,name);if(exclusive){await fs.writeFile(target,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});return;}const temp=target+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});await fs.rename(temp,target);}
  async function reference(){const pointer=await readFile('reference.json');if(!pointer)return null;if(!ID.test(pointer.id))throw new Error('Referência de hardware inválida.');const record=await readFile(pointer.id+'.json');if(!record||record.version!==1||record.id!==pointer.id||!Number.isFinite(Date.parse(record.capturedAt))||!record.memory?.available||!Array.isArray(record.memory.modules))throw new Error('Referência de hardware inválida.');const memory=describeMemory({...record.memory,modules:record.memory.modules.map(item=>({...item,configuredClockMHz:item.configuredClockMHz??0,reportedSpeed:item.reportedSpeed??0,configuredVoltageMv:item.configuredVoltageMv??0}))});if(memory.configurationSHA256!==record.memory.configurationSHA256)throw new Error('A referência de hardware foi alterada ou está incompleta.');return {...record,memory};}
  async function inspect(){let info;try{info=await snapshot();}catch(error){info={available:false,readOnly:true,canApply:false,xmpEnabled:null,expoEnabled:null,profileSupport:null,dualChannel:null,reason:error.message,message:COPY};}let stored=null,verification=null,referenceError=null;try{stored=await reference();const check=await readFile('verification.json');if(stored&&check?.referenceId===stored.id)verification=check;}catch(error){referenceError=error.message;}return {...info,reference:stored,verification,referenceError};}
  async function captureReference(options={}){
    if(!object(options)||Object.keys(options).some(key=>key!=='note')||(options.note!==undefined&&(!string(options.note)||options.note.length>256)))throw new Error('Anotação de referência inválida.');
    const [memory,stabilityBefore]=await Promise.all([snapshot(),amdTuning?.readStability()??null]);
    const record={version:1,id:crypto.randomUUID(),capturedAt:now(),note:options.note?.trim()||'',source:'read-only SMBIOS; PBO/CO and memory profiles not read',memory,stabilityBefore};
    await write(record.id+'.json',record,{exclusive:true});await write('reference.json',{id:record.id});return record;
  }
  async function checkReference(){
    const before=await reference();if(!before)throw new Error('Guarde uma referência antes de ajustar o hardware.');
    const after=await snapshot();let stability={available:false,message:'Leitura WHEA indisponível.'};
    if(amdTuning&&before.stabilityBefore){try{const final=await amdTuning.readStability({since:before.stabilityBefore.capturedAt});stability=compareAmdStability(before.stabilityBefore,final);}catch(error){stability={available:false,message:error.message};}}
    const result={version:1,referenceId:before.id,checkedAt:now(),before:before.memory,after,comparison:compareMemoryConfigurations(before.memory,after),stability,pboReadBack:false,profileReadBack:false};
    await write('check-'+crypto.randomUUID()+'.json',result,{exclusive:true});await write('verification.json',result);return result;
  }
  async function renderGuide(){const info=await snapshot(),stored=await reference();return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CSBOOST — memória e firmware</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:24px;background:#141416;color:#eee;line-height:1.6}td,th{text-align:left;padding:12px;border-bottom:1px solid #555}a{color:#9be5bd}table{width:100%}small{color:#bbb}</style><h1>CSBOOST — memória e firmware</h1><p>${escape(info.cpu)} · ${escape(info.board.product)} · BIOS ${escape(info.bios)}</p><table><tr><th>Módulo</th><th>Capacidade</th><th>Frequência configurada (SMBIOS)</th><th>Modelo</th></tr>${info.modules.map((item,index)=>`<tr><td>${index+1} · ${escape(item.type)}</td><td>${item.capacityBytes/2**30} GB</td><td>${item.configuredClockMHz??'Não informada'} MHz</td><td>${escape(item.partNumber)}</td></tr>`).join('')}</table><p>${escape(COPY)}</p><ol><li>Guarde uma referência no CSBOOST e faça um benchmark antes de alterar o hardware. ${stored?'Referência atual: '+escape(stored.capturedAt)+'.':'Nenhuma referência salva.'}</li><li>Consulte o manual da revisão exata da placa. Anote ou fotografe os valores anteriores de PBO/CO e memória na BIOS/ferramenta do fabricante.</li><li>Memória: ${escape(info.guide.location)}. Se existir um perfil compatível com seu kit e sua placa, selecione-o conforme o manual, sem copiar tensões ou timings de outro PC.</li><li>PBO/CO: use o Ryzen Master em CPUs compatíveis ou as opções documentadas da BIOS. Altere um recurso por vez; não há offset universal para todos os processadores.</li><li>Depois de reiniciar, abra o CSBOOST, clique em “Conferir após ajuste” e repita o benchmark nas mesmas condições. Valide também a estabilidade em outras cargas.</li><li>Para desfazer uma mudança de firmware, restaure os valores anteriores na mesma ferramenta. O CSBOOST não restaura PBO/CO ou XMP/EXPO automaticamente.</li></ol><p><a href="${escape(info.guide.url)}">Guia oficial de memória / placa</a> · <a href="https://docs.amd.com/r/en-US/68886-ryzen-master-user-guide">Guia oficial AMD</a></p><small>Relatório local, sem senhas, conta Steam ou números de série. A leitura de tensão/frequência depende da precisão do SMBIOS. Ganhos de FPS precisam ser medidos.</small></html>`;}
  return {inspect,snapshot,captureReference,checkReference,renderGuide};
}
