import test from 'node:test';
import assert from 'node:assert/strict';
import {createExternalAdjustments,renderExternalAdjustmentsHtml} from '../src/free/external-adjustments.mjs';

const standardGuid='381b4222-f694-41f0-9685-ff5bb260df2e';
function fixture(overrides={}){
  const calls={writes:0,inventory:0};
  const base={
    system:{getPowerPlans:async()=>({activeGuid:standardGuid,plans:[{guid:standardGuid,name:'Equilibrado'}]}),getProfileConfigState:async()=>({supported:true,managed:true,conflict:false})},
    windowsTuning:{inspect:async()=>({active:{changes:[{id:'gameMode',name:'Modo de Jogo do Windows'},{id:'capture',name:'Desativar captura da Game Bar'}],conflicts:[]}})},
    optimizations:{inspect:async(_steamId,options)=>{assert.equal(options.preset,'competitive');return {active:{changes:[{key:'setting.msaa_samples',label:'Antisserrilhado'}],conflicts:[]}};}},
    readInventory:async request=>{calls.inventory++;assert.deepEqual(request,{operation:'externalAudit'});return {readOnly:true,services:{available:true,items:[{name:'SysMain',state:'Running',startMode:'Auto'}]},registry:{systemResponsiveness:{available:true,exists:true,type:'DWord',value:20},networkThrottlingIndex:{available:true,exists:true,type:'DWord',value:10},win32PrioritySeparation:{available:true,exists:true,type:'DWord',value:2},powerThrottlingOff:{available:true,exists:true,type:'DWord',value:0},allowGameDvr:{available:true,exists:true,type:'DWord',value:1},autoGameModeEnabled:{available:true,exists:true,type:'DWord',value:1},appCaptureEnabled:{available:true,exists:true,type:'DWord',value:1}}};},
    readBootOptions:async()=>({available:true,options:{useplatformclock:null,useplatformtick:null,disabledynamictick:null},forced:[]}),
    now:()=>new Date('2026-10-20T12:00:00.000Z'),...overrides,
  };
  return {audit:createExternalAdjustments(base),calls};
}
const find=(report,id)=>report.indicators.find(item=>item.id===id);

test('read-only audit labels a reference-like clean fixture without asserting external authorship',async()=>{
  const {audit,calls}=fixture();const report=await audit.inspect('76561198000000001');
  assert.equal(report.readOnly,true);assert.equal(report.capturedAt,'2026-10-20T12:00:00.000Z');
  assert.equal(find(report,'power-plans').status,'not-found');assert.equal(find(report,'hidden-power-plan').status,'unknown');
  assert.equal(find(report,'game-capture-external').status,'not-found');assert.equal(find(report,'services').status,'not-found');
  assert.equal(find(report,'registry-system-responsiveness').status,'not-found');assert.equal(find(report,'registry-power-throttling').status,'not-found');
  assert.equal(find(report,'registry-priority-separation').status,'not-found');assert.equal(find(report,'registry-network-throttling').status,'not-found');
  assert.equal(find(report,'registry-game-dvr-policy').status,'not-found');assert.equal(find(report,'registry-game-capture-preferences').status,'unknown');
  assert.equal(find(report,'boot-timers').status,'not-found');
  assert.equal(calls.inventory,1);assert.equal(calls.writes,0);assert.ok(report.indicators.every(item=>['found','not-found','unknown'].includes(item.status)));
});

