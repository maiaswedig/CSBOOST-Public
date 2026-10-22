import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {parsePresentMonCsv,summarizeFrameSeries} from './frame-series.mjs';
import {classifyBottleneck} from './bottleneck-classifier.mjs';

export const PRESENTMON=Object.freeze({version:'2.3.1',file:'PresentMon-2.3.1-x64.exe',sha256:'364e5d98d4d134bd54dd25c22ed2ca2f4883f8bc3ed6502bee0c151e3436d30c',source:'https://github.com/GameTechDev/PresentMon/releases/download/v2.3.1/PresentMon-2.3.1-x64.exe'});
const execute=promisify(execFile),ID=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i,MAX_BYTES=64*1024*1024;
const unknown=reason=>({status:'unavailable',reason,version:PRESENTMON.version,readOnly:true});
const clone=v=>JSON.parse(JSON.stringify(v));
const root=path.dirname(fileURLToPath(import.meta.url));
async function regular(file,max=MAX_BYTES){const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('Arquivo de captura inválido.');return st;}

// Only app-owned files and the pinned console are written/launched. No settings change.
export function createFrameCapture({directory,executable=path.join(root,'native',PRESENTMON.file),workerPath=path.join(root,'native','csboost-frame.exe'),run=execute,spawnImpl=spawn,platform=process.platform,now=()=>Date.now(),verifyBinaryImpl=null}={}){
  if(!path.isAbsolute(directory)||!path.isAbsolute(executable)||!path.isAbsolute(workerPath))throw Error('Caminho de captura inválido.');
  const journal=path.join(directory,'active-frame-capture.json'),settings=path.join(directory,'frame-capture-settings.json'),captures=path.join(directory,'captures');
  let active=null,child=null,finished=null,finishResolve=null,permission=null,pendingStop=null,queue=Promise.resolve();
  const exclusive=fn=>(...args)=>{const work=queue.then(()=>fn(...args));queue=work.catch(()=>{});return work;};
  async function validDirectory(folder){try{const st=await fs.lstat(folder);if(!st.isDirectory()||st.isSymbolicLink()||path.normalize(await fs.realpath(folder)).toLowerCase()!==path.normalize(folder).toLowerCase())throw Error('Pasta de captura inválida.');return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
  async function ensure(){for(const folder of [directory,captures]){await fs.mkdir(folder,{recursive:true});if(!await validDirectory(folder))throw Error('Pasta de captura inválida.');}}
  async function write(file,value){await ensure();try{await regular(file,65536);}catch(e){if(e.code!=='ENOENT')throw e;}const temp=file+'.tmp';try{await regular(temp,65536);await fs.unlink(temp);}catch(e){if(e.code!=='ENOENT')throw e;}const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}
  async function read(file){if(!await validDirectory(directory))return null;try{await regular(file,65536);return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function verifyBinary(){
    // Test fixtures may inject a verifier; production call sites must use the pinned SHA-256 check below.
    if(verifyBinaryImpl){await verifyBinaryImpl({executable,workerPath,version:PRESENTMON.version,sha256:PRESENTMON.sha256});return;}
    await regular(executable,1024*1024);await regular(workerPath,1024*1024);if(path.basename(executable)!==PRESENTMON.file||path.basename(workerPath)!=='csboost-frame.exe'||crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex')!==PRESENTMON.sha256)throw Error('O coletor não corresponde à versão oficial fixada.');
  }
  async function status(){
    const configured=await read(settings),enabled=configured?.version===1&&configured.enabled===true;
    if(platform!=='win32')return {...unknown('Disponível somente no Windows x64.'),enabled,canCapture:false};
    try{await verifyBinary();const result=await run(workerPath,['--status',String(process.pid)],{windowsHide:true,timeout:5000,maxBuffer:16384});const parsed=JSON.parse(result.stdout);if(parsed.ok!==true||typeof parsed.value?.allowed!=='boolean'||!/^\d{10,20}$/.test(parsed.value.parentStartTicks))throw Error('Leitura de permissão inválida.');permission=parsed.value;return {status:'available',enabled,experimental:true,version:PRESENTMON.version,readOnly:true,canCapture:enabled&&permission.allowed,permission:permission.allowed?'allowed':'denied',reason:permission.allowed?(enabled?'Coleta detalhada ativada para benchmarks e sessões de CS2.':'Coleta detalhada experimental desativada.'): 'A coleta detalhada exige Executar como administrador ou participação ativa em Usuários de Log de Desempenho. O VProf continua disponível.',antiCheatValidation:'unknown'};}
    catch(error){permission=null;return {...unknown(error.message),enabled,canCapture:false};}
  }
  async function configure(request){if(!request||Object.keys(request).length!==1||typeof request.enabled!=='boolean')throw Error('Opção de captura inválida.');if(active||await read(journal))throw Error('Conclua a captura anterior antes de alterar esta opção.');await write(settings,{version:1,enabled:request.enabled});return status();}
  async function prepare({id}){
    if(!ID.test(id))throw Error('Identificação de captura inválida.');if(active||await read(journal))throw Error('Há coleta de quadros pendente de recuperação.');
    const info=await status();if(!info.canCapture)return {...unknown(info.reason),enabled:info.enabled,permission:info.permission??'unknown'};
    active={version:1,id,session:'csboost-'+id,output:path.join(captures,id+'.csv'),parentPid:process.pid,parentStartTicks:permission.parentStartTicks,preparedAt:now(),status:'prepared'};
    await write(journal,active);return {status:'prepared',version:PRESENTMON.version,enabled:true};
  }
  async function start({id}){
    if(!active||active.id!==id)return unknown('Coleta não preparada.');if(child)return {status:'capturing',version:PRESENTMON.version};
    await verifyBinary();await fs.writeFile(active.output,'',{flag:'wx',mode:0o600});active.status='starting';active.startedAt=now();await write(journal,active);
    const request={id,exe:executable,output:active.output,parentPid:process.pid,parentStartTicks:active.parentStartTicks,seconds:360};
    let buffer='',last=null,readyResolve,readyReject,readyDone=false;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
    finished=new Promise(resolve=>{finishResolve=resolve;});
    child=spawnImpl(workerPath,['--capture',Buffer.from(JSON.stringify(request)).toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    active.supervisorPid=child.pid??null;
    const fail=error=>{last={event:'error',error:error.message};if(!readyDone){readyDone=true;readyReject(error);}};
    child.stdout?.on('data',bytes=>{buffer+=bytes.toString('utf8');if(buffer.length>32768){fail(Error('Resposta do coletor excedeu o limite.'));return;}let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos).trim();buffer=buffer.slice(pos+1);if(!line)continue;try{const item=JSON.parse(line);if(item.event==='ready'){if(!readyDone){readyDone=true;readyResolve(item);}}else if(item.event==='finished'||item.event==='error'){last=item;if(item.event==='error')fail(Error(item.error));}}catch{fail(Error('Resposta inválida do coletor.'));}}});
    child.stderr?.on('data',()=>{});child.stdout?.on('error',fail);child.stderr?.on('error',fail);child.stdin?.on('error',()=>{});child.on('error',fail);child.on('close',code=>{if(!readyDone)fail(Error('O coletor terminou antes de iniciar.'));finishResolve(last??{event:'error',error:'Coletor encerrado sem relatório.',exitCode:code});});
    let timer;try{await write(journal,active);await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Tempo limite ao preparar ETW.')),5000);})]);active.status='capturing';await write(journal,active);return {status:'capturing',version:PRESENTMON.version,startedAt:active.startedAt};}finally{clearTimeout(timer);}
  }
  async function terminateTrace(id){await verifyBinary();try{await run(executable,['--session_name','csboost-'+id,'--terminate_existing_session'],{windowsHide:true,timeout:7000,maxBuffer:16384});}catch(error){const text=String(error.stdout||'')+String(error.stderr||'');if(!(error.code===7&&text.includes('no existing sessions found: csboost-'+id)))throw error;}}
  async function stop({id,reason='completed',context={},includeTimeline=false}={}){
    if(pendingStop)return pendingStop;
    pendingStop=(async()=>{
      if(!active)return unknown('Coleta não realizada nesta execução.');if(id&&id!==active.id)throw Error('A captura ativa mudou.');
      const record=active;let report=null;
      if(child){try{child.stdin?.end('stop\n');}catch{}let timer;try{report=await Promise.race([finished,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),10000);})]);}finally{clearTimeout(timer);}if(report===null){child.kill();let timer;try{await Promise.race([finished,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Coletor ainda em execução; recuperação pendente.')),3000);})]);}finally{clearTimeout(timer);}}}
      // The own supervisor stops its ETW session before exit. This also handles a supervisor crash.
      if(child&&report?.event!=='finished')await terminateTrace(record.id);
      const base={version:PRESENTMON.version,readOnly:true,captureId:record.id,captureStartedAt:record.startedAt??'unknown',captureEndedAt:now(),overhead:report?.overhead??'unknown'};
      let result={...unknown(reason==='completed'?'O coletor não forneceu quadros válidos.':'Captura interrompida: '+reason),...base};
      if(reason==='completed'&&report?.event==='finished'&&report.exitCode===0&&(record.status==='capturing'||record.status==='starting'))try{
        await regular(record.output);const series=parsePresentMonCsv(await fs.readFile(record.output,'utf8'),{version:PRESENTMON.version,hagsEnabled:'unknown',vulkan:'unknown',maxBytes:MAX_BYTES});
        result={...summarizeFrameSeries(series,{includeTimeline:includeTimeline===true}),...base};result.bottleneck=classifyBottleneck(series,context);result.quality??={notes:[]};result.quality.notes??=[];result.quality.notes.push(includeTimeline===true?'Janela ETW começa após detectar o jogo; pode excluir os primeiros quadros. HAGS efetivo e API gráfica não confirmados.':'Janela ETW começa após observar o início VProf; pode excluir os primeiros quadros. HAGS efetivo e API gráfica não confirmados. Fontes têm definições diferentes.');
        if(result.status!=='available')result.reason=report?.error||'Nenhum intervalo de quadro válido foi coletado.';
      }catch(error){result={...unknown(error.message),...base};}
      await write(path.join(captures,record.id+'.summary.json'),result);await fs.unlink(journal);active=null;child=null;finished=null;return result;
    })().finally(()=>{pendingStop=null;});return pendingStop;
  }
  async function recover(){
    const record=await read(journal);if(!record)return {recovered:false};
    if(record.version!==1||!ID.test(record.id)||record.session!=='csboost-'+record.id||record.output!==path.join(captures,record.id+'.csv')||!['prepared','starting','capturing'].includes(record.status)||!Number.isFinite(record.preparedAt)||!Number.isInteger(record.parentPid)||record.parentPid<=0||!/^\d{10,20}$/.test(record.parentStartTicks)||record.status!=='prepared'&&!Number.isFinite(record.startedAt)||record.supervisorPid!=null&&(!Number.isInteger(record.supervisorPid)||record.supervisorPid<=0))throw Error('Registro de captura inválido.');
    if(child)return stop({id:record.id,reason:'recovery'});
    // Unique trace name comes only from the validated own journal; other tools are untouched.
    if(record.status!=='prepared')await terminateTrace(record.id);
    await fs.unlink(journal);active=null;return {recovered:true,status:'unavailable',reason:'Captura interrompida; nenhum resumo foi reconstruído como medição completa.'};
  }
  const serializedStop=exclusive(stop);
  return {status,configure:exclusive(configure),prepare:exclusive(prepare),start:exclusive(start),stop:request=>request?.id&&active&&request.id!==active.id?Promise.reject(Error('A captura ativa mudou.')):serializedStop(request),recover:exclusive(recover),isActive:()=>active!==null};
}
