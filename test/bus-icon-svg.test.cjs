const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {busFrontSvg}=loadTs('lib/bus-icon-svg.ts');
test('shared bus artwork preserves the compact map geometry and optional selection highlight',()=>{
 const svg=busFrontSvg('108','#14b8a6');
 assert.match(svg,/viewBox="0 0 34 48"/);assert.match(svg,/>108<\/text>/);assert.match(svg,/fill="#14b8a6"/);
 assert.equal((svg.match(/<circle/g)||[]).length,2);
 assert.ok(busFrontSvg('M','#68c44a',true).includes('fill-opacity=".2"'));
});
test('route labels and stored colours cannot inject markup into Leaflet SVG',()=>{
 const svg=busFrontSvg('<img onerror="alert(1)">', 'red" onload="alert(1)');
 assert.ok(!svg.includes('<img'));assert.ok(!svg.includes('onload="'));assert.ok(svg.includes('&lt;img'));
 assert.ok(svg.includes('fill="#14b8a6"'));
});
