import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

export async function readLastRecovery(directory){
  try{const file=path.join(directory,'crash-recovery.json'),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('Registro de recuperação inválido.');
    const report=JSON.parse(await fs.readFile(file,'utf8'));if(report.version!==1||typeof report.ok!=='boolean'||!Number.isFinite(Date.parse(report.finishedAt))||!Array.isArray(report.errors)||report.errors.length>8)throw new Error('Registro de recuperação inválido.');
    return {ok:report.ok,finishedAt:report.finishedAt,errors:report.errors.map(error=>String(error.message||'Restauração pendente.').slice(0,500))};
  }catch(error){if(error.code==='ENOENT')return null;return {ok:false,finishedAt:null,errors:['Não foi possível ler o último registro de recuperação.']};}
}

export async function startRecoveryGuard({directory,workerPath=path.join(path.dirname(fileURLToPath(import.meta.url)),'native','csboost-recovery.exe'),spawnImpl=spawn,parentPid=process.pid,timeoutMs=125000}){
  if(!path.isAbsolute(directory)||!path.isAbsolute(workerPath)||!Number.isInteger(parentPid)||parentPid<1)throw new Error('Monitor de recuperação inválido.');
  const child=spawnImpl(workerPath,[String(parentPid),Buffer.from(directory).toString('base64')],{windowsHide:true,detached:true,stdio:['pipe','pipe','ignore'],shell:false});
  let available=false,disarmed=false;
  child.on('exit',()=>{available=false;});
  child.on('error',()=>{available=false;});
  child.stdin.on('error',()=>{available=false;});
  await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>finish(new Error('A recuperação anterior ainda está em andamento. Tente abrir o CSBOOST novamente.')),timeoutMs);
    const fail=()=>finish(new Error('Não foi possível iniciar o monitor de recuperação.'));
    function finish(error){clearTimeout(timer);child.stdout.removeListener('data',onData);child.removeListener('error',fail);child.removeListener('exit',fail);if(error){child.stdin.destroy();reject(error);}else resolve();}
    function onData(chunk){output+=chunk.toString('utf8');if(output.length>4096)return fail();const end=output.indexOf('\n');if(end<0)return;try{const response=JSON.parse(output.slice(0,end));if(response.status!=='ready')return finish(new Error('Não foi possível iniciar o monitor de recuperação: '+String(response.error||'resposta inválida').slice(0,240)));available=true;finish();}catch{fail();}}
    child.stdout.on('data',onData);child.once('error',fail);child.once('exit',fail);
  });
  child.unref();child.stdin.unref?.();child.stdout.unref?.();
  function ensureAvailable(){if(!available||disarmed)throw new Error('O monitor de recuperação não está ativo. Reabra o CSBOOST antes de iniciar novos ajustes.');}
  function disarm(){ensureAvailable();disarmed=true;return new Promise((resolve,reject)=>{child.stdin.end('CLEAN\n',error=>error?reject(new Error('Não foi possível confirmar o encerramento limpo da recuperação.')):resolve());});}
  return {ensureAvailable,disarm,getState:()=>({available:available&&!disarmed}),getLastRecovery:()=>readLastRecovery(directory)};
}
