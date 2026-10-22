import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const CONTROL_PANEL_AUMID='NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel';
const regularFile=async file=>{try{const stat=await fs.lstat(file);return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}};

export function createNvidiaControlPanel({openPath,launchApp,env=process.env,platform=process.platform}={}){
  if(openPath!==undefined&&typeof openPath!=='function'||launchApp!==undefined&&typeof launchApp!=='function')throw new Error('Abridor do Painel NVIDIA inválido.');
  const open=async()=>{
    if(platform!=='win32')throw new Error('O Painel NVIDIA está disponível somente no Windows.');
    const root=env.WINDIR||env.SystemRoot||'C:\\Windows';
    const candidates=[
      path.win32.join(root,'System32','nvcplui.exe'),
      path.win32.join(env.ProgramFiles||'C:\\Program Files','NVIDIA Corporation','Control Panel Client','nvcplui.exe'),
      path.win32.join(env['ProgramFiles(x86)']||'C:\\Program Files (x86)','NVIDIA Corporation','Control Panel Client','nvcplui.exe'),
    ];
    for(const executable of candidates){
      if(!await regularFile(executable))continue;
      if(!openPath)throw new Error('O Windows não disponibilizou a abertura do Painel NVIDIA.');
      const error=await openPath(executable);if(error)throw new Error(String(error));
      return {opened:true,method:'executable'};
    }
    const explorer=path.win32.join(root,'explorer.exe');
    if(!await regularFile(explorer))throw new Error('O Painel NVIDIA não foi encontrado. Abra-o pelo menu Iniciar ou instale o componente oficial da NVIDIA.');
    const run=launchApp||((file,args)=>execute(file,args,{windowsHide:true,timeout:10000,maxBuffer:16*1024,encoding:'utf8',shell:false}));
    await run(explorer,['shell:AppsFolder\\'+CONTROL_PANEL_AUMID]);
    return {opened:true,method:'apps-folder'};
  };
  return {open};
}
