import test from 'node:test';
import assert from 'node:assert/strict';
import {createAmdTuning,compareAmdStability,AMD_LINKS} from '../src/free/amd-tuning.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const time=Date.parse('2026-10-14T15:00:00.000Z');
function baseline(){return {cpu:{name:'AMD Ryzen 5 5600 6-Core Processor  ',manufacturer:'AuthenticAMD',physicalCores:6,logicalCores:12,processorId:'178BFBFF00A20F12'},board:{manufacturer:'Gigabyte Technology Co., Ltd.',product:'B450M AORUS ELITE',version:'x.x'},bios:{version:'F68h',releaseDate:'2025-08-12T00:00:00.0000000Z'},os:{version:'10.0.19045',architecture:'64-bit'},programFiles:['C:\\Program Files'],drivers:[],executables:[]};}
function executable(){return {path:'C:\\Program Files\\AMD\\RyzenMaster\\bin\\AMD Ryzen Master.exe',version:'3.1.1',regular:true,reparse:false,signatureStatus:'Valid',signer:'Advanced Micro Devices Inc.',sha256:'a'.repeat(64)};}
function driverBinary(patch={}){return {path:'C:\\Program Files\\AMD\\RyzenMaster\\bin\\AMDRyzenMasterDriver.sys',version:'3.2.0.0',regular:true,reparse:false,signatureStatus:'Valid',signer:'Advanced Micro Devices',sha256:'b'.repeat(64),...patch};}
function fixture(options={}){let state=baseline(),open=[],reads=0,game=false;const amd=createAmdTuning({platform:'win32',arch:'x64',now:()=>time,runInventory:async()=>{reads++;return copy(state);},runEvents:async()=>({systemRecordId:100,events:[]}),openPath:async target=>{open.push(target);return '';},isGameRunning:async()=>game,...options});return {amd,open,get state(){return state;},get reads(){return reads;},set game(value){game=value;},set state(value){state=copy(value);}};}
function snapshot({at=time,recordId=100,events=[],since=time-86400000,truncated=false}={}){return {available:true,capturedAt:new Date(at).toISOString(),since:new Date(since).toISOString(),until:new Date(at).toISOString(),systemRecordId:recordId,events,truncated};}
function event({id=101,at=time+1000,level=2,eventId=18}={}){return {recordId:id,eventId,level,time:new Date(at).toISOString()};}

