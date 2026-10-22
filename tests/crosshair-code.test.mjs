import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeCrosshairCode,encodeCrosshairCode,crosshairCodeToEditor,editorCrosshairToCode,crosshairCodeToConVars,CrosshairCodeError} from '../src/free/crosshair-code.mjs';
import {DEFAULT_CROSSHAIR} from '../src/free/profiles.mjs';

// MIT vectors from pinned upstream source, never fetched during a test run.
const {samples}=JSON.parse(await fs.readFile(new URL('./fixtures/crosshair-upstream-v7.json',import.meta.url),'utf8'));
const alphabet='ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';
function bytesCode(raw,container='legacy'){
  const b=Buffer.from(raw);b[0]=b.subarray(1).reduce((a,x)=>a+x,0)%256;
  let n=BigInt('0x'+b.toString('hex')),text='';
  for(let i=0;i<(container==='legacy'?25:44);i++){text+=alphabet[Number(n%57n)];n/=57n;}
  return container==='legacy'?'CSGO-'+text.match(/.{5}/g).join('-'):'CS'+text;
}
const sourceByFormat=format=>samples.find(s=>s.fields.format===format);

for(const sample of samples){
  test('decode upstream '+sample.code,()=>{
    const decoded=decodeCrosshairCode(sample.code);
    assert.deepEqual(decoded.fields,sample.fields);
    assert.equal(decoded.format,sample.fields.format);
    assert.equal(decoded.codeVersion,Number(sample.fields.format.split('-v')[1]));
    assert.equal(decoded.rawHex.length,sample.fields.format==='cs2-v1'?64:36);
  });
  test('encode upstream '+sample.code,()=>{
    assert.equal(encodeCrosshairCode(sample.fields).code,sample.code);
    assert.equal(encodeCrosshairCode(sample.fields,{sourceCode:sample.code}).code,sample.code);
  });
}
test('only surrounding whitespace is tolerated',()=>{
  const code=sourceByFormat('legacy-v4').code;
  assert.equal(decodeCrosshairCode(' \n'+code+'\t').code,code);
  assert.throws(()=>decodeCrosshairCode(code.replace('-',' ')),CrosshairCodeError);
  assert.throws(()=>decodeCrosshairCode(code.replaceAll('-','')),CrosshairCodeError);
});
test('invalid types, sizes and every excluded dictionary character fail',()=>{
  for(const value of [null,{},[],0,'','CSGO-AAAAA','A'.repeat(10000),'CS'+'A'.repeat(43),'CS'+'A'.repeat(45)])assert.throws(()=>decodeCrosshairCode(value),CrosshairCodeError);
  for(const character of ['0','1','I','g','l','_','-','é',' ']){
    const code=sourceByFormat('legacy-v4').code;
    assert.throws(()=>decodeCrosshairCode(code.slice(0,5)+character+code.slice(6)),CrosshairCodeError);
    const modern=sourceByFormat('cs2-v1').code;
    assert.throws(()=>decodeCrosshairCode(modern.slice(0,2)+character+modern.slice(3)),CrosshairCodeError);
  }
});
test('base57 integers exceeding exact container widths fail before checksum',()=>{
  for(const code of ['CSGO-99999-99999-99999-99999-99999','CS'+'9'.repeat(44)])assert.throws(()=>decodeCrosshairCode(code),error=>error.reason==='overflow');
});
test('checksum includes trailing unused bytes',()=>{
  for(const format of ['legacy-v1','legacy-v3','legacy-v4','cs2-v1']){
    const source=sourceByFormat(format),d=decodeCrosshairCode(source.code),b=Buffer.from(d.rawHex,'hex');
    b[b.length-1]^=1;
    const code=bytesCode(b,d.container);
    const changed=decodeCrosshairCode(code);
    assert(changed.warnings.some(w=>w.includes('Bits reservados')));
    // Make checksum inconsistent while producing a syntactically valid container.
    const invalid=Buffer.from(b);invalid[0]=d.rawHex.slice(0,2)?Number.parseInt(d.rawHex.slice(0,2),16):0;
    let n=BigInt('0x'+invalid.toString('hex')),chars='';
    for(let i=0;i<(d.container==='legacy'?25:44);i++){chars+=alphabet[Number(n%57n)];n/=57n;}
    const bad=d.container==='legacy'?'CSGO-'+chars.match(/.{5}/g).join('-'):'CS'+chars;
    assert.throws(()=>decodeCrosshairCode(bad),error=>error.reason==='checksum');
  }
});
test('unsupported versions including legacy2 are refused even with a valid checksum',()=>{
  for(const [format,version] of [['legacy-v3',2],['legacy-v4',5],['cs2-v1',2]]){
    const d=decodeCrosshairCode(sourceByFormat(format).code),b=Buffer.from(d.rawHex,'hex');b[1]=version;
    assert.throws(()=>decodeCrosshairCode(bytesCode(b,d.container)),error=>error.reason==='version');
  }
});
for(const format of ['legacy-v1','legacy-v3','legacy-v4','cs2-v1']){
  test('preserve reserved bits and advanced fields while editing '+format,()=>{
    const d=decodeCrosshairCode(sourceByFormat(format).code),b=Buffer.from(d.rawHex,'hex');
    if(format==='legacy-v1'){b[8]|=0x78;b[13]|=1;b[17]=0x91;}
    if(format==='legacy-v3'){b[13]|=0xf0;b[17]=0x92;}
    if(format==='legacy-v4'){b[2]|=32;b[13]|=0xc0;b[17]=0x93;}
    if(format==='cs2-v1'){b[21]|=0xe0;b[31]=0x94;}
    const code=bytesCode(b,d.container),raw=decodeCrosshairCode(code);
    assert.equal(encodeCrosshairCode({format},{sourceCode:code}).code,code);
    const edited=encodeCrosshairCode({format,red:17},{sourceCode:code}),out=decodeCrosshairCode(edited.code),expected=Buffer.from(raw.rawHex,'hex');
    expected[format==='legacy-v1'?4:format==='cs2-v1'?5:3]=17;
    assert.equal(edited.code,bytesCode(expected,d.container));
    assert.equal(out.fields.splitDistance,raw.fields.splitDistance);
    assert.equal(out.fields.innerSplitAlpha,raw.fields.innerSplitAlpha);
  });
}
test('strict encoding refuses missing, unknown, NaN, coerced and out of range fields',()=>{
  const f=sourceByFormat('legacy-v4').fields;
  for(const patch of [{gap:-1},{gap:256},{style:9},{outlineMode:3},{screenHeight:0},{red:'1'},{alpha:NaN},{followRecoil:1},{innerSplitAlpha:.29},{outerSplitAlpha:.31},{splitSizeRatio:.291},{length:1.5}])assert.throws(()=>encodeCrosshairCode({...f,...patch}),CrosshairCodeError);
  assert.throws(()=>encodeCrosshairCode({format:f.format}),error=>error.reason==='fields');
  assert.throws(()=>encodeCrosshairCode({...f,arbitraryScript:'exec evil'}),error=>error.reason==='fields');
});
test('no silent source format conversion or version conflation',()=>{
  const sample=sourceByFormat('legacy-v3');
  assert.throws(()=>encodeCrosshairCode({format:'legacy-v4'},{sourceCode:sample.code}),error=>error.reason==='conversion');
  const mapped=crosshairCodeToEditor(sample.code,DEFAULT_CROSSHAIR);
  assert.equal(mapped.crosshair.version,3);
  const legacy=crosshairCodeToEditor(sourceByFormat('legacy-v1').code,DEFAULT_CROSSHAIR);
  assert.equal(legacy.crosshair.version,2);
  assert.equal(decodeCrosshairCode(legacy.crosshair.shareCodeSource).codeVersion,1);
  assert.throws(()=>editorCrosshairToCode({...mapped.crosshair,version:2}),error=>error.reason==='conversion');
});
test('round trips retain raw invalid fields but editor/application refuse them',()=>{
  const sample=sourceByFormat('cs2-v1'),b=Buffer.from(decodeCrosshairCode(sample.code).rawHex,'hex');
  b[4]=(b[4]&0xe0)|31;b[22]=255;b.writeUInt16LE(1,2);
  const code=bytesCode(b,'cs2'),d=decodeCrosshairCode(code);
  assert.equal(d.fields.style,31);assert.equal(d.fields.scopeDotScale,2.65);assert.equal(d.fields.screenHeight,1);
  assert(d.fieldIssues.includes('style'));assert(d.fieldIssues.includes('scopeDotScale'));
  assert.equal(encodeCrosshairCode(d.fields,{sourceCode:code}).code,code);
  assert.equal(crosshairCodeToEditor(code,DEFAULT_CROSSHAIR).canImport,false);
  assert.throws(()=>crosshairCodeToConVars(code),error=>error.reason==='fields');
  assert.throws(()=>encodeCrosshairCode({red:4},{sourceCode:code}),error=>error.reason==='fields');
});
test('editor keeps source and invisible advanced fields through compatible edits',()=>{
  for(const format of ['legacy-v1','legacy-v3','legacy-v4','cs2-v1']){
    const sample=sourceByFormat(format),result=crosshairCodeToEditor(sample.code,DEFAULT_CROSSHAIR);
    assert.equal(result.canImport,true);
    assert.equal(result.crosshair.shareCodeSource,sample.code);
    assert(result.preservedFields.includes('splitDistance'));
    assert.equal(editorCrosshairToCode(result.crosshair).code,sample.code);
    result.crosshair.dot=!result.crosshair.dot;
    const out=decodeCrosshairCode(editorCrosshairToCode(result.crosshair).code);
    assert.equal(out.fields.centerDotEnabled,!sample.fields.centerDotEnabled);
    assert.equal(out.fields.innerSplitAlpha,sample.fields.innerSplitAlpha);
    if(format==='cs2-v1')assert.equal(out.fields.outlineAlpha,sample.fields.outlineAlpha);
  }
});
test('adapter refuses values wider than current editor instead of cropping',()=>{
  const special=samples.find(s=>s.fields.format==='cs2-v1'&&s.fields.style===9),result=crosshairCodeToEditor(special.code,DEFAULT_CROSSHAIR);
  assert.equal(result.canImport,false);assert(result.unsupportedFields.includes('style'));assert(result.unsupportedFields.includes('gapPixels'));
  assert.equal(result.crosshair.gapPixels,-7);
  assert.equal(encodeCrosshairCode(decodeCrosshairCode(special.code).fields,{sourceCode:special.code}).code,special.code);
});
test('unsourced editor export requires explicit complete extras',()=>{
  assert.throws(()=>editorCrosshairToCode(DEFAULT_CROSSHAIR),error=>error.reason==='fields');
  const extraFields={splitDistance:7,innerSplitAlpha:1,outerSplitAlpha:.3,splitSizeRatio:.3};
  const result=editorCrosshairToCode(DEFAULT_CROSSHAIR,{extraFields}),decoded=decodeCrosshairCode(result.code);
  assert.equal(result.format,'legacy-v4');assert.equal(decoded.fields.splitDistance,7);
  assert.equal(decoded.fields.red,0);assert.equal(decoded.fields.green,255);
  assert(result.warnings.some(w=>w.includes('sniper')));
});
test('v3 refuses half outlines and incompatible fractional quantization',()=>{
  const sample=sourceByFormat('legacy-v3'),mapped=crosshairCodeToEditor(sample.code,DEFAULT_CROSSHAIR).crosshair;
  assert.throws(()=>editorCrosshairToCode({...mapped,outline:true,outlineMode:2}),error=>error.reason==='conversion');
  assert.throws(()=>editorCrosshairToCode(mapped,{extraFields:{innerSplitAlpha:.29}}),error=>error.reason==='fields');
});
test('closed ConVar rendering preserves fields outside editor without arbitrary commands',()=>{
  const modern=sourceByFormat('cs2-v1'),cfg=crosshairCodeToConVars(modern.code);
  assert.match(cfg,/cl_crosshair_dynamic_splitdist "3"/);
  assert.match(cfg,/cl_crosshairoutline_a "255"/);
  assert.match(cfg,/cl_ironsight_dot_scale "1"/);
  assert(cfg.split('\r\n').every(line=>/^cl_[a-z_]+ "-?\d+(?:\.\d+)?"$/.test(line)));
  assert.throws(()=>crosshairCodeToConVars({...modern.fields,length:'1";exec evil'}),error=>error.reason==='fields');
});
