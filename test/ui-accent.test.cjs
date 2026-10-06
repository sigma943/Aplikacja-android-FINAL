const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {uiAccentVariables,normalizeUiAccent}=loadTs('lib/ui-accent.ts');
function luminance(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
test('every accent offers readable solid-button labels in light and dark themes',()=>{
 for(const accent of ['#00A3A2','#3b82f6','#8b5cf6','#f43f5e','#f59e0b','#767676','#000000','#ffffff']){
  for(const dark of [true,false]){
   const vars=uiAccentVariables(accent,dark),a=luminance(vars['--pks-accent']),b=luminance(vars['--pks-accent-on']);
   assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,accent);
   assert.equal(vars['--pks-accent'],accent.toLowerCase());
   const text=luminance(vars['--pks-accent-text']),background=luminance(dark?'#111c25':'#ffffff');
   assert.ok((Math.max(text,background)+.05)/(Math.min(text,background)+.05)>=5,accent+' text');
   assert.match(vars['--pks-accent-soft'],/^#[0-9a-f]{8}$/);
  }
 }
});
test('invalid stored accents fall back safely and theme text tones adapt without changing the selected colour',()=>{
 for(const value of ['', 'red', '#123', '#gggggg', '#123456; background: red'])assert.equal(normalizeUiAccent(value),'#00a3a2');
 const light=uiAccentVariables('#3b82f6',false),dark=uiAccentVariables('#3b82f6',true);
 assert.equal(light['--pks-accent'],dark['--pks-accent']);
 assert.notEqual(light['--pks-accent-text'],dark['--pks-accent-text']);
});
