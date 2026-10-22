import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {createProfiles,DEFAULT_SETTINGS,validateSettings,renderConfig} from '../src/free/profiles.mjs';
import {createSystem,parseLibraryPaths,parsePowerPlans} from '../src/free/system.mjs';
import {issueDiscardToken} from '../src/free/discard-confirmation.mjs';

// Every filesystem fixture is temporary; run/detect/spawn are injected. These
// tests never execute powercfg, PowerShell, reg, Steam or the original client.
async function temporary(t){
  const base=await fs.realpath(os.tmpdir());
  const directory=await fs.mkdtemp(path.join(base,'csboost-local-test-'));
  t.after(async()=>{
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(base));
    assert.ok(path.basename(resolved).startsWith('csboost-local-test-'));
    await fs.rm(resolved,{recursive:true,force:true});
  });
  return directory;
}
const settings=()=>structuredClone(DEFAULT_SETTINGS);
const profile=()=>({name:'Pessoal',settings:settings()});
const forbiddenRun=async()=>{throw new Error('A test attempted to execute an unmocked system command.');};
const forbiddenSpawn=()=>{throw new Error('A test attempted to spawn a real process.');};
function isolatedSystem(directory,options={}){
  return createSystem({dataDirectory:path.join(directory,'state'),run:forbiddenRun,detect:async()=>({installed:false,cs2Installed:false}),spawnImpl:forbiddenSpawn,...options});
}
async function gameFixture(directory){
  const gamePath=path.join(directory,'SteamLibrary','steamapps','common','Counter-Strike Global Offensive');
  const cfgPath=path.join(gamePath,'game','csgo','cfg');
  const steamPath=path.join(directory,'Steam');
  await fs.mkdir(cfgPath,{recursive:true});
  await fs.mkdir(steamPath,{recursive:true});
  return {installed:true,cs2Installed:true,steamPath,gamePath,cfgPath};
}
async function symbolicLink(t,target,link,type){
  try{await fs.symlink(target,link,type);return true;}
  catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('The host does not permit this symbolic-link fixture.');return false;}throw error;}
}

test('settings reject command injection, non-finite values and invalid bounds',()=>{
  const mutations=[
    s=>s.sensitivity='2"\r\nexec attacker',s=>s.volume='0.7;quit',
    s=>s.fpsMax=Infinity,s=>s.fpsMax=2.5,s=>s.fpsMax=-1,
    s=>s.crosshair.gap=NaN,s=>s.crosshair.color=6,
    s=>s.crosshair.dot='false',s=>s.viewmodelFov=69,
    s=>s.crosshair=null,
  ];
  for(const mutate of mutations){const value=settings();mutate(value);assert.throws(()=>validateSettings(value));assert.throws(()=>renderConfig({settings:value}));}
  assert.throws(()=>validateSettings(null));
  const value=settings();value.command='exec attacker';value.crosshair.command='quit';
  assert.deepEqual(validateSettings(value),settings());
  const text=renderConfig({name:'"\r\nexec attacker',settings:value});
  assert.match(text,/sensitivity "2"\r\n/);
  assert.match(text,/cl_crosshairdot "0"/);
  assert.doesNotMatch(text,/attacker|quit|undefined|NaN/);
});

test('profiles create, list, read, update and remove only their own UUID files',async t=>{
  const root=await temporary(t),directory=path.join(root,'profiles'),store=createProfiles(directory);
  assert.deepEqual(await store.list(),[]);
  const created=await store.save({name:'  Pessoal  ',settings:settings()});
  assert.match(created.id,/^[a-f\d-]{36}$/i);
  assert.equal(created.name,'Pessoal');
  assert.deepEqual(await store.read(created.id),created);
  const changed=settings();changed.sensitivity=1.4;
  const updated=await store.save({id:created.id,name:'Treino',settings:changed});
  assert.equal(updated.id,created.id);
  assert.equal(updated.settings.sensitivity,1.4);
  await fs.writeFile(path.join(directory,'unrelated.json'),'{}');
  await fs.writeFile(path.join(directory,created.id+'.json.leftover.tmp'),'temporary');
  assert.deepEqual(await store.list(),[updated]);
  assert.deepEqual(await store.remove(created.id),{deleted:true});
  assert.deepEqual(await store.list(),[]);
  await assert.rejects(store.read(created.id),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(directory,'unrelated.json'),'utf8'),'{}');
  await assert.rejects(store.save({id:created.id,...profile()}),{code:'ENOENT'});
  await assert.rejects(store.save({name:' '.repeat(4),settings:settings()}));
  await assert.rejects(store.save({name:'a'.repeat(65),settings:settings()}));
});

