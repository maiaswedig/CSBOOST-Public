import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
export const BOOT_TIMER_FLAGS=Object.freeze(['useplatformclock','useplatformtick','disabledynamictick']);
const UNKNOWN=Object.freeze({available:false,source:'bcdedit /enum {current}',options:null,reason:'Não foi possível consultar a entrada atual de inicialização.'});

export function parseBootTimerOptions(output){
  if(typeof output!=='string'||!output.trim()||Buffer.byteLength(output,'utf8')>256*1024)return {...UNKNOWN};
  if(!/(?:identifier|identificador)\s+\{current\}/i.test(output))return {...UNKNOWN};
  const options=Object.fromEntries(BOOT_TIMER_FLAGS.map(name=>[name,null]));
  for(const name of BOOT_TIMER_FLAGS){
    const matches=[...output.matchAll(new RegExp('^\\s*'+name+'\\s+([^\\s]+)\\s*$','gim'))];
    if(matches.length>1)return {...UNKNOWN,reason:'A saída do Windows contém opções de temporizador duplicadas.'};
    if(!matches.length)continue;
    const value=matches[0][1].toLowerCase();
    if(['yes','sim','true','1'].includes(value))options[name]=true;
    else if(['no','não','nao','false','0'].includes(value))options[name]=false;
    else return {...UNKNOWN,reason:'Uma opção de temporizador retornou um valor não reconhecido.'};
  }
  return {available:true,source:'bcdedit /enum {current}',options,forced:BOOT_TIMER_FLAGS.filter(name=>options[name]===true)};
}

export async function readBootTimerOptions({platform=process.platform,env=process.env,run=execute}={}){
  if(platform!=='win32')return {...UNKNOWN,reason:'A leitura da entrada de inicialização está disponível somente no Windows.'};
  const root=env.SystemRoot||env.WINDIR||'C:\\Windows';
  if(typeof root!=='string'||!path.win32.isAbsolute(root)||root.split(/[\\/]/).includes('..'))return {...UNKNOWN,reason:'A pasta do Windows não pôde ser validada.'};
  const executable=path.win32.join(root,'System32','bcdedit.exe');
  try{
    const {stdout}=await run(executable,['/enum','{current}'],{windowsHide:true,shell:false,timeout:5000,maxBuffer:256*1024,encoding:'utf8'});
    return parseBootTimerOptions(stdout);
  }catch{return {...UNKNOWN};}
}
