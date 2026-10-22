import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createShaderCache} from '../src/free/shader-cache.mjs';
import {issueDiscardToken,consumeDiscardToken} from '../src/free/discard-confirmation.mjs';

async function fixture(t,{twoLibraries=false,renameDirectory}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-shader-test-'));
  t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^csboost-shader-test-/);await fs.rm(root,{recursive:true,force:true});});
  const steam=path.join(root,'Steam'),library=twoLibraries?path.join(root,'Library'):steam,game=path.join(library,'steamapps','common','Counter-Strike Global Offensive'),data=path.join(root,'Data'),cache=path.join(library,'steamapps','shadercache','730');
  await fs.mkdir(path.join(game,'game','bin','win64'),{recursive:true});await fs.mkdir(path.join(steam,'steamapps','shadercache'),{recursive:true});await fs.mkdir(cache,{recursive:true});await fs.mkdir(data);
  await fs.writeFile(path.join(steam,'steam.exe'),'Steam fixture');await fs.writeFile(path.join(game,'game','bin','win64','cs2.exe'),'CS2 fixture');await fs.writeFile(path.join(library,'steamapps','appmanifest_730.acf'),'"AppState" { "appid" "730" }');
  let running=false,installation={installed:true,cs2Installed:true,steamPath:steam,gamePath:game};const moves=[];
  const system={refreshSteam:async()=>({...installation}),isGameRunning:async()=>running};
  const create=()=>createShaderCache({directory:data,system,runReparseCheck:async()=>true,renameDirectory:async(source,destination)=>{moves.push({source,destination});return renameDirectory?renameDirectory(source,destination,moves.length):fs.rename(source,destination);}});
  const shader=create();
  return {root,steam,library,game,data,cache,system,shader,create,moves,set running(value){running=value;},set installation(value){installation=value;}};
}
async function put(root,file,text){const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);return target;}
test('conflicted shader recovery can detach only with a scoped one-use token and preserves every cache',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');const cleared=await clear(f);const backup=cleared.quarantines[0].path;
  await put(backup,'a','external change');await put(f.cache,'a','new cache');assert.equal((await f.shader.restore()).pendingRestore,true);
  const info=await f.shader.inspect();assert.equal(info.canDiscardRecovery,true);
  await assert.rejects(f.shader.discardRecovery(issueDiscardToken('shader-cache','boost:11111111-1111-4111-8111-111111111111')),/Confirmação/);
  assert.equal((await f.shader.inspect()).pendingRestore,true);
  const token=issueDiscardToken('shader-cache','boost:'+info.recoveryId),result=await f.shader.discardRecovery(token);
  assert.equal(result.discarded,true);assert.equal((await f.shader.inspect()).pendingRestore,false);
  assert.equal(await fs.readFile(path.join(backup,'a'),'utf8'),'external change');assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'new cache');
  assert.equal(JSON.parse(await fs.readFile(result.receiptPath,'utf8')).id,info.recoveryId);assert.equal(JSON.parse(await fs.readFile(path.join(f.data,'discard-audit.json'),'utf8'))[0].module,'shader-cache');
  assert.throws(()=>consumeDiscardToken('shader-cache',token,'boost:'+info.recoveryId),/Confirmação/);
});
test('active or running shader recovery cannot be detached',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');await clear(f);const info=await f.shader.inspect();
  assert.equal(info.canDiscardRecovery,false);await assert.rejects(f.shader.discardRecovery(issueDiscardToken('shader-cache','boost:'+info.recoveryId)),/conflito/);
  f.running=true;await assert.rejects(f.shader.discardRecovery('invalid'),/Feche o CS2/);f.running=false;await f.shader.restore();
});
async function clear(f){const preview=await f.shader.preview();return f.shader.clear({previewFingerprint:preview.previewFingerprint});}
async function absent(file){return await fs.lstat(file).then(()=>false,error=>error.code==='ENOENT');}

