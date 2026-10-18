const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {parseHexColor,parseRgbColor,hexHsv,hsvHex}=load('lib/color-input.ts');
const {parseGoogleFontInput,parseGoogleFontLink,INTERFACE_FONTS,interfaceFontStack}=load('lib/interface-fonts.ts');
const {normalizeInterfaceAppearance,interfaceAppearanceVariables}=load('lib/interface-appearance.ts');
test('manual HEX/RGB colours accept shorthand and reject invalid or out-of-range input',()=>{
  assert.equal(parseHexColor('#AbC'),'#aabbcc');assert.equal(parseHexColor('38BDF8'),'#38bdf8');
  for(const value of ['#abcd','transparent','#gggggg','#ffffff00','url(red)'])assert.equal(parseHexColor(value),null);
  assert.equal(parseRgbColor('rgb(56, 189, 248)'),'#38bdf8');assert.equal(parseRgbColor('56 189 248'),'#38bdf8');assert.equal(parseRgbColor('0, 0, 0'),'#000000');
  for(const value of ['256, 0, 0','-1, 0, 0','0, 0','0, 0, 0, 1','1.2, 2, 3','rgb(1, 2, 3);color:red'])assert.equal(parseRgbColor(value),null);
  for(const color of ['#000000','#ffffff','#38bdf8','#ff0000','#b6a3ff','#00a3a2'])assert.equal(hsvHex(...hexHsv(color)),color);
});
test('Google Font specimen and CSS links normalize to a single safe family request',()=>{
  for(const link of ['https://fonts.google.com/specimen/Source+Sans+3','https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;700&display=swap','https://fonts.googleapis.com/css?family=Source+Sans+3']){
    assert.deepEqual(parseGoogleFontLink(link),{family:'Source Sans 3',url:'https://fonts.googleapis.com/css2?family=Source+Sans+3&display=swap'});
  }
  for(const link of ['http://fonts.google.com/specimen/Inter','https://fonts.google.com.evil.test/specimen/Inter','https://evil.test/font.css','https://fonts.google.com/specimen/Inter%22%3Bcolor%3Ared','https://fonts.googleapis.com/css2?family=Inter&family=Roboto','https://user@fonts.google.com/specimen/Inter','https://fonts.google.com:444/specimen/Inter'])assert.equal(parseGoogleFontLink(link),null);
});
test('built-in and custom fonts survive saved appearance/profile normalization without changing other options',()=>{
  assert.ok(INTERFACE_FONTS.length>=16);
  for(const {id}of INTERFACE_FONTS)assert.equal(normalizeInterfaceAppearance({fontFamily:id}).fontFamily,id);
  const saved=normalizeInterfaceAppearance({fontFamily:'custom',customFontUrl:'https://fonts.google.com/specimen/Nunito',glassOpacity:51,textScale:110});
  const restored=normalizeInterfaceAppearance(JSON.parse(JSON.stringify(saved)));assert.deepEqual(saved,restored);
  assert.equal(restored.glassOpacity,51);assert.equal(restored.textScale,110);
  assert.equal(interfaceAppearanceVariables(restored,true,'#123456',false)['--personal-font'],'"Nunito", system-ui, sans-serif');
  assert.equal(normalizeInterfaceAppearance({fontFamily:'custom',customFontUrl:'bad'}).fontFamily,'system');
  assert.equal(interfaceFontStack(normalizeInterfaceAppearance(null)),'system-ui, sans-serif');
});

test('Google font loader requests only the selected family and confirms loaded glyphs',async()=>{
  const previous=global.document,links=[];
  global.document={createElement:()=>({dataset:{},remove(){this.removed=true;}}),head:{appendChild(link){links.push(link);queueMicrotask(()=>link.onload());}},fonts:{load:async(css,text)=>{assert.ok(css.includes('Inter'));assert.ok(text.includes('Zażółć'));return [{}];}}};
  try{const {loadInterfaceGoogleFont}=load('lib/interface-fonts.ts');await loadInterfaceGoogleFont('Inter');await loadInterfaceGoogleFont('Inter');assert.equal(links.length,1);assert.equal(links[0].href,'https://fonts.googleapis.com/css2?family=Inter&display=swap');}
  finally{global.document=previous;}
});

test('copied Google Fonts link and import blocks offer every distinct family, ignoring preconnects',()=>{
  const address='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=Space+Grotesk:wght@300..700&display=swap';
  const expected=['Plus Jakarta Sans','Space Grotesk'];
  for(const input of [address,`<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${address.replaceAll('&','&amp;')}" rel="stylesheet">`,`<style>@import url('${address}');</style>`,`@import "${address}";`,`@import url(${address});`])assert.deepEqual(parseGoogleFontInput(input).map(font=>font.family),expected);
  assert.equal(parseGoogleFontLink(address),null,'persist only the explicitly chosen single family');
  assert.deepEqual(parseGoogleFontInput('https://fonts.googleapis.com/css?family=Inter|Roboto:400,700').map(font=>font.family),['Inter','Roboto']);
  assert.deepEqual(parseGoogleFontInput('<script>alert(1)</script><link href="https://evil.test/font.css">'),[]);
});
test('font download failures stay short, reject empty faces and can be retried',async()=>{
  const previous=global.document;let mode='error',removed=0;
  global.document={createElement:()=>({dataset:{},remove(){removed++;}}),head:{appendChild(link){queueMicrotask(()=>mode==='error'?link.onerror():link.onload());}},fonts:{load:async()=>mode==='empty'?[]:[{}]}};
  try{
    const {loadInterfaceGoogleFont}=load('lib/interface-fonts.ts');
    await assert.rejects(loadInterfaceGoogleFont('Space Grotesk'),/Nie udało się pobrać czcionki\./);
    mode='empty';await assert.rejects(loadInterfaceGoogleFont('Space Grotesk'),/Nie znaleziono czcionki\./);
    mode='success';await loadInterfaceGoogleFont('Space Grotesk');assert.equal(removed,2);
  }finally{global.document=previous;}
});