test('custom plans, disabled monitored services and explicit registry indicators are reported with confidence limits',async()=>{
  const {audit}=fixture({
    system:{getPowerPlans:async()=>({activeGuid:'deafbeef-0000-4000-8000-000000000001',plans:[{guid:'deafbeef-0000-4000-8000-000000000001',name:'Game Boost'}]}),getProfileConfigState:async()=>({supported:false})},
    windowsTuning:{inspect:async()=>({active:null})},optimizations:{inspect:async()=>({active:null})},
    readInventory:async()=>({readOnly:true,services:{available:true,items:[{name:'SysMain',state:'Stopped',startMode:'Disabled'},{name:'GamingServices',state:'Running',startMode:'Auto'}]},registry:{systemResponsiveness:{available:true,exists:true,type:'DWord',value:100},networkThrottlingIndex:{available:true,exists:true,type:'DWord',value:0xffffffff},win32PrioritySeparation:{available:true,exists:true,type:'DWord',value:38},powerThrottlingOff:{available:true,exists:true,type:'DWord',value:1},allowGameDvr:{available:true,exists:true,type:'DWord',value:0},autoGameModeEnabled:{available:true,exists:false},appCaptureEnabled:{available:true,exists:false}}}),
  });
  const report=await audit.inspect('76561198000000001');
  assert.equal(find(report,'power-plans').status,'found');assert.equal(find(report,'services').status,'found');assert.equal(find(report,'services').confidence,'low');
  assert.equal(find(report,'registry-system-responsiveness').confidence,'high');assert.equal(find(report,'registry-power-throttling').status,'found');
  assert.equal(find(report,'registry-priority-separation').status,'found');assert.equal(find(report,'registry-network-throttling').status,'found');
  assert.equal(find(report,'registry-game-dvr-policy').status,'found');assert.match(find(report,'services').limitation,/não prova/);
});

test('timer overrides from the current boot entry are reported as debug options without applying changes',async()=>{
  const {audit,calls}=fixture({readBootOptions:async()=>({available:true,options:{useplatformclock:true,useplatformtick:false,disabledynamictick:null},forced:['useplatformclock']})});
  const row=find(await audit.inspect('76561198000000001'),'boot-timers');
  assert.equal(row.status,'found');assert.equal(row.confidence,'medium');assert.deepEqual(row.evidence,{useplatformclock:true,useplatformtick:false,disabledynamictick:null});
  assert.match(row.message,/apenas como ajuste para jogos/);assert.match(row.limitation,/não altera a inicialização/);assert.equal(calls.writes,0);
});

test('only a mismatch against a CSBOOST-owned before/after record is attributed as external',async()=>{
  const {audit}=fixture({
    windowsTuning:{inspect:async()=>({active:{changes:[{id:'gameMode',name:'Modo de Jogo do Windows'}],conflicts:['Modo de Jogo do Windows']}})},
    optimizations:{inspect:async()=>({active:{changes:[{key:'setting.msaa_samples',label:'Antisserrilhado'}],conflicts:['Antisserrilhado']}})},
    system:{getPowerPlans:async()=>({activeGuid:standardGuid,plans:[{guid:standardGuid,name:'Equilibrado'}]}),getProfileConfigState:async()=>({supported:true,managed:true,conflict:true})},
  });
  const row=find(await audit.inspect('76561198000000001'),'game-capture-external');
  assert.equal(row.status,'found');assert.equal(row.confidence,'high');assert.match(row.limitation,/antes da primeira referência/);
});

test('failed reads and missing account references stay unknown instead of becoming clean',async()=>{
  const {audit}=fixture({
    system:{getPowerPlans:async()=>{throw Error('denied');},getProfileConfigState:async()=>({supported:false})},
    windowsTuning:{inspect:async()=>{throw Error('denied');}},optimizations:{inspect:async()=>{throw Error('denied');}},
    readInventory:async()=>{throw Error('native unavailable');},
    readBootOptions:async()=>{throw Error('bcdedit unavailable');},
  });
  const report=await audit.inspect('invalid');
  assert.equal(find(report,'power-plans').status,'unknown');assert.equal(find(report,'game-capture-external').status,'unknown');
  assert.equal(find(report,'services').status,'unknown');assert.equal(find(report,'registry-system-responsiveness').status,'unknown');
  assert.equal(find(report,'registry-game-dvr-policy').status,'unknown');assert.ok(report.warnings.length>=3);
  assert.equal(find(report,'boot-timers').status,'unknown');
});

test('HTML export escapes machine-derived text and keeps the read-only statement',()=>{
  const html=renderExternalAdjustmentsHtml({version:1,readOnly:true,capturedAt:'now',summary:{found:1,notFound:0,unknown:0},indicators:[{title:'<script>x</script>',status:'found',confidence:'low',message:'A & B',source:{label:'source',url:'https://example.test/?a=1&b=2'},evidence:{name:'"quoted"'}}],limits:['<img src=x>']});
  assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);assert.match(html,/&lt;img src=x&gt;/);assert.match(html,/nenhuma configuração do Windows/);assert.doesNotMatch(html,/<script>/);
});
