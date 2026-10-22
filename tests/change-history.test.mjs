import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createChangeHistory,historyValue} from '../src/free/change-history.mjs';

const STEAM_ID='76561198000000000';
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'csboost-history-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}

test('bounded history records before/after, reason and restoration while redacting Steam IDs',async t=>{
  const root=await fixture(t),history=createChangeHistory({directory:path.join(root,'history'),now:()=> '2026-10-20T12:00:00.000Z'});
  const event=await history.record({moduleId:'windows',label:'Modo de Jogo',previous:{exists:false},applied:{exists:true,type:'DWord',data:1},reason:'Seleção para Steam '+STEAM_ID,restoration:'pending',action:'applied'});
  assert.equal(event.previous,'Não existia');assert.equal(event.applied,'DWord: 1');assert.equal(event.reason,'Seleção para Steam [ID Steam omitido]');
  await history.resolve({moduleId:'windows',labels:['Modo de Jogo'],status:'partial',reason:'Restauração parcial.'});
  const partial=(await history.list()).events[0];assert.equal(partial.restoration,'partial');assert.equal(partial.restoredAt,'2026-10-20T12:00:00.000Z');
  await history.resolve({moduleId:'windows',labels:['Modo de Jogo'],status:'restored'});
  const exported=await history.exportJson();assert.equal(JSON.parse(exported).events[0].restoration,'restored');assert.equal(exported.includes(STEAM_ID),false);assert.equal(exported.includes('ownerToken'),false);
  assert.equal(historyValue({value:4}), '4');
});

test('history caps stored and displayed records at its configured safe limit',async t=>{
  const root=await fixture(t),history=createChangeHistory({directory:path.join(root,'history'),limit:3});
  for(let index=0;index<5;index++)await history.record({moduleId:'video',label:'Opção '+index,previous:index,applied:index+1,reason:'Preset próprio',restoration:'pending'});
  const result=await history.list();assert.equal(result.limit,3);assert.equal(result.events.length,3);assert.deepEqual(result.events.map(event=>event.label).sort(),['Opção 2','Opção 3','Opção 4']);
});

test('partial restore separates confirmed values from discarded conflicting backups',async t=>{
  const root=await fixture(t),history=createChangeHistory({directory:path.join(root,'history')});
  for(const label of ['Modo de Jogo','GPU do CS2'])await history.record({moduleId:'windows',label,previous:'Desligado',applied:'Ligado',reason:'Seleção do usuário',restoration:'pending'});
  await history.resolve({moduleId:'windows',status:'partial',reason:'Há uma preferência externa em conflito.'});
  await history.resolve({moduleId:'windows',labels:['Modo de Jogo'],status:'restored',reason:'Valor original confirmado.'});
  await history.resolve({moduleId:'windows',status:'discarded',reason:'Backup conflitante descartado; valor atual mantido.'});
  const rows=new Map((await history.list()).events.map(event=>[event.label,event.restoration]));
  assert.equal(rows.get('Modo de Jogo'),'restored');assert.equal(rows.get('GPU do CS2'),'discarded');
});

test('T1 discard audits are reused without exporting ownership tokens or account identifiers',async t=>{
  const root=await fixture(t),source=path.join(root,'windows');await fs.mkdir(source);
  await fs.writeFile(path.join(source,'discard-audit.json'),JSON.stringify([{module:'windows',ownerToken:'boost:secret-owner-token',at:'2026-10-20T11:00:00.000Z',values:[{id:'gameMode',name:'Modo de Jogo',anterior:{exists:false},aplicado:{exists:true,type:'DWord',data:1},atual:{exists:true,type:'DWord',data:1},steamId:STEAM_ID}]}]));
  const history=createChangeHistory({directory:path.join(root,'history'),discardAuditDirectories:[source]});
  const events=(await history.list()).events;assert.equal(events.length,1);assert.equal(events[0].module,'Preferências do Windows');assert.equal(events[0].restoration,'discarded');
  const output=await history.exportJson();assert.equal(output.includes('secret-owner-token'),false);assert.equal(output.includes(STEAM_ID),false);assert.equal(output.includes('boost:'),false);
});

test('unknown modules and invalid restoration updates are rejected',async t=>{
  const root=await fixture(t),history=createChangeHistory({directory:path.join(root,'history')});
  await assert.rejects(()=>history.record({moduleId:'unknown',label:'x'}),/histórico inválido/);
  await assert.rejects(()=>history.resolve({moduleId:'video',status:'pending'}),/restauração inválido/);
});

test('history exports redact sensitive data inside values as well as property names',async t=>{
  const root=await fixture(t),history=createChangeHistory({directory:path.join(root,'history')});
  const email='ana.silva@example.com',account='76561198000000000',windowsPath='C:\\Users\\Ana Silva\\AppData\\Local\\CSBOOST\\report.json';
  await history.record({moduleId:'windows',label:'Diagnóstico de '+email,previous:windowsPath,applied:{value:account},reason:`Conta ${email} em ${windowsPath}`});
  const output=await history.exportJson();
  assert.equal(output.includes(email),false);assert.equal(output.includes(account),false);assert.equal(output.includes('Ana Silva'),false);assert.equal(output.includes('C:\\Users\\'),false);
  assert.ok(output.includes('[email omitido]'));assert.ok(output.includes('[ID Steam omitido]'));assert.ok(output.includes('[caminho local omitido]'));
});
