import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readSystemInventory} from './system-worker.mjs';
const execute=promisify(execFile);
const system32=path.join(process.env.SystemRoot||'C:\\Windows','System32');
export async function readFirmwarePlatform({readInventory=readSystemInventory,platform=process.platform}={}){
  if(platform!=='win32')return {firmware:'unknown',bootId:null,onBattery:null,hasBattery:null,canRequestRestart:false,reason:'Requer Windows.'};
  try{
    const value=await readInventory({operation:'platform'});
    if(![0,1,2].includes(value.firmwareType)||![0,1,255].includes(value.acLine)||!Number.isInteger(value.batteryFlag)||value.batteryFlag<0||value.batteryFlag>255||typeof value.bootId!=='string'||value.bootId&&!Number.isFinite(Date.parse(value.bootId)))throw Error('Inventário inválido.');
    const firmware=value.firmwareType===2?'uefi':value.firmwareType===1?'legacy':'unknown',hasBattery=value.batteryFlag===255?null:(value.batteryFlag&128)===0;
    return {firmware,bootId:value.bootId?new Date(value.bootId).toISOString():null,onBattery:value.acLine===1?false:value.acLine===0&&hasBattery===true?true:null,hasBattery,canRequestRestart:firmware==='uefi',firmwareUiVerified:false,reason:firmware==='uefi'?'Windows iniciou em UEFI. A disponibilidade da interface de firmware será decidida pelo Windows/placa ao solicitar.':'Abertura direta do firmware não confirmada; consulte as opções de recuperação do Windows/manual.'};
  }catch{return {firmware:'unknown',bootId:null,onBattery:null,hasBattery:null,canRequestRestart:false,reason:'O Windows não permitiu consultar firmware/energia.'};}
}
export async function requestFirmwareRestart({run=execute}={}){try{await run(path.join(system32,'shutdown.exe'),['/r','/fw','/t','0'],{windowsHide:true,shell:false,timeout:10000,maxBuffer:65536,encoding:'utf8'});return {requested:true};}catch{throw Error('O Windows recusou o reinício na BIOS. Use Recuperação → Inicialização avançada; nenhuma ativação XMP foi presumida.');}}
