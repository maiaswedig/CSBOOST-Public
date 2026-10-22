import path from 'node:path';
import crypto from 'node:crypto';
const FLAG='--resume-fps-flow';
export function createFpsResume({app,executablePath=process.execPath,platform=process.platform}){
  if(!path.isAbsolute(executablePath))throw Error('Caminho do CSBOOST inválido.');
  const name='CSBOOST-FPS-Resume-'+crypto.createHash('sha256').update(path.resolve(executablePath).toLowerCase()).digest('hex').slice(0,16),args=[FLAG];
  const samePath=value=>typeof value==='string'&&path.resolve(value.replace(/^"|"$/g,'')).toLowerCase()===path.resolve(executablePath).toLowerCase();
  const sameArgs=value=>Array.isArray(value)&&value.length===1&&value[0]===FLAG;
  function entry(){const settings=app.getLoginItemSettings({path:executablePath,args});if(!Array.isArray(settings.launchItems))throw Error('O Windows não forneceu a conferência da abertura automática.');const item=settings.launchItems.find(item=>item.name?.toLowerCase()===name.toLowerCase());if(item&&(!samePath(item.path)||!sameArgs(item.args)||item.scope!=='user'))throw Error('A entrada de abertura automática mudou; sua configuração foi preservada.');return item;}
  function status(){if(platform!=='win32')return {available:false,armed:false};try{return {available:true,armed:entry()?.enabled===true};}catch(error){return {available:false,armed:false,error:error.message};}}
  function arm(){if(platform!=='win32')throw Error('Retomada automática disponível somente no Windows.');entry();app.setLoginItemSettings({name,path:executablePath,args,openAtLogin:true,enabled:true});if(!status().armed)throw Error('O Windows não confirmou a abertura automática. Abra pelo atalho após reiniciar.');return status();}
  function cancel(){if(platform!=='win32')return status();const current=entry();if(current){app.setLoginItemSettings({name,path:executablePath,args,openAtLogin:false});if(entry())throw Error('A abertura automática ainda está registrada.');}return status();}
  function consume(argv){if(!argv.includes(FLAG))return {consumed:false};const current=entry();if(current)cancel();return {consumed:!!current};}
  return {status,arm,cancel,consume};
}