test('profile APIs reject traversal and absolute paths before accessing files',async t=>{
  const root=await temporary(t),store=createProfiles(path.join(root,'profiles'));
  const outside=path.join(root,'outside.json');
  await fs.writeFile(outside,'keep');
  const ids=['../outside','../../outside.json',outside,'00000000-0000-0000-0000-000000000000/../../outside',null,42];
  for(const id of ids){
    await assert.rejects(store.read(id),/Identificador/);
    await assert.rejects(store.remove(id),/Identificador/);
    // null is the intentional optional-ID representation for creation.
    if(id!==null)await assert.rejects(store.save({id,...profile()}),/Identificador/);
  }
  assert.equal(await fs.readFile(outside,'utf8'),'keep');
});

test('profiles reject corrupted reads and isolate them from the usable list',async t=>{
  const root=await temporary(t),store=createProfiles(path.join(root,'profiles'));
  const created=await store.save(profile());
  await fs.writeFile(path.join(store.directory,created.id+'.json'),JSON.stringify({...created,updatedAt:null}));
  await assert.rejects(store.read(created.id),/inconsistente/);
  assert.deepEqual(await store.list(),[]);
  assert.equal(store.getHealth().invalidCount,1);
  assert.match(store.getHealth().issues[0].reason,/inconsistente/);
});

test('profile files reject symbolic links for read, update and delete',async t=>{
  const root=await temporary(t),store=createProfiles(path.join(root,'profiles'));
  const created=await store.save(profile()),target=path.join(store.directory,created.id+'.json');
  const external=path.join(root,'external-profile.json');
  await fs.rename(target,external);
  if(!await symbolicLink(t,external,target,'file'))return;
  await assert.rejects(store.read(created.id),/arquivo regular/);
  await assert.rejects(store.save({id:created.id,...profile()}),/arquivo regular/);
  await assert.rejects(store.remove(created.id),/arquivo regular/);
  assert.equal(JSON.parse(await fs.readFile(external,'utf8')).id,created.id);
});

test('profile storage rejects a symbolic-link directory',async t=>{
  const root=await temporary(t),external=path.join(root,'external-profiles'),linked=path.join(root,'profiles');
  await fs.mkdir(external);
  if(!await symbolicLink(t,external,linked,process.platform==='win32'?'junction':'dir'))return;
  const store=createProfiles(linked);
  await assert.rejects(store.save(profile()),/diretório regular/);
  await assert.rejects(store.list(),/diretório regular/);
  assert.deepEqual(await fs.readdir(external),[]);
});

test('library paths parse modern and legacy VDF escaping without game/profile contents',()=>{
  const modern=String.raw`"libraryfolders" { "0" { "path" "C:\\Program Files (x86)\\Steam" "apps" {"730" "12"} } "1" {"path" "D:\\SteamLibrary"} "2" {"path" "\\\\server\\games"} }`;
  assert.deepEqual(parseLibraryPaths(modern),['C:\\Program Files (x86)\\Steam','D:\\SteamLibrary','\\\\server\\games']);
  const old=String.raw`"1" "E:\\Games" "2" "E:\\Games" "730" "54321"`;
  assert.deepEqual(parseLibraryPaths(old),['E:\\Games']);
  assert.deepEqual(parseLibraryPaths('"apps" { "730" "123456" }'),[]);
});

