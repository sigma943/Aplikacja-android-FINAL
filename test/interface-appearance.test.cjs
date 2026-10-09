const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeInterfaceAppearance,interfaceAppearanceVariables,DEFAULT_INTERFACE_APPEARANCE}=require('./load-ts.cjs')('lib/interface-appearance.ts');
test('damaged saved personalization cannot make panels unreadable or inject CSS',()=>{
 const value=normalizeInterfaceAppearance({glassOpacity:-100,textScale:800,iconSize:0,panelRadius:Infinity,glowColor:'url(javascript:bad)',fontFamily:'bad',navLabels:'false',density:'unknown',shadowStrength:NaN});
 assert.equal(value.glassOpacity,20);assert.equal(value.textScale,120);assert.equal(value.iconSize,18);
 assert.equal(value.panelRadius,24);assert.equal(value.fontFamily,'system');assert.equal(value.density,'comfortable');assert.equal(value.navLabels,true);assert.match(value.glowColor,/^#[0-9a-f]{6}$/i);
 assert.equal(normalizeInterfaceAppearance(null).panelRadius,DEFAULT_INTERFACE_APPEARANCE.panelRadius);
});
test('lighter effects cap expensive blur and shadow while retaining selected transparency and text size',()=>{
 const value=normalizeInterfaceAppearance({glassBlur:28,shadowStrength:100,glassOpacity:35,textScale:115});
 const vars=interfaceAppearanceVariables(value,true,'#3b82f6',true);
 assert.equal(vars['--personal-blur'],'6px');assert.match(vars['--personal-glass'],/,0.35\)$/);assert.equal(vars['--personal-text-base'],'18.4px');
 assert.equal(value.glassBlur,28,'performance mode does not overwrite the chosen setting');
});