test('detecta Ryzen 5600/Zen3 e B450 sem inventar leitura ou escrita de firmware',async()=>{
  const f=fixture(),result=await f.amd.inspect();assert.equal(result.available,true);assert.equal(result.cpu.name,'AMD Ryzen 5 5600 6-Core Processor');assert.deepEqual([result.cpu.family,result.cpu.model,result.cpu.stepping],[25,33,2]);assert.equal(result.cpu.generation,'Zen 3 (Vermeer)');assert.equal(result.hardware.desktopCandidate,true);assert.equal(result.hardware.pboCandidate,true);assert.equal(result.hardware.curveOptimizerCandidate,true);assert.equal(result.hardware.chipsetCandidate,'B450');assert.equal(result.hardware.firmwareVerified,false);assert.equal(result.supported,false);assert.equal(result.canApply,false);assert.equal(result.currentPbo,null);assert.equal(result.currentCurveOptimizer,null);assert.equal(result.ryzenMaster.canLaunch,false);assert.equal(f.open.length,0);
});
test('CPU Intel e Ryzen mobile não são apresentados como desktop CO compatível',async()=>{
  const f=fixture();f.state={...baseline(),cpu:{...baseline().cpu,name:'Intel(R) Core(TM) i7-12700',manufacturer:'GenuineIntel'}};assert.equal((await f.amd.inspect()).hardware.amdRyzen,false);f.state={...baseline(),cpu:{...baseline().cpu,name:'AMD Ryzen 7 5800H with Radeon Graphics'}};const info=await f.amd.inspect();assert.equal(info.hardware.amdRyzen,true);assert.equal(info.hardware.desktopCandidate,false);assert.equal(info.hardware.curveOptimizerCandidate,false);
});
test('Ryzen 3000 não recebe indicação CO e chipset desconhecido permanece desconhecido',async()=>{
  const f=fixture();f.state={...baseline(),cpu:{...baseline().cpu,name:'AMD Ryzen 5 3600 6-Core Processor',processorId:'178BFBFF00870F10'},board:{...baseline().board,product:'OEM unknown'}};const result=await f.amd.inspect();assert.equal(result.hardware.pboCandidate,true);assert.equal(result.hardware.curveOptimizerCandidate,false);assert.equal(result.cpu.generation,null);assert.equal(result.hardware.chipsetCandidate,null);
});
test('Ryzen 3200G não é confundido com desktop Zen2 que oferece PBO',async()=>{
  const f=fixture();f.state={...baseline(),cpu:{...baseline().cpu,name:'AMD Ryzen 3 3200G with Radeon Vega Graphics',processorId:'178BFBFF00810F81'}};const result=await f.amd.inspect();assert.equal(result.hardware.desktopCandidate,true);assert.equal(result.hardware.pboCandidate,false);assert.equal(result.hardware.curveOptimizerCandidate,false);
});
test('inventário parcial/inesperado retorna indisponibilidade, nunca suporte AMD por engano',async()=>{
  const f=fixture();f.state={...baseline(),cpu:{...baseline().cpu,logicalCores:0}};assert.equal((await f.amd.inspect()).available,false);f.state={...baseline(),drivers:[{name:'malicious.exe',state:'Running',startMode:'Auto'}]};assert.equal((await f.amd.inspect()).available,false);const amd=createAmdTuning({platform:'linux',arch:'x64'});assert.match((await amd.inspect()).reason,/Windows/);
});
test('RyzenMaster instalado não muda suporte de controle direto nem executa durante inspeção',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()],drivers:[{name:'AMDRyzenMasterDriverV26',state:'Running',startMode:'Manual'}]};const result=await f.amd.inspect();assert.equal(result.ryzenMaster.installed,true);assert.equal(result.ryzenMaster.canLaunch,true);assert.equal(result.ryzenMaster.version,'3.1.1');assert.equal(result.supported,false);assert.equal(result.canApply,false);assert.equal(result.drivers.length,1);assert.equal(f.open.length,0);assert.deepEqual(result.links,AMD_LINKS);
});
test('driver AMD V32 em execução e arquivo assinado são distintos de backend SMU validado',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()],drivers:[{name:'AMDRyzenMasterDriverV32',state:'Running',startMode:'Auto',binary:driverBinary()}]};const result=await f.amd.inspect();assert.equal(result.ryzenMaster.driver.running,true);assert.equal(result.ryzenMaster.driver.onDiskVerified,true);assert.equal(result.ryzenMaster.driver.version,'3.2.0.0');assert.equal(result.ryzenMaster.driver.loadedImageVerified,false);assert.equal(result.directControl.available,false);assert.equal(result.directControl.readBackAvailable,false);assert.equal(result.directControl.rollbackAvailable,false);assert.equal(result.directControl.officialToolAvailable,true);assert.equal(result.directControl.publicSdkAccess,'read-only');assert.deepEqual(result.directControl.blockers.map(item=>item.code),['backend-missing','readback-unverified','rollback-unverified','pawnio-unavailable']);assert.equal(f.open.length,0);
});
test('serviço AMD com arquivo não assinado ou nome de driver diferente não recebe verificação',async()=>{
  for(const binary of [driverBinary({signatureStatus:'NotSigned'}),driverBinary({signer:'Unknown Publisher'}),driverBinary({path:'C:\\Program Files\\AMD\\RyzenMaster\\bin\\AnotherDriver.sys'}),null]){
    const f=fixture();f.state={...baseline(),drivers:[{name:'AMDRyzenMasterDriverV32',state:'Running',startMode:'Auto',binary}]};const result=await f.amd.inspect();assert.equal(result.available,true);assert.equal(result.ryzenMaster.driver.present,true);assert.equal(result.ryzenMaster.driver.onDiskVerified,false);assert.equal(result.directControl.available,false);
  }
});
test('informa driver parado sem impedir abertura validada da ferramenta que gerencia o driver',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()],drivers:[{name:'AMDRyzenMasterDriverV32',state:'Stopped',startMode:'Manual',binary:driverBinary()}]};const result=await f.amd.inspect();assert.equal(result.ryzenMaster.driver.running,false);assert.equal(result.ryzenMaster.driver.onDiskVerified,true);assert.match(result.ryzenMaster.driver.reason,/não o informa como em execução/);await f.amd.launchRyzenMaster();assert.equal(f.open.length,1);
});
test('distingue PawnIO observado do driver AMD e não declara readback ou rollback',async()=>{
  const f=fixture();f.state={...baseline(),drivers:[{name:'PawnIO',state:'Running',startMode:'Auto',binary:null}]};const result=await f.amd.inspect();assert.equal(result.ryzenMaster.driver.present,false);assert.equal(result.directControl.pawnIoDetected,true);assert.equal(result.directControl.pawnIoRunning,true);assert.equal(result.directControl.available,false);assert.equal(result.directControl.blockers.some(item=>item.code==='pawnio-unavailable'),false);assert.equal(result.directControl.blockers.some(item=>item.code==='readback-unverified'),true);
});
test('múltiplos serviços AMD priorizam versão assinada e estado em execução',async()=>{
  const f=fixture();f.state={...baseline(),drivers:[{name:'AMDRyzenMasterDriverV99',state:'Running',startMode:'Auto',binary:driverBinary({signer:'Unknown'})},{name:'AMDRyzenMasterDriverV26',state:'Stopped',startMode:'Manual',binary:driverBinary({version:'2.6.0.0'})},{name:'AMDRyzenMasterDriverV32',state:'Running',startMode:'Auto',binary:driverBinary()}]};const result=await f.amd.inspect();assert.equal(result.ryzenMaster.driver.name,'AMDRyzenMasterDriverV32');assert.equal(result.ryzenMaster.driver.onDiskVerified,true);
});
test('metadados de driver adulterados tornam a consulta indisponível',async()=>{
  const f=fixture();f.state={...baseline(),drivers:[{name:'AMDRyzenMasterDriverV32',state:'Running',startMode:'Auto',binary:driverBinary({path:'C:\\Windows\\..\\driver.sys'})}]};assert.equal((await f.amd.inspect()).available,false);
});
test('abrir RyzenMaster usa alvo recém validado sob Program Files com assinatura AMD',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()]};await f.amd.inspect();await f.amd.launchRyzenMaster();assert.equal(f.reads,2);assert.deepEqual(f.open,[executable().path]);
});
test('recusa links, reparse points, nomes arbitrários, assinaturas falsas e caminhos fora de AMD',async()=>{
  for(const patch of [{reparse:true},{regular:false},{signatureStatus:'NotSigned'},{signer:'Advanced Micro Devices Inc. Malicious'},{signer:'Unknown Publisher'},{path:'C:\\Users\\ExampleUser\\AMD Ryzen Master.exe'},{path:'C:\\Program Files\\AMDFake\\AMD Ryzen Master.exe'},{path:'C:\\Program Files\\AMD\\evil.exe'},{path:'C:\\Program Files\\AMD\\..\\evil\\AMD Ryzen Master.exe'},{path:'\\\\server\\share\\AMD Ryzen Master.exe'},{sha256:'invalid'}]){
    const f=fixture();f.state={...baseline(),executables:[{...executable(),...patch}]};assert.equal((await f.amd.inspect()).ryzenMaster.canLaunch,false);await assert.rejects(f.amd.launchRyzenMaster(),/validação/);assert.equal(f.open.length,0);
  }
});
test('troca de executável entre inspeção e clique é detectada pela nova inspeção',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()]};assert.equal((await f.amd.inspect()).ryzenMaster.canLaunch,true);f.state={...baseline(),executables:[{...executable(),signer:'Unknown'}]};await assert.rejects(f.amd.launchRyzenMaster(),/validação/);assert.equal(f.open.length,0);
});
test('CS2 aberto bloqueia ferramenta externa antes e depois de validar o alvo',async()=>{
  const f=fixture();f.state={...baseline(),executables:[executable()]};f.game=true;await assert.rejects(f.amd.launchRyzenMaster(),/Feche o CS2/);assert.equal(f.reads,0);let checks=0;const g=fixture({isGameRunning:async()=>++checks>1});g.state={...baseline(),executables:[executable()]};await assert.rejects(g.amd.launchRyzenMaster(),/Feche o CS2/);assert.equal(g.open.length,0);
});
test('falha do abridor oficial não é registrada como abertura bem sucedida',async()=>{
  const f=fixture({openPath:async()=> 'Falha do Windows'});f.state={...baseline(),executables:[executable()]};await assert.rejects(f.amd.launchRyzenMaster(),/Falha do Windows/);
});
test('consulta WHEA envia somente intervalo validado, nenhum evento não significa estabilidade',async()=>{
  const requests=[],f=fixture({runEvents:async request=>{requests.push(request);return {systemRecordId:100,events:[]};}});const result=await f.amd.readStability();assert.equal(result.available,true);assert.equal(result.events.length,0);assert.deepEqual(requests,[{since:'2026-10-13T15:00:00.000Z',until:'2026-10-14T15:00:00.000Z'}]);assert.match(result.message,/não certifica estabilidade/);assert.equal(f.reads,0);
});
test('WHEA acesso negado é indisponível, nunca zero erros como sucesso',async()=>{
  const f=fixture({runEvents:async()=>{throw new Error('Acesso negado.');}});const result=await f.amd.readStability();assert.equal(result.available,false);assert.equal(result.systemRecordId,null);assert.match(result.reason,/Acesso negado/);const comparison=compareAmdStability(result,snapshot());assert.equal(comparison.available,false);assert.equal(comparison.count,null);
});
test('recusa consultas não limitadas, datas inválidas, opções arbitrárias e injeção',async()=>{
  const f=fixture();for(const options of [{since:'2026-01-01T00:00:00.000Z'},{since:'2026-10-15T00:00:00.000Z'},{since:'2026-10-14; Start-Process evil'}, {since:'2026-02-31T00:00:00.000Z'}, {command:'x'},[]])await assert.rejects(f.amd.readStability(options));
});
test('recusa eventos duplicados ou fora do intervalo e mantém resultado indisponível',async()=>{
  for(const records of [[event({id:50,at:time+1000})],[event({id:50,at:time-1000}),event({id:50,at:time-1000})],[event({id:101,at:time-1000})],[event({id:50,at:time-1000,level:6})]]){
    const f=fixture({runEvents:async()=>({systemRecordId:100,events:records})});assert.equal((await f.amd.readStability()).available,false);
  }
});
test('201 eventos produzem contagem mínima explícita sem resposta sem limite',async()=>{
  const records=Array.from({length:201},(_,index)=>event({id:index+1,at:time-1000-index,level:3}));const f=fixture({runEvents:async()=>({systemRecordId:201,events:records})});const result=await f.amd.readStability();assert.equal(result.available,true);assert.equal(result.events.length,200);assert.equal(result.truncated,true);assert.equal(result.events[0].recordId,201);
});
test('comparação separa novos WHEA de eventos anteriores e informa severidade',()=>{
  const before=snapshot({events:[event({id:90,at:time-1000})]}),after=snapshot({at:time+60000,recordId:104,events:[event({id:90,at:time-1000}),event(),event({id:102,level:3}),event({id:103,level:4}),event({id:104,level:1})]});const result=compareAmdStability(before,after);assert.equal(result.count,4);assert.equal(result.errorCount,2);assert.equal(result.warningCount,1);assert.equal(result.truncated,false);assert.equal(result.warnings.length,0);assert.match(result.message,/nem identifica a causa/);
});
test('reset do registro, intervalo incompleto e truncamento aparecem como limitações',()=>{
  const before=snapshot(),reset=compareAmdStability(before,snapshot({at:time+60000,recordId:2,events:[event({id:1})]}));assert.equal(reset.count,1);assert.equal(reset.truncated,true);assert.match(reset.warnings[0],/reiniciado ou limpo/);const gap=compareAmdStability(before,snapshot({at:time+60000,since:time+1000,recordId:102,events:[event({id:101,at:time+2000})],truncated:true}));assert.equal(gap.truncated,true);assert.equal(gap.warnings.length,2);
});
test('comparação rejeita ordem temporal invertida e snapshots adulterados',()=>{
  assert.throws(()=>compareAmdStability(snapshot(),snapshot({at:time-1000})),/antecede/);assert.throws(()=>compareAmdStability(snapshot(),{...snapshot(),events:[event({id:101})]}),/inválido/);assert.throws(()=>compareAmdStability({...snapshot(),since:'invalid'},snapshot()),/inválido/);
});