const BALANCED='381b4222-f694-41f0-9685-ff5bb260df2e';
const HIGH='8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const SAVER='a1841308-3541-4fab-bc81-f71556f20b4a';
test('power plans parse Portuguese/English labels and parenthesized names',()=>{
  const result=parsePowerPlans(`Esquemas de Energia Existentes\r\nGUID do Esquema de Energia: ${BALANCED}  (Equilibrado) *\r\nPower Scheme GUID: ${HIGH.toUpperCase()} (High performance (custom))\r\ninvalid`,HIGH);
  assert.deepEqual(result,[{guid:BALANCED,name:'Equilibrado',active:false},{guid:HIGH,name:'High performance (custom)',active:true}]);
  assert.equal(parsePowerPlans(`GUID: ${HIGH} (Alto desempenho)`)[0].active,false);
});
function powerMock(initial=BALANCED){
  const state={active:initial,installed:[BALANCED,HIGH,SAVER],calls:[],ignoreSet:false,failSet:false};
  state.run=async(file,args)=>{
    assert.equal(path.basename(file).toLowerCase(),'powercfg.exe');
    state.calls.push([...args]);
    if(args.length===1&&args[0]==='/getactivescheme')return `GUID do Esquema de Energia: ${state.active} (Plano atual)\r\n`;
    if(args.length===1&&args[0]==='/list')return state.installed.map((id,i)=>`GUID do Esquema de Energia: ${id} (Plano ${i}) ${id===state.active?'*':''}`).join('\r\n');
    assert.equal(args.length,2);assert.equal(args[0],'/setactive');assert.ok(state.installed.includes(args[1]));
    if(state.failSet)throw new Error('Acesso negado (simulado)');
    if(!state.ignoreSet)state.active=args[1];
    return '';
  };
  return state;
}

test('power plan changes preserve the original GUID across multiple selections then restore it',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run});
  const first=await system.activatePowerPlan(HIGH.toUpperCase());
  assert.equal(first.activeGuid,HIGH);assert.equal(first.restoreGuid,BALANCED);
  const second=await system.activatePowerPlan(SAVER);
  assert.equal(second.restoreGuid,BALANCED);
  const stateFile=path.join(root,'state','power-restore.json');
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).guid,BALANCED);
  const restored=await system.restorePowerPlan();
  assert.equal(restored.activeGuid,BALANCED);assert.equal(restored.restoreGuid,null);
  await assert.rejects(fs.stat(stateFile),{code:'ENOENT'});
  assert.deepEqual(mock.calls.filter(a=>a[0]==='/setactive'),[['/setactive',HIGH],['/setactive',SAVER],['/setactive',BALANCED]]);
});

test('already active plans do not create recovery state or run mutation commands',async t=>{
  const root=await temporary(t),mock=powerMock(HIGH),system=isolatedSystem(root,{run:mock.run});
  assert.equal((await system.activatePowerPlan(HIGH)).activeGuid,HIGH);
  assert.equal(mock.calls.some(a=>a[0]==='/setactive'),false);
  await assert.rejects(fs.stat(path.join(root,'state','power-restore.json')),{code:'ENOENT'});
});

test('arbitrary command IDs and noninstalled GUIDs cannot reach powercfg /setactive',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run});
  for(const id of ['& calc.exe','/setactive',HIGH+' & calc',null,42,'00000000-0000-0000-0000-000000000000'])await assert.rejects(system.activatePowerPlan(id));
  assert.equal(mock.calls.some(a=>a[0]==='/setactive'),false);
  await assert.rejects(system.restorePowerPlan(),/Não há plano anterior/);
});

test('failed or unconfirmed restoration retains the recovery record',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run});
  await system.activatePowerPlan(HIGH);
  const stateFile=path.join(root,'state','power-restore.json');
  mock.failSet=true;await assert.rejects(system.restorePowerPlan(),/Acesso negado/);
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).guid,BALANCED);
  mock.failSet=false;mock.ignoreSet=true;
  await assert.rejects(system.restorePowerPlan(),/não confirmou a restauração/);
  assert.equal(JSON.parse(await fs.readFile(stateFile,'utf8')).guid,BALANCED);
  assert.equal(mock.active,HIGH);
  mock.ignoreSet=false;assert.equal((await system.restorePowerPlan()).activeGuid,BALANCED);
});

