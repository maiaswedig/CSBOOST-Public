import path from 'node:path';
import {readSystemInventory} from './system-worker.mjs';

export const AMD_LINKS=Object.freeze({download:'https://www.amd.com/en/products/software/ryzen-master.html',guide:'https://docs.amd.com/r/en-US/68886-ryzen-master-user-guide',curveOptimizer:'https://docs.amd.com/r/en-US/68886-ryzen-master-user-guide/Curve-Optimizer',monitoringSdk:'https://www.amd.com/en/developer/ryzen-master-monitoring-sdk.html'});
const LIMIT=200,DAY=86400000;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const count=(value,max=65536)=>Number.isInteger(value)&&value>=0&&value<=max;
const text=(value,max=512)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
const copy=value=>JSON.parse(JSON.stringify(value));
const STABILITY_MESSAGE='Eventos WHEA indicam erros de hardware registrados pelo Windows. A ausência de eventos não certifica estabilidade de PBO/CO nem identifica a causa de um erro.';
function iso(value,label){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new Error(`${label} inválido.`);return value;}
function windowsPath(value){return typeof value==='string'&&/^[A-Za-z]:\\/.test(value)&&!/[\x00-\x1f]/.test(value)&&path.win32.normalize(value)===value;}
function verifiedExecutable(executable,roots){
  if(!object(executable)||!windowsPath(executable.path)||path.win32.basename(executable.path).toLowerCase()!=='amd ryzen master.exe'||executable.regular!==true||executable.reparse!==false||executable.signatureStatus!=='Valid'||!/^Advanced Micro Devices(?:,? Inc\.?)?$/i.test(executable.signer)||!text(executable.version,128)||!(/^[a-f\d]{64}$/i).test(executable.sha256))return false;
  return roots.some(root=>windowsPath(root)&&executable.path.toLowerCase().startsWith((path.win32.join(root,'AMD')+'\\').toLowerCase()));
}
function binaryDescriptor(value){return !!(object(value)&&windowsPath(value.path)&&value.regular===true&&value.reparse===false&&text(value.version,128)&&text(value.signatureStatus,64)&&text(value.signer,256)&&typeof value.sha256==='string'&&/^[a-f\d]{64}$/i.test(value.sha256));}
function describeControl(drivers,executable){
  const official=drivers.filter(driver=>/^AMDRyzenMasterDriver(?:V\d+)?$/i.test(driver.name)).sort((a,b)=>Number(b.state==='Running')-Number(a.state==='Running')||Number(/V(\d+)$/i.exec(b.name)?.[1]??0)-Number(/V(\d+)$/i.exec(a.name)?.[1]??0));
  const verified=driver=>binaryDescriptor(driver.binary)&&path.win32.basename(driver.binary.path).toLowerCase()==='amdryzenmasterdriver.sys'&&driver.binary.signatureStatus==='Valid'&&/^Advanced Micro Devices(?:,? Inc\.?)?$/i.test(driver.binary.signer);
  const driver=official.find(verified)??official[0]??null,pawn=drivers.filter(item=>/^PawnIO$/i.test(item.name));
  const driverStatus={present:!!driver,name:driver?.name??null,running:driver?.state==='Running',onDiskVerified:!!driver&&verified(driver),version:driver?.binary?.version??null,loadedImageVerified:false,reason:!driver?'Driver do Ryzen Master não encontrado.':!verified(driver)?'Não foi possível validar a assinatura AMD e o arquivo do driver no disco.':driver.state!=='Running'?'O driver AMD foi encontrado, mas o Windows não o informa como em execução.':'Arquivo do driver com assinatura AMD válida; o Windows informa o serviço em execução. Isso não verifica a imagem carregada nem habilita uma API de controle no CSBOOST.'};
  const blockers=[{code:'backend-missing',message:'O CSBOOST não possui backend SMU próprio validado para esta CPU.'},{code:'readback-unverified',message:'Offsets CO e limites PBO atuais não foram lidos do hardware.'},{code:'rollback-unverified',message:'A restauração exata dos valores anteriores de firmware não foi validada.'}];
  if(!pawn.some(item=>item.state==='Running'))blockers.push({code:'pawnio-unavailable',message:'PawnIO não foi observado em execução; o driver AMD do Ryzen Master é um componente diferente.'});
  return {driver:driverStatus,directControl:{available:false,readBackAvailable:false,rollbackAvailable:false,backend:null,pawnIoDetected:pawn.length>0,pawnIoRunning:pawn.some(item=>item.state==='Running'),officialToolAvailable:!!executable,publicSdkAccess:'read-only',blockers,message:'Ryzen Master instalado permite usar a ferramenta oficial. Não confirma leitura, aplicação ou recuperação automática de PBO/CO pelo CSBOOST.'}};
}
function inventory(value){
  if(!object(value)||!object(value.cpu)||!object(value.board)||!object(value.bios)||!object(value.os)||!Array.isArray(value.programFiles)||value.programFiles.length>8||!Array.isArray(value.executables)||value.executables.length>48||!Array.isArray(value.drivers)||value.drivers.length>32)throw new Error('O inventário AMD não retornou dados válidos.');
  const {cpu,board,bios,os}=value;
  if(!text(cpu.name)||!text(cpu.manufacturer,128)||!count(cpu.physicalCores,4096)||cpu.physicalCores<1||!count(cpu.logicalCores,4096)||cpu.logicalCores<cpu.physicalCores||!text(cpu.processorId,32)||!text(board.manufacturer)||!text(board.product)||!text(board.version)||!text(bios.version)||!(bios.releaseDate===null||(text(bios.releaseDate,64)&&Number.isFinite(Date.parse(bios.releaseDate))))||!text(os.version,64)||!text(os.architecture,64)||value.programFiles.some(root=>!windowsPath(root))||value.drivers.some(driver=>!object(driver)||!text(driver.name,128)||!text(driver.state,64)||!text(driver.startMode,64)||!(/^(?:AMDRyzenMasterDriver(?:V\d+)?|PawnIO|WinRing0(?:_1_2_0)?|RyzenSMU)$/i).test(driver.name)||(driver.binary!==undefined&&driver.binary!==null&&!binaryDescriptor(driver.binary))))throw new Error('O inventário AMD contém propriedades inválidas.');
  return copy(value);
}
function describe(value){
  const c=value.cpu,amd=c.manufacturer==='AuthenticAMD',signature=/^[a-f\d]{16}$/i.test(c.processorId)?parseInt(c.processorId.slice(-8),16)>>>0:null;
  const base=signature===null?null:(signature>>>8)&15,ext=signature===null?0:(signature>>>20)&255;
  const family=base===null?null:base===15?base+ext:base,model=signature===null?null:(((base===6||base===15)?((signature>>>16)&15):0)<<4)|((signature>>>4)&15),stepping=signature===null?null:signature&15;
  const desktop=c.name.trim().match(/^AMD Ryzen [3579] (\d{4})(?:X3D|XT|X|G|GT|GE|F|T)?(?:\s|$)/i);
  const amdRyzen=amd&&/^AMD Ryzen\b/i.test(c.name.trim()),desktopCandidate=amd&&!!desktop,series=desktop?Math.floor(Number(desktop[1])/1000):null;
  const legacyApu=series===3&&/^AMD Ryzen [3579] 3\d{3}G(?:E)?(?:\s|$)/i.test(c.name.trim());
  const pboCandidate=desktopCandidate&&!legacyApu&&[3,4,5,7,8,9].includes(series),curveOptimizerCandidate=desktopCandidate&&[5,7,8,9].includes(series);
  const chipset=value.board.product.match(/(?:^|[^A-Za-z0-9])(X470|X570|X670E?|B450|B550|B650E?|TRX50|WRX80|WRX90|A620A?|X870E?|B850|B840)(?:M|I)?(?:[^A-Za-z0-9]|$)/i)?.[1]?.toUpperCase()??null;
  const generation=amd&&family===25&&model===33?'Zen 3 (Vermeer)':null;
  const executable=value.executables.find(candidate=>verifiedExecutable(candidate,value.programFiles));
  const control=describeControl(value.drivers,executable);
  const reason=!amdRyzen?'Processador AMD Ryzen não identificado.':!desktopCandidate?'O modelo não foi confirmado como Ryzen desktop compatível.':!curveOptimizerCandidate?'A geração desktop detectada não confirma suporte a Curve Optimizer.':'PBO/CO exige controle de firmware/SMU. O CSBOOST ainda não inclui um backend próprio validado para ler, aplicar e restaurar esses parâmetros.';
  return {available:true,supported:false,canApply:false,reason,cpu:{name:c.name.trim(),manufacturer:c.manufacturer,physicalCores:c.physicalCores,logicalCores:c.logicalCores,family,model,stepping,generation},board:value.board,bios:value.bios,os:value.os,hardware:{amdRyzen,desktopCandidate,pboCandidate,curveOptimizerCandidate,chipsetCandidate:chipset,firmwareVerified:false,message:'Compatibilidade candidata pelo modelo; suporte e limites reais dependem da CPU, placa, BIOS e ferramenta AMD.'},drivers:value.drivers,ryzenMaster:{installed:value.executables.length>0,canLaunch:!!executable,version:executable?.version??null,driver:control.driver,reason:executable?null:value.executables.length?'O executável encontrado não passou na validação de caminho, arquivo regular ou assinatura AMD.':'AMD Ryzen Master não foi encontrado nos caminhos oficiais verificados.'},directControl:control.directControl,links:AMD_LINKS,currentPbo:null,currentCurveOptimizer:null};
}
function events(value){
  if(!object(value)||!Number.isSafeInteger(value.systemRecordId)||value.systemRecordId<1||!Array.isArray(value.events)||value.events.length>LIMIT+1)throw new Error('O Windows não retornou um inventário WHEA válido.');
  const list=value.events.map(event=>{
    if(!object(event)||!Number.isSafeInteger(event.recordId)||event.recordId<1||event.recordId>value.systemRecordId||!count(event.eventId)||!count(event.level,5)||!text(event.time,64)||!Number.isFinite(Date.parse(event.time)))throw new Error('O Windows retornou um evento WHEA inválido.');
    return {recordId:event.recordId,eventId:event.eventId,level:event.level,time:new Date(event.time).toISOString()};
  });
  if(new Set(list.map(event=>event.recordId)).size!==list.length)throw new Error('O inventário WHEA contém registros duplicados.');
  if(value.truncated!==undefined&&typeof value.truncated!=='boolean')throw new Error('Indicador de truncamento WHEA inválido.');
  list.sort((a,b)=>b.recordId-a.recordId);return {systemRecordId:value.systemRecordId,events:list.slice(0,LIMIT),truncated:value.truncated===true||list.length>LIMIT};
}
function stability(value){
  if(!object(value)||typeof value.available!=='boolean')throw new Error('Leitura de estabilidade inválida.');
  if(!value.available)return value;
  iso(value.capturedAt,'Data de captura WHEA');iso(value.since,'Início WHEA');iso(value.until,'Fim WHEA');
  if(value.since>value.until||value.until>value.capturedAt||typeof value.truncated!=='boolean')throw new Error('Intervalo WHEA inválido.');
  const clean=events(value);if(clean.events.some(event=>event.time<value.since||event.time>value.until))throw new Error('Evento WHEA fora do intervalo solicitado.');return {...value,...clean,truncated:value.truncated};
}
export function compareAmdStability(before,after){
  before=stability(before);after=stability(after);
  if(!before.available||!after.available)return {available:false,count:null,errorCount:null,warningCount:null,events:[],truncated:false,warnings:['Não foi possível consultar o registro WHEA antes e depois.'],message:STABILITY_MESSAGE};
  if(after.capturedAt<before.capturedAt||after.until<before.capturedAt)throw new Error('A leitura WHEA final antecede a inicial.');
  const warnings=[];
  if(after.systemRecordId<before.systemRecordId)warnings.push('O registro de eventos do Windows foi reiniciado ou limpo; a comparação está incompleta.');
  if(after.since>before.capturedAt)warnings.push('A leitura final não cobre todo o intervalo entre as medições.');
  if(after.truncated)warnings.push('Há mais de 200 eventos no intervalo; a contagem é um mínimo.');
  const reset=after.systemRecordId<before.systemRecordId;
  const added=after.events.filter(event=>event.time>=before.capturedAt&&(reset||event.recordId>before.systemRecordId));
  return {available:true,since:before.capturedAt,until:after.until,count:added.length,errorCount:added.filter(event=>event.level===1||event.level===2).length,warningCount:added.filter(event=>event.level===3).length,events:added,truncated:after.truncated||reset||after.since>before.capturedAt,warnings,message:STABILITY_MESSAGE};
}

