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

test('older appearance records get neutral defaults for new options and reject corrupt values',()=>{
 const older=normalizeInterfaceAppearance({textScale:110,navIndicator:'pill'});
 assert.equal(older.textScale,110);assert.equal(older.navIndicator,'pill');
 assert.equal(older.panelPattern,'none');assert.equal(older.navLayout,'stacked');assert.equal(older.textContrast,'standard');
 const corrupt=normalizeInterfaceAppearance({patternStrength:999,panelPattern:'url(bad)',textContrast:'bad',navLayout:'bad',navIndicator:'bad'});
 assert.equal(corrupt.patternStrength,30);assert.equal(corrupt.panelPattern,'none');assert.equal(corrupt.textContrast,'standard');assert.equal(corrupt.navLayout,'stacked');assert.equal(corrupt.navIndicator,'line');
});
test('panel textures encode a repeating SVG separately from the glow and follow the theme',()=>{
 for(const panelPattern of ['grid','dots','diagonal'])for(const dark of [true,false]){
  const variables=interfaceAppearanceVariables(normalizeInterfaceAppearance({panelPattern,patternStrength:18}),dark,'#00a3a2',false);
  const svg=decodeURIComponent(variables['--personal-pattern-image']);
  assert.match(svg,/patternUnits="userSpaceOnUse"/);assert.match(svg,/opacity="0.18"/);
  assert.ok(svg.includes(`fill="${dark?'white':'black'}"`));
  assert.equal(variables['--panel-glow-image'],undefined,'textures never replace glow settings');
 }
});
test('appearance attributes and variables are removed when the application unmounts',()=>{
 const {applyInterfaceAppearance}=require('./load-ts.cjs')('lib/interface-appearance.ts');
 const attrs=new Map(),styles=new Map();
 const root={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
 const cleanup=applyInterfaceAppearance(root,normalizeInterfaceAppearance({navLayout:'inline',panelPattern:'dots',textContrast:'strong',navIndicator:'halo'}),true,'#00a3a2',false);
 assert.equal(attrs.get('data-personal-layout'),'inline');assert.equal(attrs.get('data-personal-pattern'),'dots');assert.equal(attrs.get('data-personal-nav'),'halo');assert.equal(attrs.get('data-personal-contrast'),'strong');
 cleanup();assert.equal(attrs.size,0);assert.equal(styles.size,0);
});
