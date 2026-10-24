// Real WebGL2 shader compilation/pixels, independently of the application fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),ts=require('typescript'),puppeteer=require('puppeteer');
(async()=>{
 let browser;const server=http.createServer((req,res)=>{
  const name=path.basename(req.url);if(!['water-mask.png','terrain.webp'].includes(name)){res.end('<!doctype html>');return;}
  res.end(fs.readFileSync(path.join('public/themes/mountains',name)));
 });
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const js=ts.transpileModule(fs.readFileSync('lib/landscape-water-gpu.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  await page.addScriptTag({content:'var exports={};'+js+';window.WaterGPU=exports.LandscapeWaterGPU;'});
  const result=await page.evaluate(async()=>{
   const image=name=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src='/'+name;});
   const gpu=window.gpu=new window.WaterGPU();gpu.setAssets({water:await image('water-mask.png'),terrain:await image('terrain.webp')});
   const frame={width:425,height:925,scale:.425,x:0,y:0};
   const light={time:0,sky:{day:.6,twilight:1},sun:{x:.52,y:.5,altitude:.08,intensity:.7,color:[1,.7,.3]},moon:{x:.7,y:.3,altitude:.5,illumination:1,intensity:0,color:[.67,.81,1]}};
   const copy=()=>{const c=document.createElement('canvas');c.width=gpu.canvas.width;c.height=gpu.canvas.height;c.getContext('2d').drawImage(gpu.canvas,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
   const ok=gpu.render(light,frame,'high'),before=copy();light.time=4;gpu.render(light,frame,'high');const after=copy();
   let changed=0,opaque=0,skyAlpha=0;for(let i=0;i<after.length;i+=4){if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>2)changed++;if(after[i+3]>128)opaque++;if(i/4<gpu.canvas.width*gpu.canvas.height*.55)skyAlpha+=after[i+3];}
   const gl=gpu.canvas.getContext('webgl2'),error=gl.getError(),extension=gl.getExtension('WEBGL_lose_context');
   window.gpuFrame=frame;window.gpuLight=light;window.gpuCopy=copy;window.gpuLossExtension=extension;
   return {ok,changed,opaque,skyAlpha,error,diagnostics:gpu.diagnostics(),canLose:!!extension};
  });
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.error,0);assert.ok(result.changed>500);assert.ok(result.opaque>500);assert.equal(result.skyAlpha,0);assert.ok(result.diagnostics.pixels<=360000);
  // Test every pixel against the actual water mask, not a rectangular bounding box.
  const outside=await page.evaluate(async()=>{
   const gpu=window.gpu,c=document.createElement('canvas');c.width=gpu.canvas.width;c.height=gpu.canvas.height;
   const image=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src='/water-mask.png';});c.getContext('2d').drawImage(image,0,0,c.width,c.height);
   const mask=c.getContext('2d').getImageData(0,0,c.width,c.height).data,pixels=window.gpuCopy();let escaped=0;
   for(let i=3;i<pixels.length;i+=4)if(mask[i]===0&&pixels[i]>20)escaped++;return escaped;
  });assert.equal(outside,0,'GPU light cannot reach opaque land');
  if(result.canLose){
   await page.evaluate(()=>window.gpuLossExtension.loseContext());
   await page.waitForFunction(()=>window.gpu.diagnostics().lost);
   assert.equal(await page.evaluate(()=>window.gpu.render(window.gpuLight,window.gpuFrame,'low')),false);
   await page.evaluate(()=>window.gpuLossExtension.restoreContext());
   await page.waitForFunction(()=>!window.gpu.diagnostics().lost);
   assert.equal(await page.evaluate(()=>window.gpu.render(window.gpuLight,window.gpuFrame,'medium')),true);
  }
  await page.evaluate(()=>window.gpu.suspend());
  assert.equal(await page.evaluate(()=>window.gpu.canvas.width),1);
  assert.equal(await page.evaluate(()=>window.gpu.render(window.gpuLight,window.gpuFrame,'low')),true);
  assert.ok(await page.evaluate(()=>window.gpu.diagnostics().pixels<=110000));
  await page.evaluate(()=>window.gpu.dispose());
  assert.equal(await page.evaluate(()=>window.gpu.render(window.gpuLight,window.gpuFrame,'low')),false);
  assert.equal(await page.evaluate(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:original.call(this,kind,...args);};
   try{const fallback=new window.WaterGPU();const ok=fallback.render(window.gpuLight,window.gpuFrame,'low');fallback.dispose();return ok;}finally{HTMLCanvasElement.prototype.getContext=original;}
  }),false,'missing WebGL2 selects the existing fallback');
  console.log('PASS: GLSL ES 3.00, moving water, precise mask, quality budgets, context loss/restoration, suspend/resume/disposal.',result);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
