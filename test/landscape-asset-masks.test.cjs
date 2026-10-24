const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// Use Next's current decoder, rather than the older Capacitor asset CLI copy.
const sharp=require(require.resolve('sharp',{paths:[require.resolve('next/package.json')]})),{PNG}=require('pngjs');
const folder='public/themes/mountains/';
test('river and mountain occlusion register to the imported art, including fine tree silhouettes',async()=>{
 const {data,info}=await sharp(folder+'terrain.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=PNG.sync.read(fs.readFileSync(folder+'water-mask.png'));
 assert.equal(info.width,850);assert.equal(info.height,1850);assert.equal(mask.width,850);assert.equal(mask.height,1850);
 let visible=0;const skyline=[];
 for(let x=0;x<850;x++){
  let first=-1;
  for(let y=0;y<1850;y++){
   const i=(y*850+x)*4,a=data[i+3],water=mask.data[i+3];
   if(first<0&&a>160)first=y;
   if(y<1100)assert.equal(water,0,'water cannot occupy sky or mountains');
   else assert.equal(a+water,255,'coverage must complement the actual bank alpha');
   if(water>128)visible++;
  }
  assert.ok(first>740&&first<1100);skyline.push(first/1850);
 }
 assert.ok(visible>150000,'broad river remains visible');
 const horizon=require('../lib/landscape-horizon.json');
 for(let j=0;j<256;j++){const x=j*849/255,i=Math.floor(x),f=x-i;assert.ok(Math.abs(horizon[j]-(skyline[i]+(skyline[Math.min(849,i+1)]-skyline[i])*f))<1e-9,'light occlusion matches the new mountain ridge');}
});
test('clouds stay in the sky and the lunar texture remains a small transparent asset',async()=>{
 const {data,info}=await sharp(folder+'clouds.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,850);assert.equal(info.height,1850);
 for(let i=1100*850*4+3;i<data.length;i+=4)assert.ok(data[i]<=1,'only an alpha quantization residual is allowed below the sky');
 const moon=await sharp(folder+'moon.webp').metadata();assert.equal(moon.width,256);assert.equal(moon.height,256);assert.equal(moon.hasAlpha,true);
});
