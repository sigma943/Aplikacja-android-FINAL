const test=require('node:test');const assert=require('node:assert/strict');
const {banImageMime,banImageAddress,readBanImage,MAX_BAN_IMAGE_BYTES}=require('./load-ts.cjs')('lib/ban-image.ts');
test('ban images accept common formats and infer Android files with absent MIME',()=>{
 for(const [extension,mime] of Object.entries({GIF:'image/gif',jpg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',svg:'image/svg+xml'}))assert.equal(banImageMime({name:'photo.'+extension,type:'',size:10}),mime);
 assert.throws(()=>banImageMime({name:'huge.gif',type:'image/gif',size:MAX_BAN_IMAGE_BYTES+1}),/HTTPS/);
 assert.throws(()=>banImageMime({name:'not-image.txt',type:'text/plain',size:10}));
 assert.equal(banImageAddress(' https://example.com/animated.gif '),'https://example.com/animated.gif');
 for(const url of ['blob:temporary','javascript:alert(1)','file:///photo.gif'])assert.throws(()=>banImageAddress(url));
});
test('GIF read preserves all bytes and MIME instead of rendering only one frame',async()=>{
 const bytes=Buffer.from('GIF89a-original-animated-frames');const old=global.FileReader;
 global.FileReader=class{readAsDataURL(){this.result='data:application/octet-stream;base64,'+bytes.toString('base64');this.onload();}};
 try{const result=await readBanImage({name:'animated.GIF',type:'application/octet-stream',size:bytes.length});assert.equal(result,'data:image/gif;base64,'+bytes.toString('base64'));}finally{global.FileReader=old;}
});
test('light vehicle headers are opaque and readable; dark headers retain their original colours',()=>{
 const {vehicleHeaderStyle}=require('./load-ts.cjs')('lib/interface-appearance.ts');
 const luminance=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 for(const color of ['#14b8a6','#ff8000','#75c943','#000000','#ffffff'])for(const glass of [true,false]){
 const bg=vehicleHeaderStyle(color,glass,false).background;assert.match(bg,/^#[0-9a-f]{6}$/);assert.ok((luminance(bg)+.05)/(luminance('#172536')+.05)>=7);
 assert.equal(vehicleHeaderStyle(color,glass).background,vehicleHeaderStyle(color,glass,true).background);
 if(!glass)assert.equal(vehicleHeaderStyle(color,glass,true).background,color);
 }
});


test('dark carrier glass is composited once and never depends on scenery behind it',()=>{
 const {vehicleHeaderStyle}=require('./load-ts.cjs')('lib/interface-appearance.ts');
 for(const color of ['#14b8a6','#f97316','#84cc16']){const bg=vehicleHeaderStyle(color,true,true).background;assert.match(bg,/linear-gradient/);assert.doesNotMatch(bg,/rgba|transparent/);assert.equal((bg.match(/#[0-9a-f]{6}/g)||[]).length,2);}
});
