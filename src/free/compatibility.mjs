import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const PLATFORM_REQUIREMENTS=Object.freeze({platform:'win32',arch:'x64',minimumWindowsMajor:10});
export function supportedPlatform({platform=process.platform,arch=process.arch,release=os.release()}={}){
  return platform==='win32'&&arch==='x64'&&Number(String(release).split('.')[0])>=10;
}
const vendor=cpu=>/AMD|Ryzen|Threadripper/i.test(cpu)?'AMD':/Intel/i.test(cpu)?'Intel':'Não identificado';
const safeText=(value,fallback)=>typeof value==='string'?value.replace(/[\x00-\x1f]/g,' ').slice(0,180):fallback;
async function probeData(directory){
  const target=path.join(directory,'.write-check-'+crypto.randomUUID());let created=false;
  try{const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())return false;const file=await fs.open(target,'wx',0o600);created=true;await file.close();return true;}catch{return false;}finally{if(created)await fs.unlink(target).catch(()=>{});}
}
export function createCompatibility({system,engine,watcher,recoveryGuard,directory,version,integrity,environment={platform:process.platform,arch:process.arch,release:os.release()},checkData=()=>probeData(directory)}){
  async function inspect(steamId){
    const results=await Promise.allSettled([system.getSystemInfo(),system.refreshSteam(),engine?.inspect(steamId),checkData()]);
    const value=index=>results[index].status==='fulfilled'?results[index].value:null;
    const hardware=value(0),game=value(1),assessment=value(2),dataWritable=value(3)===true,platformSupported=supportedPlatform(environment),cpuVendor=vendor(hardware?.cpu??'');
    const monitor=watcher?.status?.(),guard=recoveryGuard?.getState?.();
    const checks=[
      {id:'platform',title:'Windows x64',ok:platformSupported,detail:platformSupported?'Windows 10/11 x64; CPU AMD ou Intel.':'Esta distribuição requer Windows 10 ou 11 de 64 bits x64.'},
      {id:'data',title:'Perfis e backups',ok:dataWritable,detail:dataWritable?'Pasta de dados gravável neste usuário do Windows.':'A pasta de dados não está gravável. Confira as permissões antes de aplicar ajustes.'},
      {id:'steam',title:'Steam',ok:game?!!game.installed:null,detail:game?.installed?'Instalação detectada neste computador.':'Instale a Steam, entre na sua conta e reabra o CSBOOST.'},
      {id:'cs2',title:'Counter-Strike 2',ok:game?!!game.cs2Installed:null,detail:game?.cs2Installed?'Instalação do CS2 detectada.':'Instale o CS2 pela Steam e abra o jogo uma vez para criar os arquivos de configuração.'},
      {id:'watcher',title:'Monitor de sessão',ok:monitor?monitor.running===true:null,detail:monitor?.running?'Monitor nativo ativo.':'Monitor indisponível; reabra o aplicativo antes de iniciar uma sessão ou medição.'},
      {id:'recovery',title:'Recuperação de sessão',ok:guard?guard.available===true:null,detail:guard?.available?'Proteção de recuperação ativa.':'Proteção de recuperação indisponível; novas sessões temporárias ficam bloqueadas.'}
    ];
    const capabilities=(assessment?.hardware?.capabilities??[]).map(item=>({name:safeText(item.name,'Recurso'),mode:item.available?'available':'unavailable'}));
    const amd=assessment?.amdStatus,memory=assessment?.memoryStatus;
    const features=[
      ...capabilities,
      {name:cpuVendor==='Intel'?'Ajustes de CPU Intel':'Ajustes de CPU',mode:cpuVendor==='Intel'||cpuVendor==='AMD'&&amd?.hardware?.pboCandidate?'assisted':'unavailable',detail:cpuVendor==='Intel'?'PBO/Curve Optimizer não se aplicam à Intel. Consulte o suporte da ferramenta oficial para sua CPU e placa.':cpuVendor==='AMD'?'PBO/CO dependem da CPU, placa, BIOS e ferramenta oficial.':'Fabricante da CPU não identificado; não há controle automático de firmware.'},
      {name:'Memória XMP/EXPO',mode:memory?.available?'assisted':'unavailable',detail:'Seleção na BIOS e conferência antes/depois; ativação direta não disponível.'}
    ];
    return {format:'csboost-compatibility',version:1,appVersion:version,capturedAt:new Date().toISOString(),platform:{platform:environment.platform,arch:environment.arch,release:environment.release,supported:platformSupported},hardware:{cpu:safeText(hardware?.cpu,'Não identificado'),cpuVendor,gpu:safeText(hardware?.gpu,'Não identificado'),logicalCores:Number(hardware?.logicalCores)||null,ramGB:Number(hardware?.ramGB)||null},checks,features,integrity:integrity??{verified:false,authenticityVerified:false},ready:checks.every(check=>check.ok===true),readOnly:true,temporaryWriteProbe:true,personalDataIncluded:false,physicalCrossVendorValidation:false,warnings:[...(!assessment?['A avaliação detalhada não respondeu. Atualize após conferir Steam e permissões.']:[]),...(cpuVendor==='AMD'&&amd?.hardware?.pboCandidate===false?['Esta CPU não foi identificada como candidata a PBO.']:[])],limits:['Os ajustes do Windows/CS2 são próprios; não há garantia de ganho de FPS.','Disponível indica diagnóstico de compatibilidade, não teste físico nesta combinação de hardware.']};
  }
  return {inspect};
}
