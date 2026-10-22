import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createNvidia,nvidiaFingerprint,NVIDIA_SETTINGS,NVIDIA_DRIVER_KEYS} from '../src/free/nvidia.mjs';
import driverBoosters from '../src/free/boosters/nvidia-driver-effects.mjs';
import {createBoostPlan} from '../src/free/boost-plan.mjs';
import {issueDiscardToken} from '../src/free/discard-confirmation.mjs';

const copy=x=>JSON.parse(JSON.stringify(x));
const ids=NVIDIA_SETTINGS.map(x=>x.id);
for(const key of NVIDIA_DRIVER_KEYS)test('driver effect can be selected independently and restores exact value: '+key,async t=>{
  const initial=baseline(),rule=NVIDIA_SETTINGS.find(item=>item.key===key),row=initial.settings.find(item=>item.id===rule.id);
  const f=await fixture(t,initial),options={preset:'custom',extraKeys:[key]};
  const before=await f.nvidia.inspect(options);assert.equal(before.preview.changes.length,row.recognized&&(!rule.requiresExisting||row.exists)&&(!row.exists||row.value!==rule.value)?1:0);
  row.exists=true;row.value=rule.value===0?1:0;row.location=0;row.userOverride=true;f.state=initial;
  const prior=copy(initial);
  const preview=await f.nvidia.inspect(options);assert.equal(preview.preview.changes.length,1);
  const booster=driverBoosters.find(item=>item.title.endsWith(rule.label));assert.equal((await booster.plan({nvidia:preview})).recommended,false);
  await f.nvidia.apply({...options,previewFingerprint:preview.preview.fingerprint});assert.equal(f.state.settings.find(item=>item.id===rule.id).value,rule.value);
  await f.nvidia.restore();assert.deepEqual(f.state,prior);
  row.recognized=false;row.exists=false;row.userOverride=false;f.state=initial;assert.equal((await f.nvidia.inspect(options)).preview.changes.length,0);
});

