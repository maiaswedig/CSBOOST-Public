import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export const stateHash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateOwnerToken(value){if(value===undefined)return undefined;if(typeof value!=='string'||!/^boost:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value))throw Error('Identificação do ajuste inválida.');return value;}
export function createOwnedState(directory,{rename=fs.rename,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  async function folder(create=false){if(create)await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(await fs.realpath(directory)).toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('Pasta de estado redirecionada ou inválida.');}
  const target=name=>{if(!/^[a-z0-9-]+\.json$/.test(name))throw Error('Arquivo de estado inválido.');return path.join(directory,name);};
  async function read(name){try{await folder();const file=target(name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('Estado local inválido.');const envelope=JSON.parse(await fs.readFile(file,'utf8'));if(envelope.version!==1||envelope.sha256!==stateHash(envelope.data))throw Error('Estado local alterado ou incompleto.');return envelope.data;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async function write(name,data){
    await folder(true);const file=target(name);
    const identity=async()=>{const stat=await fs.lstat(file).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('Destino de estado inválido.');return stat?[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':'):null;};
    const before=await identity(),temporary=file+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(JSON.stringify({version:1,data,sha256:stateHash(data)},null,2));await handle.sync();}finally{await handle.close();}
    try{for(let attempt=0;;attempt++){
      await folder();if(await identity()!==before)throw Error('O estado local mudou durante a gravação; arquivo atual preservado.');
      try{await rename(temporary,file);break;}
      catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=5)throw error;await wait(20*2**attempt);}
    }}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
  }
  return {read,write};
}