export function createAmdTuning({runInventory,runEvents,openPath,isGameRunning=async()=>false,platform=process.platform,arch=process.arch,now=Date.now}={}){
  for(const [name,value] of Object.entries({runInventory,runEvents,openPath}))if(value!==undefined&&typeof value!=='function')throw new Error(`Adaptador AMD ${name} inválido.`);
  if(typeof isGameRunning!=='function'||typeof now!=='function')throw new Error('Monitor AMD inválido.');
  function supportedPlatform(){if(platform!=='win32'||arch!=='x64')throw new Error('Diagnóstico AMD exige Windows de 64 bits.');}
  async function readInventory(){supportedPlatform();return inventory(await (runInventory?runInventory():readSystemInventory({operation:'amdInventory'})));}
  async function inspect(){try{return describe(await readInventory());}catch(error){return {available:false,supported:false,canApply:false,reason:error.message,cpu:null,board:null,bios:null,hardware:null,drivers:[],ryzenMaster:{installed:false,canLaunch:false,version:null,reason:error.message},links:AMD_LINKS,currentPbo:null,currentCurveOptimizer:null};}}
  async function launchRyzenMaster(){
    supportedPlatform();if(!openPath)throw new Error('O abridor do AMD Ryzen Master não está disponível.');
    if(await isGameRunning())throw new Error('Feche o CS2 antes de abrir o ajuste PBO/CO.');
    const value=await readInventory(),status=describe(value),executable=value.executables.find(candidate=>verifiedExecutable(candidate,value.programFiles));
    if(!status.hardware.desktopCandidate)throw new Error(status.reason);
    if(!executable)throw new Error(status.ryzenMaster.reason);
    if(await isGameRunning())throw new Error('Feche o CS2 antes de abrir o ajuste PBO/CO.');
    const error=await openPath(executable.path);if(error)throw new Error(String(error));
    return {opened:true,version:executable.version,message:'AMD Ryzen Master aberto. Alterações PBO/CO são realizadas e restauradas pela ferramenta AMD; o CSBOOST não aplica offsets automaticamente.'};
  }
  async function readStability(options={}){
    if(!object(options)||Object.keys(options).some(key=>key!=='since'))throw new Error('Opção WHEA inválida.');
    const timestamp=now();if(!Number.isSafeInteger(timestamp))throw new Error('Relógio AMD inválido.');
    const until=new Date(timestamp).toISOString(),since=iso(options.since??new Date(timestamp-DAY).toISOString(),'Início WHEA');
    if(Date.parse(since)>timestamp||timestamp-Date.parse(since)>31*DAY)throw new Error('A leitura WHEA permite um intervalo de até 31 dias encerrado no presente.');
    try{supportedPlatform();const request={since,until},result=events(await (runEvents?runEvents(copy(request)):readSystemInventory({operation:'amdEvents',...request})));
      if(result.events.some(event=>event.time<since||event.time>until))throw new Error('O Windows retornou eventos WHEA fora do intervalo solicitado.');
      return {available:true,capturedAt:until,since,until,...result,reason:null,message:STABILITY_MESSAGE};
    }catch(error){return {available:false,capturedAt:until,since,until,systemRecordId:null,events:[],truncated:false,reason:error.message,message:STABILITY_MESSAGE};}
  }
  return {inspect,launchRyzenMaster,readStability,compareStability:compareAmdStability};
}