test('eight-setting recovery journal survives expanded driver inventory',async t=>{
  const f=await fixture(t),preview=await f.nvidia.inspect();await f.nvidia.apply({previewFingerprint:preview.preview.fingerprint});
  const journal=JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8'));delete journal.sha256;journal.before.settings=journal.before.settings.slice(0,8);journal.after.settings=journal.after.settings.slice(0,8);
  await fs.writeFile(f.nvidia.journalPath,JSON.stringify(journal));assert.equal((await f.nvidia.restore()).pendingRestore,false);
});
function baseline({exists=true,aliases=false}={}) {
  return {supported:true,application:'cs2.exe',driverVersion:61088,branch:'test-driver',profile:{exists,name:exists?'Counter-strike 2':'',predefined:exists,applications:exists?(aliases?['cs2.exe','csgos2.exe']:['cs2.exe']):[],settingCount:exists?2:0},settings:ids.map((id,i)=>({id,recognized:true,exists:exists&&i===0,type:0,value:exists&&i===0?5:0,location:exists&&i===0?1:3,predefined:false,userOverride:false}))};
}
async function fixture(t,initial=baseline(),options={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-nvidia-test-'));
  t.after(async()=>{assert.equal(path.dirname(root),os.tmpdir());assert.match(path.basename(root),/^csboost-nvidia-test-/);await fs.rm(root,{recursive:true,force:true});});
  let state=copy(initial),failAfterWrite=false;
  const calls=[];
  async function worker(request) {
    calls.push(copy(request));
    if(options.worker)return options.worker(request);
    if(request.operation==='read')return copy(state);
    if(request.operation==='apply') {
      assert.equal(request.before.application,'cs2.exe');
      if(!state.profile.exists)state.profile={exists:true,name:'CSBOOST - Counter-Strike 2',predefined:false,applications:['cs2.exe'],settingCount:request.settings.length};
      for(const item of request.settings)Object.assign(state.settings.find(x=>x.id===item.id),{exists:true,value:item.value,location:0,predefined:false,userOverride:true});
      if(failAfterWrite)throw new Error('Falha simulada depois da gravação do driver.');
      return {after:copy(state),changed:true};
    }
    if(request.operation==='restore') {
      const conflicts=[];for(const item of request.settings){const actual=state.settings.find(x=>x.id===item.id),prior=request.before.settings.find(x=>x.id===item.id);if(actual.userOverride&&actual.value!==item.value&&actual.value!==prior.value)conflicts.push(item.id);}
      if(!request.before.profile.exists)state=copy(request.before);
      else for(const item of request.settings)if(!conflicts.includes(item.id))Object.assign(state.settings.find(x=>x.id===item.id),request.before.settings.find(x=>x.id===item.id));
      return {after:copy(state),changed:true,conflicts};
    }
    throw new Error('Operação inesperada.');
  }
  const nvidia=createNvidia({dataDirectory:root,runWorker:worker,isGameRunning:options.isGameRunning??(async()=>false)});
  return {nvidia,root,calls,get state(){return state;},set state(value){state=copy(value);},set failAfterWrite(value){failAfterWrite=value;}};
}

test('prévia somente leitura traz alterações, efeitos e executáveis associados',async t=>{
  const f=await fixture(t,baseline({aliases:true}));const info=await f.nvidia.inspect();
  assert.equal(info.supported,true);assert.equal(info.canApply,true);assert.equal(info.pendingRestore,false);
  assert.deepEqual(info.preview.applications,['cs2.exe','csgos2.exe']);assert.match(info.preview.fingerprint,/^[a-f\d]{64}$/);
  assert.deepEqual(info.preview.changes.map(x=>x.key),['powerMode','refreshRate']);
  assert.equal(info.preview.source,'csboost-own-catalog');assert.equal(f.calls.length,1);assert.equal(f.calls[0].operation,'read');
  assert.equal(await fs.stat(f.nvidia.journalPath).catch(()=>null),null);
});
test('ausência de driver gera indisponibilidade honesta e nenhuma mutação',async t=>{
  const f=await fixture(t,baseline(),{worker:async()=>{throw new Error('NVAPI não está disponível.');}});
  const info=await f.nvidia.inspect();assert.equal(info.supported,false);assert.equal(info.canApply,false);assert.match(info.reason,/não está disponível/);
});
test('ajustes que o driver não reconhece ficam fora da aplicação e aparecem indisponíveis',async t=>{
  const state=baseline();state.settings[1].recognized=false;const f=await fixture(t,state);const info=await f.nvidia.inspect();
  assert.deepEqual(info.preview.unavailable.map(x=>x.key),['refreshRate']);assert.deepEqual(info.preview.changes.map(x=>x.key),['powerMode']);
  await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});assert.deepEqual(f.calls.find(x=>x.operation==='apply').settings,[{id:ids[0],value:1}]);
});
test('inventário inválido ou duplicado é recusado',async t=>{
  const f=await fixture(t);f.state={...f.state,application:'other.exe'};assert.equal((await f.nvidia.inspect()).supported,false);
  f.state=baseline();f.state.settings[1].id=f.state.settings[0].id;assert.equal((await f.nvidia.inspect()).supported,false);
});
test('bloqueia qualquer terceiro executável e não desloca aplicações de perfil',async t=>{
  const state=baseline({aliases:true});state.profile.applications.push('another-game.exe');const f=await fixture(t,state);
  const info=await f.nvidia.inspect();assert.equal(info.supported,true);assert.equal(info.canApply,false);
  await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/fora do perfil CS2/);
  assert.equal(f.calls.some(x=>x.operation==='apply'),false);
});
test('alias csgos2 é limitado ao perfil predefinido identificado da NVIDIA',async t=>{
  const state=baseline({aliases:true});state.profile.predefined=false;const f=await fixture(t,state);
  assert.equal((await f.nvidia.inspect()).canApply,false);
  state.profile.predefined=true;state.profile.name='Outro perfil';f.state=state;assert.equal((await f.nvidia.inspect()).canApply,false);
});
test('aplica somente catálogo fechado após prévia e guarda estado antes do worker',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect();
  const result=await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});
  assert.equal(result.changed,true);assert.equal(result.pendingRestore,true);assert.equal(result.restoreState,'active');
  const journal=JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8'));assert.equal(journal.state,'active');assert.equal(journal.before.settings[0].userOverride,false);assert.equal(journal.before.settings[0].value,5);
  assert.deepEqual(f.calls.find(x=>x.operation==='apply').settings,[{id:ids[0],value:1},{id:ids[1],value:1}]);
  await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/Restaure/);
});
test('preset competitivo avisa perda de qualidade e captura os quatro ajustes',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect({preset:'competitive'});
  assert.equal(info.preview.changes.length,4);assert.match(info.preview.changes.find(x=>x.key==='textureFilter').tradeoff,/qualidade/);assert.match(info.preview.changes.find(x=>x.key==='vsync').tradeoff,/rasgos/);
  await f.nvidia.apply({preset:'competitive',previewFingerprint:info.preview.fingerprint});assert.equal(f.calls.find(x=>x.operation==='apply').settings.length,4);
});
test('recommended NVIDIA profile includes video settings, adapts to existing controls, and restores exactly',async t=>{
  const f=await fixture(t),before=copy(f.state),lod=f.state.settings.find(item=>item.id===0x0019bb68);
  Object.assign(lod,{exists:true,value:1,location:1});
  const original=copy(f.state),info=await f.nvidia.inspect({preset:'recommended'}),keys=info.preview.changes.map(item=>item.key);
  assert.ok(keys.includes('powerMode'));assert.ok(keys.includes('refreshRate'));assert.ok(keys.includes('textureFilter'));
  assert.ok(keys.includes('anisotropicSample'));assert.ok(keys.includes('anisotropicFilter'));assert.ok(keys.includes('trilinear'));
  assert.ok(keys.includes('lowLatency'));assert.ok(keys.includes('negativeLodBias'));
  assert.equal(keys.includes('vsync'),false,'o vídeo não justifica forçar VSync desligado');
  const request=info.preview.changes.map(item=>({id:item.id,value:item.value}));
  assert.ok(request.some(item=>item.id===0x007ba09e&&item.value===1),'modo On limita a fila a um quadro');
  await f.nvidia.apply({preset:'recommended',previewFingerprint:info.preview.fingerprint});
  assert.equal(f.calls.find(call=>call.operation==='apply').preset,'recommended');
  assert.equal(f.state.settings.find(item=>item.id===0x0019bb68).value,0,'Allow permite viés negativo de LOD');
  await f.nvidia.restore();assert.deepEqual(f.state,original);
  assert.equal(before.settings.find(item=>item.id===0x0019bb68).exists,false);
});
test('optional texture preset exposes three settings without adding them to default presets',async t=>{
  const f=await fixture(t),normal=await f.nvidia.inspect({preset:'competitive'}),texture=await f.nvidia.inspect({preset:'texture'});assert.equal(normal.preview.changes.length,4);assert.equal(normal.textureOptimization.length,3);assert.equal(texture.preview.changes.length,3);assert.ok(texture.preview.changes.every(item=>['anisotropicSample','anisotropicFilter','trilinear'].includes(item.key)));
});
test('one selected texture option writes only that setting and restores its exact prior state',async t=>{
  const f=await fixture(t),before=copy(f.state),options={preset:'custom',extraKeys:['trilinear']},preview=await f.nvidia.inspect(options);assert.equal(preview.preview.changes.length,1);await f.nvidia.apply({...options,previewFingerprint:preview.preview.fingerprint});assert.deepEqual(f.calls.find(call=>call.operation==='apply').settings,[{id:0x002ecaf2,value:1}]);await f.nvidia.restore();assert.deepEqual(f.state,before);
});
test('Ultra latency is an explicit custom override to value 2 and restores the prior NVIDIA setting',async t=>{
  const initial=baseline(),rule=NVIDIA_SETTINGS.find(item=>item.key==='lowLatency'),row=initial.settings.find(item=>item.id===rule.id);row.exists=true;row.value=1;row.location=0;row.userOverride=true;
  const f=await fixture(t,initial),before=copy(initial),options={preset:'custom',extraKeys:['lowLatencyUltra']},preview=await f.nvidia.inspect(options);
  assert.deepEqual(preview.preview.changes.map(item=>[item.key,item.value]),[['lowLatency',2]]);
  await f.nvidia.apply({...options,previewFingerprint:preview.preview.fingerprint});assert.equal(f.state.settings.find(item=>item.id===rule.id).value,2);
  await f.nvidia.restore();assert.deepEqual(f.state,before);
  row.value=2;const unchanged=await fixture(t,initial);assert.equal((await unchanged.nvidia.inspect(options)).preview.changes.length,0);
});
test('competitive preset can explicitly include extra texture settings in the same recovery journal',async t=>{
  const f=await fixture(t),before=copy(f.state),options={preset:'competitive',extraKeys:['anisotropicSample','anisotropicFilter','trilinear']},preview=await f.nvidia.inspect(options);assert.equal(preview.preview.changes.length,7);await f.nvidia.apply({...options,previewFingerprint:preview.preview.fingerprint});assert.equal(f.calls.find(call=>call.operation==='apply').settings.length,7);await f.nvidia.restore();assert.deepEqual(f.state,before);
});
test('four-setting legacy backups still restore without touching new texture options',async t=>{
  const f=await fixture(t),preview=await f.nvidia.inspect({preset:'competitive'});await f.nvidia.apply({preset:'competitive',previewFingerprint:preview.preview.fingerprint});const journal=JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8'));delete journal.sha256;journal.before.settings=journal.before.settings.slice(0,4);journal.after.settings=journal.after.settings.slice(0,4);delete journal.extraKeys;await fs.writeFile(f.nvidia.journalPath,JSON.stringify(journal));assert.equal((await f.nvidia.inspect()).supported,true);await f.nvidia.restore();const restored=f.calls.find(call=>call.operation==='restore');assert.equal(restored.settings.length,4);assert.equal(restored.before.settings.length,NVIDIA_SETTINGS.length);assert.ok(restored.before.settings.slice(4).every(item=>!item.recognized&&!item.exists));
});
test('unrecognized texture controls and unknown extra keys never produce writes',async t=>{
  const initial=baseline();for(const setting of initial.settings.slice(4)){setting.recognized=false;setting.exists=false;}const f=await fixture(t,initial),preview=await f.nvidia.inspect({preset:'texture'});assert.equal(preview.preview.changes.length,0);assert.equal(preview.preview.unavailable.length,3);const result=await f.nvidia.apply({preset:'texture',previewFingerprint:preview.preview.fingerprint});assert.equal(result.changed,false);await assert.rejects(f.nvidia.apply({preset:'custom',extraKeys:['arbitrary'],previewFingerprint:preview.preview.fingerprint}),/Seleção NVIDIA/);assert.equal(f.calls.some(call=>call.operation==='apply'),false);
});
for(const selection of [['nvidia-trilinear'],['nvidia-low-latency-ultra'],['nvidia','nvidia-anisotropic-sample','nvidia-anisotropic-filter','nvidia-trilinear']])test('Boost integrates granular NVIDIA extras with one owned journal: '+selection.join(', '),async t=>{
  const f=await fixture(t),before=copy(f.state),system={isGameRunning:async()=>false,getSystemInfo:async()=>({platform:'win32',cpu:'Intel Core i7',gpu:'NVIDIA GeForce',logicalCores:16,ramGB:32}),getPowerPlans:async()=>({activeGuid:'381b4222-f694-41f0-9685-ff5bb260df2e',plans:[]})};
  const boost=createBoostPlan({directory:path.join(f.root,'boost'),system,optimizations:{inspect:async()=>{throw Error('No game fixture video');}},windowsTuning:{inspect:async()=>({items:[]})},nvidia:f.nvidia,getSteamId:async()=> '76561198000000001',getPowerContext:async()=>({onBattery:false})});
  const plan=await boost.preview({selection}),recommended=await f.nvidia.inspect({preset:'recommended'});assert.deepEqual([...plan.selectedIds].sort(),[...selection].sort());assert.equal(plan.items.find(item=>item.id==='nvidia-low-latency-ultra').recommended,false);await boost.apply({selectedIds:selection,previewFingerprint:plan.fingerprint});const applyCalls=f.calls.filter(call=>call.operation==='apply');assert.equal(applyCalls.length,1);assert.equal(applyCalls[0].settings.length,selection.length===1?1:recommended.preview.changes.length);assert.equal((await boost.inspect()).steps.length,1);await boost.restore();assert.deepEqual(f.state,before);
});
test('prévia obsoleta não grava diário nem chama mutação',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect();f.state.settings[0].value=0;
  await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/mudaram desde a prévia/);
  assert.equal(f.calls.some(x=>x.operation==='apply'),false);assert.equal(await fs.stat(f.nvidia.journalPath).catch(()=>null),null);
});
test('fechar jogo é obrigatório na aplicação e restauração',async t=>{
  let running=false;const f=await fixture(t,baseline(),{isGameRunning:async()=>running});const info=await f.nvidia.inspect();
  running=true;await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/Feche o CS2/);
  running=false;await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});running=true;
  await assert.rejects(f.nvidia.restore(),/Feche o CS2/);assert.ok(await fs.stat(f.nvidia.journalPath));
});
test('restauração preserva override antigo e remove override antes inexistente',async t=>{
  const initial=baseline();Object.assign(initial.settings[0],{location:0,userOverride:true,value:3});const f=await fixture(t,initial);
  const info=await f.nvidia.inspect();await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});
  const result=await f.nvidia.restore();assert.equal(result.restored,true);assert.equal(result.pendingRestore,false);
  assert.equal(f.state.settings[0].value,3);assert.equal(f.state.settings[0].userOverride,true);assert.equal(f.state.settings[1].userOverride,false);assert.equal(f.state.settings[1].exists,false);
  assert.equal(await fs.stat(f.nvidia.journalPath).catch(()=>null),null);
});
test('conflito externo restaura os demais ajustes NVIDIA e mantém só o valor divergente',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect();await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});f.state.settings[0].value=2;
  const result=await f.nvidia.restore();assert.equal(result.pendingRestore,true);assert.deepEqual(result.preserved.map(item=>item.id),[ids[0]]);assert.equal(f.state.settings[0].value,2);assert.equal(f.state.settings[1].userOverride,false);assert.equal(JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8')).settings.length,1);assert.equal((await f.nvidia.inspect()).pendingRestore,true);
});
test('NVIDIA discard requires one-use confirmation, valid ownership and audit; it never writes the driver',async t=>{
  const ownerToken='boost:11111111-1111-4111-8111-111111111111',f=await fixture(t),info=await f.nvidia.inspect();await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint,ownerToken});f.state.settings[0].value=2;const writes=f.calls.filter(call=>['apply','restore'].includes(call.operation)).length;
  await assert.rejects(f.nvidia.discardBackup(),/Confirmação/);assert.equal(f.calls.filter(call=>['apply','restore'].includes(call.operation)).length,writes);
  const result=await f.nvidia.discardBackup(await issueDiscardToken('nvidia'));assert.equal(result.discarded,true);assert.equal((await f.nvidia.inspect()).pendingRestore,false);assert.equal(f.calls.filter(call=>['apply','restore'].includes(call.operation)).length,writes);const audit=JSON.parse(await fs.readFile(path.join(f.root,'discard-audit.json'),'utf8'));assert.equal(audit[0].module,'nvidia');assert.equal(audit[0].ownerToken,ownerToken);assert.equal(audit[0].values[0].atual.value,2);
});
test('falha após gravação mantém prepared e nova instância pode recuperar',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect();f.failAfterWrite=true;
  await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/Falha simulada/);
  assert.equal(JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8')).state,'prepared');
  const second=createNvidia({dataDirectory:f.root,runWorker:async request=>{assert.equal(request.operation,'restore');return {after:baseline(),changed:true};}});
  assert.equal((await second.restore()).restored,true);assert.equal(await fs.stat(f.nvidia.journalPath).catch(()=>null),null);
});
test('perfil inexistente é capturado e removido na restauração',async t=>{
  const f=await fixture(t,baseline({exists:false}));const info=await f.nvidia.inspect();assert.equal(info.preview.createsProfile,true);
  await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});assert.equal(f.state.profile.name,'CSBOOST - Counter-Strike 2');
  await f.nvidia.restore();assert.equal(f.state.profile.exists,false);
});
test('valores já efetivos não criam override nem registro de recuperação',async t=>{
  const state=baseline();state.settings[0].value=1;Object.assign(state.settings[1],{exists:true,value:1,location:1});const f=await fixture(t,state);
  const info=await f.nvidia.inspect();assert.equal(info.preview.changes.length,0);
  const result=await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});assert.equal(result.changed,false);assert.equal(result.pendingRestore,false);assert.equal(f.calls.some(x=>x.operation==='apply'),false);
});
test('resposta de sucesso sem confirmação real mantém registro prepared',async t=>{
  const state=baseline();const f=await fixture(t,state,{worker:async r=>r.operation==='read'?copy(state):{after:copy(state),changed:true}});
  const info=await f.nvidia.inspect();await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint}),/não confirmou/);
  assert.equal(JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8')).state,'prepared');
});
test('registro adulterado não permite restaurar IDs ou aplicações arbitrárias',async t=>{
  const f=await fixture(t);const info=await f.nvidia.inspect();await f.nvidia.apply({preset:'performance',previewFingerprint:info.preview.fingerprint});
  const journal=JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8'));journal.settings[0].id=123;await fs.writeFile(f.nvidia.journalPath,JSON.stringify(journal));
  const previous=f.calls.length;await assert.rejects(f.nvidia.restore(),/alterado/);assert.equal(f.calls.length,previous);assert.equal((await f.nvidia.inspect()).pendingRestore,true);
});
test('fingerprint depende de preset, topologia do perfil e valores do driver',()=>{
  const state=baseline();assert.notEqual(nvidiaFingerprint(state),nvidiaFingerprint(state,'competitive'));
  const changed=copy(state);changed.settings[0].value=3;assert.notEqual(nvidiaFingerprint(state),nvidiaFingerprint(changed));
  assert.throws(()=>nvidiaFingerprint(state,'arbitrary'),/inválido/);
});
test('sem ajustes salvos restauração não chama NVAPI',async t=>{
  const f=await fixture(t);assert.equal((await f.nvidia.restore()).restored,false);assert.equal(f.calls.length,0);
});
test('solicitações inválidas não atingem o worker nativo',async t=>{
  const f=await fixture(t);await assert.rejects(f.nvidia.apply({preset:'performance',previewFingerprint:'bad'}),/prévia/);
  await assert.rejects(f.nvidia.apply({preset:'global',previewFingerprint:'a'.repeat(64)}),/inválido/);assert.equal(f.calls.length,0);
  assert.throws(()=>createNvidia({dataDirectory:'relative'}),/absoluta/);
});
test('arquivo de recuperação com link simbólico é recusado',async t=>{
  const f=await fixture(t);const other=path.join(f.root,'other.json');await fs.writeFile(other,'{}');
  try{await fs.symlink(other,f.nvidia.journalPath);}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('Windows sem privilégio de link simbólico.');return;}throw error;}
  assert.equal((await f.nvidia.inspect()).canApply,false);await assert.rejects(f.nvidia.restore(),/arquivo regular/);
});

test('shader cache is optional in the driver, restores exactly, and older seven-setting journals survive',async t=>{
  const initial=baseline();initial.settings.find(row=>row.id===0x00198FFF).exists=true;const f=await fixture(t,initial),before=copy(f.state),options={preset:'custom',extraKeys:['shaderCache']},preview=await f.nvidia.inspect(options);
  assert.equal(preview.preview.changes.length,1);assert.equal(preview.preview.changes[0].key,'shaderCache');await f.nvidia.apply({...options,previewFingerprint:preview.preview.fingerprint});assert.equal(f.state.settings.find(row=>row.id===0x00198FFF).value,1);await f.nvidia.restore();assert.deepEqual(f.state,before);
  const normal=await f.nvidia.inspect({preset:'competitive'});await f.nvidia.apply({preset:'competitive',previewFingerprint:normal.preview.fingerprint});const record=JSON.parse(await fs.readFile(f.nvidia.journalPath,'utf8'));delete record.sha256;record.before.settings=record.before.settings.slice(0,7);record.after.settings=record.after.settings.slice(0,7);await fs.writeFile(f.nvidia.journalPath,JSON.stringify(record));await f.nvidia.restore();assert.equal((await f.nvidia.inspect()).pendingRestore,false);
});