test('prévia fecha o catálogo em shadercache/730, calcula bytes/hash e não modifica cache',async t=>{
  const f=await fixture(t);await put(f.cache,'pipeline/shader.bin','abcd');await fs.mkdir(path.join(f.cache,'empty'));await put(path.join(f.steam,'steamapps','shadercache','999'),'other.bin','ignored');
  const info=await f.shader.preview();assert.equal(info.available,true);assert.equal(info.canClear,true);assert.equal(info.pendingRestore,false);assert.equal(info.targets.length,1);assert.equal(info.targets[0].id,'cs2-library');assert.equal(info.files,1);assert.equal(info.bytes,4);assert.equal(info.targets[0].folders,2);assert.match(info.previewFingerprint,/^[a-f\d]{64}$/);assert.match(info.message,/não garante mais FPS/);assert.equal(f.moves.length,0);assert.equal(await absent(f.shader.journalPath),true);
});
test('bibliotecas Steam primária e do CS2 são deduplicadas ou listadas separadamente',async t=>{
  const f=await fixture(t,{twoLibraries:true});await put(f.cache,'one','1');await put(path.join(f.steam,'steamapps','shadercache','730'),'two','22');const preview=await f.shader.preview();assert.deepEqual(preview.targets.map(target=>target.id),['cs2-library','steam-primary']);assert.equal(preview.files,2);assert.equal(preview.bytes,3);
});
test('reparação move o diretório inteiro para quarentena com diário prévio e restaura exatamente',async t=>{
  let journalAtMove=false;const f=await fixture(t,{renameDirectory:async(source,destination)=>{journalAtMove=!!JSON.parse(await fs.readFile(f.shader.journalPath,'utf8')).targets[0].before.fingerprint;return fs.rename(source,destination);}});await put(f.cache,'nested/a','original');await fs.mkdir(path.join(f.cache,'empty'));
  const before=await f.shader.preview(),result=await f.shader.clear({previewFingerprint:before.previewFingerprint});assert.equal(journalAtMove,true);assert.equal(result.pendingRestore,true);assert.equal(await absent(f.cache),true);assert.equal(await fs.readFile(path.join(result.quarantines[0].path,'nested/a'),'utf8'),'original');const restored=await f.shader.restore();assert.equal(restored.restored,true);assert.equal(restored.pendingRestore,false);assert.equal(await fs.readFile(path.join(f.cache,'nested/a'),'utf8'),'original');assert.equal((await f.shader.preview()).targets[0].snapshot.fingerprint,before.targets[0].snapshot.fingerprint);assert.equal(await absent(f.shader.journalPath),true);assert.equal((await fs.stat(path.join(f.cache,'empty'))).isDirectory(),true);
});
test('cache novo após o jogo é preservado separadamente antes de restaurar o original',async t=>{
  const f=await fixture(t);await put(f.cache,'same.bin','old');await clear(f);await put(f.cache,'same.bin','new');await put(f.cache,'extra.bin','extra');const restored=await f.shader.restore();assert.equal(await fs.readFile(path.join(f.cache,'same.bin'),'utf8'),'old');const preserved=restored.targets[0].preservedNewCache;assert.ok(preserved);assert.equal(await fs.readFile(path.join(preserved,'same.bin'),'utf8'),'new');assert.equal(await fs.readFile(path.join(preserved,'extra.bin'),'utf8'),'extra');assert.equal(await absent(path.join(f.cache,'extra.bin')),true);assert.equal(restored.pendingRestore,false);
});
test('prévia desatualizada é recusada antes de criar registro ou mover arquivos',async t=>{
  const f=await fixture(t);const file=await put(f.cache,'a.bin','old'),preview=await f.shader.preview();await fs.writeFile(file,'different');await assert.rejects(f.shader.clear({previewFingerprint:preview.previewFingerprint}),/mudou desde a prévia/);assert.equal(f.moves.length,0);assert.equal(await absent(f.shader.journalPath),true);
});
test('CS2 aberto impede reparação/restauração e prévia informa bloqueio',async t=>{
  const f=await fixture(t);await put(f.cache,'a','1');const preview=await f.shader.preview();f.running=true;assert.equal((await f.shader.preview()).canClear,false);await assert.rejects(f.shader.clear({previewFingerprint:preview.previewFingerprint}),/Feche o CS2/);await assert.rejects(f.shader.restore(),/Feche o CS2/);assert.equal(f.moves.length,0);
});
test('cache ausente ou vazio não é apresentado como reparação aplicável',async t=>{
  const f=await fixture(t);assert.equal((await f.shader.preview()).canClear,false);await fs.rmdir(f.cache);const info=await f.shader.preview();assert.equal(info.available,true);assert.equal(info.canClear,false);assert.equal(info.targets[0].exists,false);assert.equal(info.files,0);
});
test('instalação arbitrária ou executável Steam/CS2 ausente não cria alvo de reparação',async t=>{
  const f=await fixture(t);f.installation={installed:true,cs2Installed:true,steamPath:f.steam,gamePath:f.root};assert.equal((await f.shader.preview()).available,false);f.installation={installed:true,cs2Installed:true,steamPath:f.steam,gamePath:f.game};await fs.unlink(path.join(f.steam,'steam.exe'));assert.equal((await f.shader.preview()).available,false);assert.equal(f.moves.length,0);
});
test('alvo de outro app e caminhos fornecidos pelo chamador não são aceitos',async t=>{
  const f=await fixture(t);await put(f.cache,'a','1');const preview=await f.shader.preview();for(const request of [{previewFingerprint:preview.previewFingerprint,path:f.root},{target:f.root},null,{previewFingerprint:'bad'}])await assert.rejects(f.shader.clear(request),/prévia/);assert.equal(f.moves.length,0);
});
test('conteúdo alterado na quarentena impede restauração e preserva cache novo',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');const result=await clear(f);await fs.writeFile(path.join(result.quarantines[0].path,'a'),'tampered');await put(f.cache,'a','new');const restored=await f.shader.restore();assert.equal(restored.pendingRestore,true);assert.match(restored.preserved[0].motivo,/quarentena original foi alterado/);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'new');assert.equal((await f.shader.preview()).pendingRestore,true);
});
test('falha de acesso ao mover não é sucesso e o cache permanece preservado',async t=>{
  const f=await fixture(t,{renameDirectory:async()=>{throw Object.assign(new Error('Arquivo aberto ou acesso negado'),{code:'EPERM'});}});await put(f.cache,'a','old');await assert.rejects(clear(f),/Reparação do cache interrompida/);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'old');assert.equal((await f.shader.preview()).restoreState,'recovery-required');const restoration=await f.shader.restore();assert.equal(restoration.restored,true);assert.equal(await absent(f.shader.journalPath),true);
});
test('falha parcial entre bibliotecas é recuperável sem perder o cache que não foi movido',async t=>{
  let fail=true;const f=await fixture(t,{twoLibraries:true,renameDirectory:async(source,destination,count)=>{if(fail&&count===2)throw Error('Second library busy');return fs.rename(source,destination);}});await put(f.cache,'a','one');const primary=path.join(f.steam,'steamapps','shadercache','730');await put(primary,'b','two');await assert.rejects(clear(f),/Second library busy/);assert.equal(await absent(f.cache),true);assert.equal(await fs.readFile(path.join(primary,'b'),'utf8'),'two');fail=false;const restored=await f.shader.restore();assert.equal(restored.restored,true);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'one');assert.equal(await fs.readFile(path.join(primary,'b'),'utf8'),'two');
});
test('restauração parcial do cache recupera o alvo íntegro e preserva só a quarentena divergente',async t=>{
  const f=await fixture(t,{twoLibraries:true});await put(f.cache,'a','game-cache');const primary=path.join(f.steam,'steamapps','shadercache','730');await put(primary,'b','steam-cache');const cleared=await clear(f);const affected=cleared.quarantines[0],other=cleared.quarantines[1];await fs.writeFile(path.join(affected.path,affected.id==='cs2-library'?'a':'b'),'external edit');const result=await f.shader.restore();assert.equal(result.pendingRestore,true);assert.equal(result.targets.length,1);assert.equal(result.preserved.length,1);assert.equal(await fs.readFile(path.join(other.id==='cs2-library'?f.cache:primary,other.id==='cs2-library'?'a':'b'),'utf8'),other.id==='cs2-library'?'game-cache':'steam-cache');assert.equal((await f.shader.preview()).pendingRestore,true);
});
test('interrupção após preservar cache novo retoma pelo diário sem sobrescrever backups',async t=>{
  let failing=false;const f=await fixture(t,{renameDirectory:async(source,destination)=>{if(failing&&path.basename(source).startsWith('.csboost-cache-original-'))throw Error('Original still locked');return fs.rename(source,destination);}});await put(f.cache,'a','old');await clear(f);await put(f.cache,'a','new');failing=true;const interrupted=await f.shader.restore();assert.equal(interrupted.pendingRestore,true);assert.equal(interrupted.preserved[0].motivo,'Original still locked');assert.equal(await absent(f.cache),true);const journal=JSON.parse(await fs.readFile(f.shader.journalPath,'utf8'));assert.equal(journal.state,'recovery-required');assert.ok(journal.targets[0].current);failing=false;const restored=await f.create().restore();assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'old');assert.equal(await fs.readFile(path.join(restored.targets[0].preservedNewCache,'a'),'utf8'),'new');
});
test('diário prepared retoma movimento já ocorrido antes da atualização do estado',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');await clear(f);const journal=JSON.parse(await fs.readFile(f.shader.journalPath,'utf8'));journal.state='prepared';journal.targets[0].phase='planned';await fs.writeFile(f.shader.journalPath,JSON.stringify(journal));const result=await f.create().restore();assert.equal(result.restored,true);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'old');
});
test('retoma restauração cujo rename terminou antes da atualização do diário',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');const cleared=await clear(f);assert.equal(path.dirname(cleared.quarantines[0].path),path.dirname(f.cache));assert.match(path.basename(cleared.quarantines[0].path),/^\.csboost-cache-original-/);await fs.rename(cleared.quarantines[0].path,f.cache);const result=await f.create().restore();assert.equal(result.restored,true);assert.equal(result.targets[0].alreadyRestored,true);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'old');
});
test('backup do cache novo alterado após interrupção fica preservado e bloqueia continuação',async t=>{
  let failing=false;const f=await fixture(t,{renameDirectory:async(source,destination)=>{if(failing&&path.basename(source).startsWith('.csboost-cache-original-'))throw Error('Original locked');return fs.rename(source,destination);}});await put(f.cache,'a','old');await clear(f);await put(f.cache,'a','new');failing=true;await f.shader.restore();const journal=JSON.parse(await fs.readFile(f.shader.journalPath,'utf8')),preserved=path.join(path.dirname(f.cache),'.csboost-cache-new-'+journal.id);await fs.writeFile(path.join(preserved,'a'),'external change');failing=false;const result=await f.shader.restore();assert.equal(result.pendingRestore,true);assert.match(result.preserved[0].motivo,/backup do cache novo foi alterado/);assert.equal(await fs.readFile(path.join(preserved,'a'),'utf8'),'external change');
});
test('outro cache criado durante recuperação interrompida não sobrescreve nenhum backup',async t=>{
  let failing=false;const f=await fixture(t,{renameDirectory:async(source,destination)=>{if(failing&&path.basename(source).startsWith('.csboost-cache-original-'))throw Error('Original locked');return fs.rename(source,destination);}});await put(f.cache,'a','old');const cleared=await clear(f);await put(f.cache,'a','new');failing=true;await f.shader.restore();await put(f.cache,'a','newer');failing=false;const result=await f.shader.restore();assert.equal(result.pendingRestore,true);assert.match(result.preserved[0].motivo,/Outro cache foi criado/);assert.equal(await fs.readFile(path.join(f.cache,'a'),'utf8'),'newer');assert.equal(await fs.readFile(path.join(cleared.quarantines[0].path,'a'),'utf8'),'old');
});
test('registro adulterado não pode mudar biblioteca, alvo, identidade ou manifesto',async t=>{
  const f=await fixture(t);await put(f.cache,'a','1');await clear(f);const original=JSON.parse(await fs.readFile(f.shader.journalPath,'utf8'));
  for(const mutate of [value=>{value.targets[0].libraryRoot=f.root;},value=>{value.id='../escape';},value=>{value.targets[0].id='other-app';},value=>{value.targets[0].before.entries[0].path='../outside';}]){const value=structuredClone(original);mutate(value);await fs.writeFile(f.shader.journalPath,JSON.stringify(value));await assert.rejects(f.shader.restore());}
  assert.equal(f.moves.length,1);await fs.writeFile(f.shader.journalPath,JSON.stringify(original));await f.shader.restore();
});
test('reparação concorrente não cria duas quarentenas para o mesmo cache',async t=>{
  const f=await fixture(t);await put(f.cache,'a','1');const preview=await f.shader.preview(),results=await Promise.allSettled([f.shader.clear({previewFingerprint:preview.previewFingerprint}),f.shader.clear({previewFingerprint:preview.previewFingerprint})]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(f.moves.length,1);await f.shader.restore();
});
test('cache já idêntico ao original é reconhecido e backup original é mantido',async t=>{
  const f=await fixture(t);await put(f.cache,'a','old');const cleared=await clear(f);await put(f.cache,'a','old');const restored=await f.shader.restore();assert.equal(restored.targets[0].alreadyRestored,true);assert.equal(restored.targets[0].originalBackupRetained,cleared.quarantines[0].path);assert.equal(await fs.readFile(path.join(cleared.quarantines[0].path,'a'),'utf8'),'old');assert.equal((await f.shader.restore()).pendingRestore,false);
});
test('verificação nativa de reparse recusada bloqueia antes de mover',async t=>{
  const f=await fixture(t);await put(f.cache,'a','1');const shader=createShaderCache({directory:f.data,system:f.system,runReparseCheck:async()=>false});assert.equal((await shader.preview()).available,false);assert.equal(f.moves.length,0);
});
test('link para fora da pasta de cache é recusado e nenhum arquivo externo é movido',async t=>{
  const f=await fixture(t);const outside=await put(f.root,'outside.txt','private');try{await fs.symlink(outside,path.join(f.cache,'linked'));}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Windows sem privilégio de symlink para fixture.');return;}throw error;}assert.equal((await f.shader.preview()).available,false);assert.equal(await fs.readFile(outside,'utf8'),'private');assert.equal(f.moves.length,0);
});
