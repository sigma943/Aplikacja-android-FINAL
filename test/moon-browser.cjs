const assert=require('node:assert/strict'),fs=require('node:fs'),puppeteer=require('puppeteer');
const load=require('./load-ts.cjs');
(async()=>{
 let browser;
 try{
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();await page.setViewport({width:840,height:480,deviceScaleFactor:1});
  const paint=load('lib/landscape-renderer.ts').LandscapeRenderer.prototype.moon.toString();
  await page.addScriptTag({content:`window.paintMoon=({${paint}}).moon;`});
  const result=await page.evaluate(()=>{
   const texture=document.createElement('canvas');texture.width=texture.height=128;
   const t=texture.getContext('2d');t.fillStyle='#fff';t.fillRect(0,0,128,128);t.fillStyle='#0055ff';t.fillRect(32,24,24,24);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=144;const c=canvas.getContext('2d');
   const draw=(fraction,angle,parallacticAngle=0)=>{c.clearRect(0,0,144,144);window.paintMoon.call({lunarTexture:texture},c,{illumination:{fraction,angle},moon:{parallacticAngle}},72,72,64);return c.getImageData(0,0,144,144).data;};
   const cases=[];
   for(const fraction of [0,.05,.25,.5,.75,.95,1])for(const angle of [-Math.PI/2,Math.PI/2]){
    const data=draw(fraction,angle);let area=0,xsum=0;
    for(let y=0;y<144;y++)for(let x=0;x<144;x++){const alpha=data[(y*144+x)*4+3]/255;area+=alpha;xsum+=alpha*(x+.5-72);}
    cases.push({fraction,angle,coverage:area/(Math.PI*64*64),cx:area?xsum/area:0});
   }
   // A full Moon's surface cannot flip when the bright-limb angle changes.
   const a=draw(1,-1.3).slice(),b=draw(1,1.7).slice();let difference=0;
   for(let y=32;y<112;y++)for(let x=32;x<112;x++)for(let k=0;k<4;k++)difference=Math.max(difference,Math.abs(a[(y*144+x)*4+k]-b[(y*144+x)*4+k]));
   // The illuminated hemisphere still follows the true local zenith angle.
   const tilted=draw(.5,-Math.PI/2,Math.PI/2);let top=0,bottom=0;
   for(let y=0;y<144;y++)for(let x=0;x<144;x++)(y<72?top+=tilted[(y*144+x)*4+3]:bottom+=tilted[(y*144+x)*4+3]);
   return {cases,difference,top,bottom};
  });
  for(const row of result.cases){assert.ok(Math.abs(row.coverage-row.fraction)<.008,JSON.stringify(row));if(row.fraction>0&&row.fraction<1)assert.ok(row.angle<0?row.cx>0:row.cx<0,'waxing right, waning left at zero parallactic angle');}
  assert.equal(result.difference,0,'texture north is independent of the phase angle');assert.ok(result.bottom>result.top*20,'parallactic tilt is retained');
  const asset='data:image/webp;base64,'+fs.readFileSync('public/themes/mountains/moon.webp').toString('base64');
  await page.evaluate(async asset=>{
   document.body.style.cssText='margin:0;background:#061329;color:#e9edf5;font:16px sans-serif';
   const image=new Image();image.src=asset;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=840;canvas.height=480;document.body.append(canvas);const c=canvas.getContext('2d');
   const phases=[['Nów',0,-Math.PI/2],['Sierp przybywający',.15,-Math.PI/2],['Pierwsza kwadra',.5,-Math.PI/2],['Przed pełnią',.85,-Math.PI/2],['Pełnia',1,Math.PI/2],['Po pełni',.85,Math.PI/2],['Ostatnia kwadra',.5,Math.PI/2],['Sierp ubywający',.15,Math.PI/2]];
   phases.forEach(([label,fraction,angle],i)=>{const x=105+(i%4)*210,y=100+Math.floor(i/4)*230;window.paintMoon.call({lunarTexture:image},c,{illumination:{fraction,angle},moon:{parallacticAngle:0}},x,y,62);c.fillStyle='#e9edf5';c.textAlign='center';c.font='16px sans-serif';c.fillText(label,x,y+91);});
  },asset);
  fs.mkdirSync('test/ui-previews',{recursive:true});await page.screenshot({path:'test/ui-previews/moon-phases.png'});
  console.log('PASS: phase coverage, transparent unlit side/new Moon, waxing/waning sides, stable texture and observer tilt');
 }finally{await browser?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
