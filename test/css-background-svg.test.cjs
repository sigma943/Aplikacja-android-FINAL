const test=require('node:test'),assert=require('node:assert/strict');
const backgroundSvgs=require('./helpers/css-background-svg.cjs');
const {themeDecoration}=require('./load-ts.cjs')('lib/app-theme.ts');
test('heart checks decode only SVG URLs when backgrounds also contain gradient percentages',()=>{
  const hearts=themeDecoration('light-pink');
  const layers=`${hearts}, ${hearts}, radial-gradient(at 20% 0%, #fff 0%, transparent 70%), linear-gradient(transparent, transparent)`;
  assert.throws(()=>decodeURIComponent(layers),URIError);
  const svgs=backgroundSvgs(layers);
  assert.equal(svgs.length,2);
  assert.ok(svgs.every(svg=>svg.includes("fill='#000000'")));
  assert.deepEqual(backgroundSvgs('radial-gradient(at 20% 0%, transparent 70%)'),[]);
});
test('SVG extraction supports CSS URL quoting and preserves encoded percent signs',()=>{
  const svg='<svg><text>100%</text></svg>',encoded='data:image/svg+xml,'+encodeURIComponent(svg);
  for(const url of [`url("${encoded}")`,`url('${encoded}')`,`url(${encoded})`])assert.deepEqual(backgroundSvgs(url),[svg]);
  assert.deepEqual(backgroundSvgs('url("/icon.svg"), none'),[]);
});
