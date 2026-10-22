import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parsePresentMonCsv,summarizeFrameSeries,FRAME_SERIES_LIMITS} from '../src/free/frame-series.mjs';

const base=['Application','ProcessID','SwapChainAddress','PresentRuntime','CPUStartTime','MsBetweenPresents','MsCPUBusy','MsCPUWait','MsGPUBusy','MsGPUWait','DisplayedTime','PresentMode','AllowsTearing'];
const row=(overrides={})=>({Application:'cs2.exe',ProcessID:'730',SwapChainAddress:'0x1',PresentRuntime:'D3D11',CPUStartTime:'10',MsBetweenPresents:'4',MsCPUBusy:'1',MsCPUWait:'3',MsGPUBusy:'2',MsGPUWait:'0.5',DisplayedTime:'4',PresentMode:'Hardware: Independent Flip',AllowsTearing:'1',...overrides});
const csv=(rows,headers=base)=>headers.join(',')+'\r\n'+rows.map(values=>headers.map(key=>{const s=String(values[key]??'NA');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\r\n');
const known={processId:730,hagsEnabled:false,vulkan:false};
const series=(durations,quality={hagsEnabled:false,vulkan:false})=>({version:'2.3.1',timingSource:'MsBetweenPresents',timingDefinition:'present-interval',quality,frames:durations.map((ms,index)=>({t:index*10,msBetweenPresents:ms,msCPUBusy:ms/4,msGPUBusy:ms/2,presentRuntime:'D3D11',presentMode:'Hardware: Independent Flip',allowsTearing:true}))});

test('official-format synthetic default fixture keeps exact columns, unknown API, NA and dropped frames',async()=>{
  const input=await fs.readFile(new URL('./fixtures/presentmon/synthetic-2.3.1-default.csv',import.meta.url),'utf8');
  const parsed=parsePresentMonCsv(input,known);assert.equal(parsed.status,'available');assert.equal(parsed.frames.length,3);assert.equal(parsed.timingSource,'MsBetweenPresents');assert.equal(parsed.timestampSource,'CPUStartTime');assert.equal(parsed.frames[0].t,0);assert.equal(parsed.timestampOriginMs,1000);assert.equal(parsed.frames[0].msCPUBusy,1);assert.equal(parsed.frames[0].clickToPhoton,'unknown');assert.equal(parsed.dropped,1);assert.equal(parsed.presentRuntime,'unknown');assert.equal(parsed.presentRuntimes.DXGI,3);assert.equal(parsed.invalidRows,0);
});
test('v2 metric aliases record distinct CPU-frame interval semantics',async()=>{
  const input=await fs.readFile(new URL('./fixtures/presentmon/synthetic-2.3.1-v2.csv',import.meta.url),'utf8');const parsed=parsePresentMonCsv(input,known);assert.equal(parsed.frames.length,2);assert.equal(parsed.timingSource,'FrameTime');assert.equal(parsed.timingDefinition,'cpu-frame-interval');assert.equal(parsed.frames[0].msGPUBusy,2);assert.ok(parsed.quality.notes.some(text=>text.includes('não tem definição idêntica')));
});
test('column order, BOM, quoted commas, escaped quotes and embedded newlines are parsed by name',()=>{
  const headers=[...base].reverse(),parsed=parsePresentMonCsv('\ufeff'+csv([row({PresentMode:'Composed, "Flip"\nmode'})],headers),known);assert.equal(parsed.frames.length,1);assert.equal(parsed.frames[0].msBetweenPresents,4);assert.equal(parsed.frames[0].presentMode,'Composed, "Flip" mode');assert.equal(parsed.invalidRows,0);
});
test('invalid and truncated rows are discarded without discarding valid preceding frames',()=>{
  const input=csv([row(),row({CPUStartTime:'14',MsBetweenPresents:'NaN'}),row({CPUStartTime:'18',MsBetweenPresents:'0'}),row({CPUStartTime:'22'})])+'\ncs2.exe,730\n"unterminated';const parsed=parsePresentMonCsv(input,known);assert.equal(parsed.frames.length,2);assert.equal(parsed.invalidRows,4);
});
test('empty, duplicate headers, required missing columns and raw QPC never fabricate frames',()=>{
  for(const input of ['', 'Application,Application\ncs2.exe,cs2.exe','Application,MsBetweenPresents\ncs2.exe,4','Application,CPUStartQPC,MsBetweenPresents\ncs2.exe,12345678,4'])assert.equal(parsePresentMonCsv(input).status,'unavailable');
});
test('optional missing/NA metrics remain unknown while measured zero remains zero',()=>{
  const headers=['Application','CPUStartTime','MsBetweenPresents','MsCPUBusy','MsGPUBusy'],parsed=parsePresentMonCsv(csv([row({MsCPUBusy:'NA',MsGPUBusy:'0'})],headers));assert.equal(parsed.frames[0].msCPUBusy,'unknown');assert.equal(parsed.frames[0].msGPUBusy,0);assert.equal(parsed.frames[0].msCPUWait,'unknown');assert.equal(parsed.frames[0].displayed,'unknown');assert.equal(parsed.dropped,'unknown');
});
test('empty display observation is unknown; only documented NA means not displayed',()=>{
  const parsed=parsePresentMonCsv(csv([row({DisplayedTime:''})]),known);assert.equal(parsed.frames[0].displayed,'unknown');assert.equal(parsed.dropped,'unknown');assert.equal(parsed.droppedKnown,0);
});
test('PID and exact executable filter exclude unrelated applications and reused-name processes',()=>{
  const parsed=parsePresentMonCsv(csv([row({Application:'other.exe'}),row({ProcessID:'731'}),row({Application:'fakecs2.exe'}),row({Application:'CS2.EXE'})]),known);assert.equal(parsed.frames.length,1);assert.equal(parsed.ignoredRows,3);assert.equal(parsed.processId,730);assert.equal(parsePresentMonCsv(csv([row()],base.filter(key=>key!=='ProcessID')),known).status,'unavailable');assert.equal(parsePresentMonCsv(csv([row()]),{processId:-1}).status,'unavailable');
});
test('timestamps are strictly monotonic within a stream and legacy seconds convert to ms',()=>{
  const parsed=parsePresentMonCsv(csv([row(),row({CPUStartTime:'10'}),row({CPUStartTime:'9'}),row({CPUStartTime:'14'})]),known);assert.equal(parsed.frames.length,2);assert.equal(parsed.invalidRows,2);
  const old='Application,ProcessID,SwapChainAddress,Runtime,TimeInSeconds,msBetweenPresents,Dropped\ncs2.exe,730,0x1,DXGI,1.25,4,0\ncs2.exe,730,0x1,DXGI,1.254,4,1';const legacy=parsePresentMonCsv(old,known);assert.deepEqual(legacy.frames.map(frame=>frame.t),[0,4]);assert.equal(legacy.timestampOriginMs,1250);assert.equal(legacy.dropped,1);
});
test('dominant PID/swapchain is selected without merging independent clocks',()=>{
  const parsed=parsePresentMonCsv(csv([row({SwapChainAddress:'0x2'}),row({CPUStartTime:'14',SwapChainAddress:'0x2'}),row({CPUStartTime:'18',SwapChainAddress:'0x2'}),row({SwapChainAddress:'0x1',MsBetweenPresents:'100'}),row({CPUStartTime:'14',SwapChainAddress:'0x1',MsBetweenPresents:'100'})]),known);assert.equal(parsed.frames.length,3);assert.equal(parsed.stream.swapChainAddress,'0x2');assert.equal(parsed.stream.excludedFrames,2);assert.equal(summarizeFrameSeries(parsed).medianMs,4);assert.ok(parsed.quality.notes.some(text=>text.includes('Vários fluxos')));
});
test('resource bounds reject oversized CSV and mark partial row/frame captures',()=>{
  const input=csv([row(),row({CPUStartTime:'14'}),row({CPUStartTime:'18'})]);const bytes=parsePresentMonCsv(input,{...known,maxBytes:10});assert.equal(bytes.status,'unavailable');assert.equal(bytes.truncated,true);const rows=parsePresentMonCsv(input,{...known,maxRows:1});assert.equal(rows.frames.length,1);assert.equal(rows.truncated,true);const frames=parsePresentMonCsv(input,{...known,maxFrames:2});assert.equal(frames.frames.length,2);assert.equal(frames.truncated,true);assert.ok(FRAME_SERIES_LIMITS.maxFrames<1000000);
});
test('malformed numeric, overflow and implausible duration values do not poison statistics',()=>{
  const parsed=parsePresentMonCsv(csv([row({MsBetweenPresents:'1e309'}),row({CPUStartTime:'14',MsBetweenPresents:'1e300'}),row({CPUStartTime:'18',MsCPUBusy:'1e300'})]),known);assert.equal(parsed.frames.length,1);assert.equal(parsed.invalidRows,2);assert.equal(parsed.frames[0].msCPUBusy,'unknown');assert.ok(Number.isFinite(summarizeFrameSeries(parsed).medianMs));
});
test('tiny/overflow frame values cannot create non-finite FPS through the pure summary boundary',()=>{
  const result=summarizeFrameSeries(series([1e-308,1e308,4]));assert.equal(result.frameCount,1);assert.equal(result.onePercentLowFps,250);assert.equal(result.meanFps,250);const parsed=parsePresentMonCsv(csv([row({MsBetweenPresents:'1e-308'}),row({CPUStartTime:'14'})]),known);assert.equal(parsed.invalidRows,1);assert.equal(parsed.frames.length,1);
});
test('header-derived maps safely retain names that collide with object prototypes',()=>{
  const parsed=parsePresentMonCsv(csv([row({PresentMode:'__proto__',PresentRuntime:'constructor'})]),known);assert.equal(parsed.presentModes.__proto__,1);assert.equal(parsed.presentRuntimes.constructor,1);assert.equal(JSON.parse(JSON.stringify(parsed)).presentModes.__proto__,1);
});
test('Other runtime never proves Vulkan and suppresses ratios even with explicit non-Vulkan context',()=>{
  const parsed=parsePresentMonCsv(csv([row({PresentRuntime:'Other'})]),{processId:730,hagsEnabled:false});assert.equal(parsed.presentRuntime,'Other');assert.equal(parsed.quality.vulkan,'unknown');assert.equal(summarizeFrameSeries(parsed).gpuBusyRatio,'unknown');const explicit=parsePresentMonCsv(csv([row({PresentRuntime:'Other'})]),known);assert.equal(summarizeFrameSeries(explicit).cpuBusyRatio,'unknown');
});
test('constant series has exact percentiles, arithmetic 1% low and no stutters',()=>{
  const result=summarizeFrameSeries(series(Array(200).fill(4)));assert.equal(result.medianMs,4);assert.equal(result.p95Ms,4);assert.equal(result.p99Ms,4);assert.equal(result.onePercentLowFps,250);assert.equal(result.onePercentFrameCount,2);assert.equal(result.stutters,0);assert.equal(result.stutterEligibleFrames,190);assert.equal(result.cpuBusyRatio,.25);assert.equal(result.gpuBusyRatio,.5);
});
test('nearest-rank percentiles and isolated retrospective moving-median stutter have known values',()=>{
  const durations=Array(100).fill(4);durations[50]=40;const result=summarizeFrameSeries(series(durations));assert.equal(result.p95Ms,4);assert.equal(result.p99Ms,4);assert.equal(result.onePercentLowFps,25);assert.equal(result.stutters,1);assert.equal(result.medianMs,4);
});
test('1% low averages individual FPS of ceil(1%) worst frames instead of reciprocating mean duration',()=>{
  const result=summarizeFrameSeries(series([...Array(198).fill(4),100,200]));assert.equal(result.onePercentFrameCount,2);assert.equal(result.onePercentLowFps,7.5);assert.equal(result.p99Ms,4);assert.equal(result.methodology.onePercentLow.includes('distinct from VProf P1'),true);
});
test('small and empty series keep unknowns and explicit minimum history',()=>{
  const empty=summarizeFrameSeries(null);assert.equal(empty.status,'unavailable');assert.equal(empty.medianMs,'unknown');assert.equal(empty.onePercentLowFps,'unknown');assert.equal(empty.stutters,'unknown');const two=summarizeFrameSeries(series([4,12]));assert.equal(two.medianMs,8);assert.equal(two.p95Ms,12);assert.equal(two.onePercentLowFps,1000/12);assert.equal(two.stutters,'unknown');assert.ok(two.quality.notes.some(text=>text.includes('Menos de 100')));
});
test('rolling median excludes current frame, strict factor equality and warmup',()=>{
  const result=summarizeFrameSeries(series([4,4,12,13,4,40]),{stutterFactor:3,stutterWindow:2,stutterMinHistory:2});assert.equal(result.stutters,1);assert.equal(result.stutterEligibleFrames,4);assert.equal(result.methodology.stutterWindow,2);assert.equal(result.methodology.stutterFactor,3);
});
test('busy ratios require known HAGS=false and Vulkan=false, never convert missing samples to zero',()=>{
  for(const quality of [{hagsEnabled:true,vulkan:false},{hagsEnabled:'unknown',vulkan:false},{hagsEnabled:false,vulkan:'unknown'},{hagsEnabled:false,vulkan:true}]){const result=summarizeFrameSeries(series([4,4],quality));assert.equal(result.gpuBusyRatio,'unknown');assert.equal(result.cpuBusyRatio,'unknown');}
  const input=series([4,4]);input.frames[0].msGPUBusy='unknown';input.frames[1].msGPUBusy=0;const result=summarizeFrameSeries(input);assert.equal(result.gpuBusyRatio,0);assert.equal(result.gpuBusySamples,1);
});
test('predominant present mode, mixed/unknown tearing and public summaries are serializable',()=>{
  const input=series([4,4,4]);input.frames[0].presentMode='Composed: Flip';input.frames[0].allowsTearing=false;const result=summarizeFrameSeries(input);assert.equal(result.predominantPresentMode,'Hardware: Independent Flip');assert.equal(result.allowsTearing,'mixed');input.frames[1].allowsTearing='unknown';assert.equal(summarizeFrameSeries(input).allowsTearing,'unknown');assert.equal(JSON.parse(JSON.stringify(result)).frameCount,3);
});
test('session timeline is opt-in, bounded and preserves flagged frametime peaks',()=>{
  const input=series([...Array(999).fill(4),40]);const compact=summarizeFrameSeries(input);assert.equal(compact.timeline,undefined);const detailed=summarizeFrameSeries(input,{includeTimeline:true});assert.ok(detailed.timeline.samples.length<=960);assert.equal(detailed.timeline.samples[0].t,0);assert.ok(detailed.timeline.samples.some(point=>point.stutter&&point.ms===40));assert.ok(detailed.timeline.samples.every(point=>Number.isFinite(point.t)&&Number.isFinite(point.ms)));
});

test('timeline never substitutes frame indices for missing or unordered timestamps',()=>{
  for(const times of [[0,undefined,20],[0,20,10]]){const summary=summarizeFrameSeries({frames:times.map(t=>({t,msBetweenPresents:5}))},{includeTimeline:true});assert.equal(summary.status,'available');assert.equal(summary.timeline,undefined);assert.ok(summary.quality.notes.some(note=>note.includes('timestamps')));}
});