test('activation must be confirmed and an unavailable original plan is not restored',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run});
  mock.ignoreSet=true;
  await assert.rejects(system.activatePowerPlan(HIGH),/não confirmou a ativação/);
  assert.equal((await system.getPowerPlans()).restoreGuid,BALANCED);
  mock.ignoreSet=false;await system.activatePowerPlan(HIGH);
  mock.installed=mock.installed.filter(id=>id!==BALANCED);
  const before=mock.calls.length;
  await assert.rejects(system.restorePowerPlan(),/não está mais instalado/);
  assert.equal(mock.calls.slice(before).some(a=>a[0]==='/setactive'),false);
  assert.equal((await system.getPowerPlans()).restoreGuid,BALANCED);
});

test('power backup discard is one-use, owner-bound, audited, and never changes the active plan',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run}),ownerToken='boost:11111111-1111-4111-8111-111111111111';
  await system.activatePowerPlan(HIGH,{ownerToken});mock.active=SAVER;const count=mock.calls.filter(args=>args[0]==='/setactive').length;
  await assert.rejects(system.discardPowerBackup(),/Confirmação/);await assert.rejects(system.discardPowerBackup(await issueDiscardToken('power','boost:22222222-2222-4222-8222-222222222222')),/Confirmação/);
  const result=await system.discardPowerBackup(await issueDiscardToken('power',ownerToken));assert.equal(result.discarded,true);assert.equal(mock.active,SAVER);assert.equal(mock.calls.filter(args=>args[0]==='/setactive').length,count);assert.equal((await system.getPowerPlans()).restoreGuid,null);
  const audit=JSON.parse(await fs.readFile(path.join(root,'state','discard-audit.json'),'utf8'));assert.equal(audit[0].module,'power');assert.equal(audit[0].values[0].atual,SAVER);
});

test('tampered power recovery record blocks discard without changing the active scheme',async t=>{
  const root=await temporary(t),mock=powerMock(),system=isolatedSystem(root,{run:mock.run}),ownerToken='boost:11111111-1111-4111-8111-111111111111';await system.activatePowerPlan(HIGH,{ownerToken});const file=path.join(root,'state','power-restore.json'),record=JSON.parse(await fs.readFile(file,'utf8'));record.appliedGuid=SAVER;await fs.writeFile(file,JSON.stringify(record));const previous=mock.calls.filter(args=>args[0]==='/setactive').length;await assert.rejects(system.discardPowerBackup(await issueDiscardToken('power',ownerToken)),/Registro de energia inválido/);assert.equal(mock.active,HIGH);assert.equal(mock.calls.filter(args=>args[0]==='/setactive').length,previous);
});

test('profile application backs up only csboost.cfg and leaves autoexec untouched',async t=>{
  const root=await temporary(t),game=await gameFixture(root),system=isolatedSystem(root,{detect:async()=>game});
  const target=path.join(game.cfgPath,'csboost.cfg'),autoexec=path.join(game.cfgPath,'autoexec.cfg');
  await fs.writeFile(target,'// existing CSBOOST config\r\nvolume 0.2\r\n');
  await fs.writeFile(autoexec,'// existing player autoexec\r\nbind F1 buy\r\n');
  const output=await system.applyProfile(profile());
  assert.equal(output.path,target);assert.equal(output.launchArgument,'+exec csboost.cfg');
  assert.equal(path.dirname(output.backupPath),path.join(root,'state','config-backups'));
  assert.equal(await fs.readFile(output.backupPath,'utf8'),'// existing CSBOOST config\r\nvolume 0.2\r\n');
  assert.equal(await fs.readFile(target,'utf8'),renderConfig(profile()));
  assert.equal(await fs.readFile(autoexec,'utf8'),'// existing player autoexec\r\nbind F1 buy\r\n');
  assert.deepEqual((await fs.readdir(game.cfgPath)).sort(),['autoexec.cfg','csboost.cfg']);
});

