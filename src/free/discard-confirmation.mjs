import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const issued=new Map();
export function issueDiscardToken(scope,ownerToken){if(typeof scope!=='string'||!/^[a-z-]{2,32}$/.test(scope)||ownerToken!==undefined&&(typeof ownerToken!=='string'||!/^boost:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(ownerToken)))throw Error('Escopo ou propriedade do descarte inválidos.');const token=crypto.randomBytes(32).toString('hex');issued.set(token,{scope,ownerToken,expires:Date.now()+60_000});return token;}
export function consumeDiscardToken(scope,token,ownerToken){const item=issued.get(token);if(!item||item.scope!==scope||item.expires<Date.now()||item.ownerToken!==undefined&&item.ownerToken!==ownerToken){if(typeof token==='string')issued.delete(token);throw Error('Confirmação expirada ou inválida. Confirme novamente na janela do CSBOOST.');}issued.delete(token);return true;}
export async function appendDiscardAudit(directory,event){
  await fs.mkdir(directory,{recursive:true});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||(await fs.realpath(directory)).toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('Pasta de auditoria inválida.');
  const file=path.join(directory,'discard-audit.json');let rows=[];
  try{const item=await fs.lstat(file);if(!item.isFile()||item.isSymbolicLink()||item.size>256*1024)throw Error('Auditoria local inválida.');const parsed=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(parsed)||parsed.length>200)throw Error('Auditoria local inválida.');rows=parsed;}catch(error){if(error.code!=='ENOENT')throw error;}
  rows.push({...event,at:new Date().toISOString()});const temporary=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(rows.slice(-100),null,2),{flag:'wx',mode:0o600});await fs.rename(temporary,file);
}