test('first profile application creates no fake backup and invalid settings write nothing',async t=>{
  const root=await temporary(t),game=await gameFixture(root),system=isolatedSystem(root,{detect:async()=>game});
  const invalid=profile();invalid.settings.sensitivity='2;exec attacker';
  await assert.rejects(system.applyProfile(invalid));assert.deepEqual(await fs.readdir(game.cfgPath),[]);
  assert.equal((await system.applyProfile(profile())).backupPath,null);
  await assert.rejects(fs.stat(path.join(root,'state','config-backups')),{code:'ENOENT'});
});

test('profile application rejects cfg outside the game and unrelated game subdirectories',async t=>{
  const root=await temporary(t),game=await gameFixture(root);
  const outside=path.join(root,'outside-cfg'),otherInside=path.join(game.gamePath,'other-cfg');
  for(const cfgPath of [outside,otherInside]){
    await fs.mkdir(cfgPath,{recursive:true});
    const system=isolatedSystem(root,{detect:async()=>({...game,cfgPath})});
    await assert.rejects(system.applyProfile(profile()),/game\/csgo\/cfg/);
    assert.deepEqual(await fs.readdir(cfgPath),[]);
  }
});

test('profile application rejects a directory symlink even when it points inside the game',async t=>{
  const root=await temporary(t),game=await gameFixture(root),linked=path.join(game.gamePath,'cfg-link');
  if(!await symbolicLink(t,game.cfgPath,linked,process.platform==='win32'?'junction':'dir'))return;
  const system=isolatedSystem(root,{detect:async()=>({...game,cfgPath:linked})});
  await assert.rejects(system.applyProfile(profile()),/diretório regular/);
  assert.deepEqual(await fs.readdir(game.cfgPath),[]);
});

test('apply and configured launch reject a symlink target without overwriting its destination',async t=>{
  const root=await temporary(t),game=await gameFixture(root),external=path.join(root,'external.cfg');
  await fs.writeFile(external,'// preserve outside target');
  if(!await symbolicLink(t,external,path.join(game.cfgPath,'csboost.cfg'),'file'))return;
  const system=isolatedSystem(root,{detect:async()=>game});
  await assert.rejects(system.applyProfile(profile()),/regular/);
  await assert.rejects(system.launchCS2({withConfig:true}),/regular/);
  assert.equal(await fs.readFile(external,'utf8'),'// preserve outside target');
});

test('Steam launch uses only fixed game/config arguments and reports a request, not fake game startup',async t=>{
  const root=await temporary(t),game=await gameFixture(root),calls=[];
  const spawnImpl=(file,args,options)=>{
    const child=new EventEmitter();child.unref=()=>{child.unreferenced=true;};
    calls.push({file,args,options,child});queueMicrotask(()=>child.emit('spawn'));return child;
  };
  const system=isolatedSystem(root,{detect:async()=>game,spawnImpl});
  await assert.rejects(system.launchCS2({withConfig:'true'}),/Opção/);
  await assert.rejects(system.launchCS2(null),/Opção/);
  await assert.rejects(system.launchCS2({withConfig:true}),/Aplique um perfil/);
  assert.equal(calls.length,0);
  const request=await system.launchCS2({withConfig:false,args:['-insecure','& calc']});
  assert.deepEqual(calls[0].args,['-applaunch','730']);
  assert.equal(calls[0].file,path.join(game.steamPath,'steam.exe'));
  assert.equal(calls[0].options.shell,false);assert.equal(calls[0].options.windowsHide,true);
  assert.equal(calls[0].child.unreferenced,true);assert.equal(request.requested,true);
  await system.applyProfile(profile());
  await system.launchCS2({withConfig:true});
  assert.deepEqual(calls[1].args,['-applaunch','730','+exec','csboost.cfg']);
});

test('missing Steam/CS2 and spawn failure remain real errors',async t=>{
  const root=await temporary(t),missing=isolatedSystem(root);
  await assert.rejects(missing.launchCS2(),/precisam estar instalados/);
  await assert.rejects(missing.applyProfile(profile()),/CS2 não encontrado/);
  const game=await gameFixture(root),system=isolatedSystem(root,{detect:async()=>game,spawnImpl:()=>{
    const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('error',new Error('Steam failed (mock)')));return child;
  }});
  await assert.rejects(system.launchCS2(),/Steam failed/);
});
