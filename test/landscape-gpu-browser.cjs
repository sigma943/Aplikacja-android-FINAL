// Real WebGL2 shader compilation/pixels, independently of the application fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),ts=require('typescript'),puppeteer=require('puppeteer');
(async()=>{
 let browser;const server=http.createServer((req,res)=>{
  const name=path.basename(req.url);if(!['water-mask.png','terrain.webp','water-uv.png','water-perspective.png','clouds.webp','scene-depth.png','terrain-normal.png'].includes(name)){res.end('<!doctype html>');return;}
  res.end(fs.readFileSync(path.join('public/themes/mountains',name)));
 });
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const files=['landscape-celestial','landscape-scene-geometry','landscape-scene-gpu','landscape-water-shaders','landscape-water-gpu'];
  const modules=Object.fromEntries(files.map(f=>['./'+f,transpile('lib/'+f+'.ts')]));
  const data=Object.fromEntries(['landscape-water-calibration','landscape-water-spectrum','landscape-horizon'].map(f=>['./'+f+'.json',JSON.parse(fs.readFileSync('lib/'+f+'.json','utf8'))]));
  await page.addScriptTag({content:`(()=>{const sources=${JSON.stringify(modules)},data=${JSON.stringify(data)},cache={};function require(name){if(data[name])return data[name];if(cache[name])return cache[name];if(!sources[name])throw Error(name);const out=cache[name]={};new Function('exports','require',sources[name])(out,require);return out;}window.WaterGPU=require('./landscape-water-gpu').LandscapeWaterGPU;window.paintSun=require('./landscape-celestial').paintSun;})();`});
  const result=await page.evaluate(async()=>{
   const image=name=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src='/'+name;});
   const gpu=window.gpu=new window.WaterGPU();gpu.setAssets({water:await image('water-mask.png'),terrain:await image('terrain.webp'),geometry:await image('water-uv.png'),perspective:await image('water-perspective.png'),clouds:await image('clouds.webp'),sceneDepth:await image('scene-depth.png'),terrainNormal:await image('terrain-normal.png')});
   const frame={width:425,height:925,scale:.425,x:0,y:0};
   const light={time:0,sky:{day:.6,twilight:1},sun:{x:.52,y:.5,altitude:.08,intensity:.7,color:[1,.7,.3]},moon:{x:.7,y:.3,altitude:.5,illumination:1,intensity:0,color:[.67,.81,1]}};
   const copy=()=>{const c=document.createElement('canvas');c.width=gpu.canvas.width;c.height=gpu.canvas.height;c.getContext('2d').drawImage(gpu.canvas,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
   const ok=gpu.render(light,frame,'high'),before=copy();light.time=4;gpu.render(light,frame,'high');const after=copy();
   const land=document.createElement('canvas');land.width=gpu.canvas.width;land.height=gpu.canvas.height;const lc=land.getContext('2d');lc.drawImage(gpu.assets.terrain,0,0,land.width,land.height);const landPixels=lc.getImageData(0,0,land.width,land.height).data;lc.clearRect(0,0,land.width,land.height);lc.drawImage(gpu.assets.water,0,0,land.width,land.height);const waterPixels=lc.getImageData(0,0,land.width,land.height).data;
   let changed=0,opaque=0,skyAlpha=0,skyPixels=0;for(let i=0;i<after.length;i+=4){if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>2)changed++;if(after[i+3]>128)opaque++;if(i/4<gpu.canvas.width*gpu.canvas.height*.55&&landPixels[i+3]<5&&waterPixels[i+3]<5){skyAlpha+=after[i+3];skyPixels++;}}
   const gl=gpu.canvas.getContext('webgl2'),error=gl.getError(),extension=gl.getExtension('WEBGL_lose_context');
   window.gpuFrame=frame;window.gpuLight=light;window.gpuCopy=copy;window.gpuLossExtension=extension;
   return {ok,changed,opaque,skyAlpha,skyPixels,error,diagnostics:gpu.diagnostics(),canLose:!!extension};
  });
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.error,0);assert.ok(result.changed>500);assert.ok(result.opaque>500);assert.ok(result.skyAlpha<result.skyPixels*255*.08,'god rays remain a subtle background effect');assert.equal(result.diagnostics.drawCalls,12);assert.equal(result.diagnostics.scene3D,true);assert.ok(result.diagnostics.sceneVertices>20000);assert.ok(result.diagnostics.treeInstances>100);assert.ok(result.diagnostics.reflectionUpdates>0);assert.ok(result.diagnostics.vertices>3000);assert.ok(result.diagnostics.pixels<=2400000);
  const optimized=await page.evaluate(reference=>{
   const gpu=window.gpu,gl=gpu.canvas.getContext('webgl2'),configure=gpu.configure;
   const referenceConfigure=new Function('return ('+reference+')')();
   const methods=['uniform1f','uniform2f','uniform3f','uniform4f','uniform3fv','activeTexture','bindTexture'];
   const originals=Object.fromEntries(methods.map(name=>[name,gl[name]]));let calls=0;
   for(const name of methods)gl[name]=function(...args){calls++;return originals[name].apply(this,args);};
   const rows=[];
   try{
    for(const quality of ['high','medium','low']){
     gpu.configure=referenceConfigure;gpu.bindingsDirty=true;gpu.render({...window.gpuLight,time:0},window.gpuFrame,quality);
     calls=0;const referencePixels=[];
     for(const time of [0,.1,.2]){gpu.bindingsDirty=true;gpu.render({...window.gpuLight,time},window.gpuFrame,quality);referencePixels.push(window.gpuCopy());}
     const referenceCalls=calls;
     gpu.configure=configure;for(const p of gpu.programs)p.values.clear();gpu.bindingsDirty=true;
     gpu.render({...window.gpuLight,time:0},window.gpuFrame,quality);
     calls=0;let difference=0;const restores=gpu.diagnostics().textureRestores;
     for(const [i,time] of [0,.1,.2].entries()){
      gpu.render({...window.gpuLight,time},window.gpuFrame,quality);const pixels=window.gpuCopy();
      for(let j=0;j<pixels.length;j++)difference=Math.max(difference,Math.abs(pixels[j]-referencePixels[i][j]));
     }
     rows.push({quality,referenceCalls,optimizedCalls:calls,difference,restores:gpu.diagnostics().textureRestores-restores,depthPixels:gpu.diagnostics().depthBufferPixels,reflectionPixels:gpu.diagnostics().reflectionPixels});
    }
   }finally{gpu.configure=configure;for(const name of methods)gl[name]=originals[name];}
   for(const p of gpu.programs)p.values.clear();gpu.bindingsDirty=true;gpu.render(window.gpuLight,window.gpuFrame,'high');
   return rows;
  },require('./landscape-gpu-reference.cjs').toString());
  for(const row of optimized){
   assert.equal(row.difference,0,'optimization preserves every rendered pixel: '+JSON.stringify(row));
   assert.ok(row.optimizedCalls<row.referenceCalls*.85,'driver dispatch work must materially decrease: '+JSON.stringify(row));
   assert.equal(row.restores,0,'animation retains its existing texture bindings');
   assert.equal(row.depthPixels,row.reflectionPixels,'only the actual 3D mirror needs a depth buffer');
  }
  console.log('Pixel-identical GPU optimization:',optimized);
  const wind=await page.evaluate(()=>{
   const gpu=window.gpu,gl=gpu.canvas.getContext('webgl2'),p=gpu.programs[2];
   // Keep water, shafts and relighting cached: isolate the presentation wind.
   const at=time=>{gl.useProgram(p.program);gl.uniform1f(gl.getUniformLocation(p.program,'uTime'),time);gl.drawArrays(gl.TRIANGLES,0,3);return window.gpuCopy();};
   const a=at(0),b=at(2.1),same=at(2.1),w=gpu.canvas.width,h=gpu.canvas.height;
   let moved=0,peaks=0,banks=0,alpha=0,frozen=0,visible=0,coverage=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,delta=Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])));
    if(delta>2)moved++;if(delta>12)visible++;if(x<w*.2&&y>h*.48&&y<h*.90&&a[i+3]>250&&b[i+3]<200)coverage++;if(y<h*.405)peaks=Math.max(peaks,delta);
    if(y>h*.48&&y<h*.78&&x>w*.32&&x<w*.84)banks=Math.max(banks,delta);
    alpha=Math.max(alpha,Math.abs(a[i+3]-b[i+3]));
    for(let c=0;c<4;c++)frozen=Math.max(frozen,Math.abs(same[i+c]-b[i+c]));
   }
   const landmarks={};
   for(const [name,[x0,y0,x1,y1]] of Object.entries({rocks:[100,680,130,694],lowerConifers:[150,840,175,872],rightConifers:[380,800,393,811],leftForest:[45,492,75,517]})){
    let max=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4;for(let c=0;c<4;c++)max=Math.max(max,Math.abs(a[i+c]-b[i+c]));}landmarks[name]=max;
   }
   return {moved,visible,coverage,peaks,banks,alpha,frozen,landmarks,error:gl.getError()};
  });
  assert.ok(wind.moved>1000,'foreground foliage moves visibly');
  for(const [name,delta] of Object.entries(wind.landmarks))assert.equal(delta,0,'wind must not move '+name);
  assert.equal(wind.peaks,0,'wind leaves mountains and sky fixed');assert.equal(wind.banks,0,'wind leaves distant shores fixed');
  assert.ok(wind.visible>5000,'branch movement must remain visible at phone resolution');
  assert.equal(wind.coverage,0,'moving leaves must be backed by the assembled river, with no ghost fallback exposed');
  assert.equal(wind.frozen,0,'frozen animation clock retains the same foliage');assert.equal(wind.error,0);
  console.log('Foreground wind pixels:',wind);
  const material=await page.evaluate(()=>{
   const gpu=window.gpu,light=window.gpuLight,gl=gpu.canvas.getContext('webgl2');
   const measure=()=>{const t=gpu.targets[2],p=new Uint8Array(t.width*t.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.readPixels(0,0,t.width,t.height,gl.RGBA,gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let sum=0,n=0;for(let i=0;i<p.length;i+=4)if(p[i+3]>240){sum+=p[i]+p[i+1]+p[i+2];n++;}return sum/Math.max(n,1);};
   const before=gpu.diagnostics().terrainRelights,day=measure();light.time+=.1;gpu.render(light,window.gpuFrame,'high');const same=gpu.diagnostics().terrainRelights;
   const saved={day:light.sky.day,warm:light.sky.twilight,sun:light.sun.intensity};light.sky.day=0;light.sky.twilight=0;light.sun.intensity=0;gpu.render(light,window.gpuFrame,'high');const night=measure();
   light.sky.day=saved.day;light.sky.twilight=saved.warm;light.sun.intensity=saved.sun;gpu.render(light,window.gpuFrame,'high');
   return {before,same,day,night,pixels:gpu.diagnostics().presentationPixels};
  });
  assert.ok(material.before>0);assert.equal(material.same,material.before,'wave time alone never rerenders the terrain material');assert.ok(material.day>material.night*1.15,'the material responds to solar lighting');assert.equal(material.pixels,425*925,'presentation remains sharp independently of water resolution');
  const coverage=await page.evaluate(()=>{
   const gpu=window.gpu,gl=gpu.canvas.getContext('webgl2'),scene=gpu.solid,draw=scene.draw;
   const alpha=()=>{const t=gpu.targets[2],p=new Uint8Array(t.width*t.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.readPixels(0,0,t.width,t.height,gl.RGBA,gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return p;};
   const geometry=alpha();let baseline;
   try{scene.draw=()=>{};gpu.terrainKey='';gpu.render(window.gpuLight,window.gpuFrame,'high');baseline=alpha();}finally{scene.draw=draw;gpu.terrainKey='';gpu.render(window.gpuLight,window.gpuFrame,'high');}
   let colorDifference=0;for(let i=0;i<geometry.length;i++)if(i%4!==3)colorDifference=Math.max(colorDifference,Math.abs(geometry[i]-baseline[i]));
   let excess=0,difference=0;for(let i=3;i<geometry.length;i+=4){excess=Math.max(excess,geometry[i]-baseline[i]);difference=Math.max(difference,Math.abs(geometry[i]-baseline[i]));}return {excess,difference,colorDifference,error:gl.getError()};
  });
  assert.equal(coverage.colorDifference,0,'the registered main-view material cannot acquire proxy-tree silhouettes or terrain lighting triangles');
  assert.equal(coverage.error,0);assert.equal(coverage.excess,0,'3D material passes cannot grow opaque fringes around the river or tree silhouettes');assert.equal(coverage.difference,0,'the main scene preserves the authored coverage mask');
  const spatial=await page.evaluate(()=>{
   const gpu=window.gpu,light=window.gpuLight,gl=gpu.canvas.getContext('webgl2'),p=gpu.programs[4];
   const reflection=()=>{const t=gpu.targets[3],pixels=gpu.diagnostics().hdr?new Float32Array(t.width*t.height*4):new Uint8Array(t.width*t.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.readPixels(0,0,t.width,t.height,gl.RGBA,gpu.diagnostics().hdr?gl.FLOAT:gl.UNSIGNED_BYTE,pixels);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return pixels;};
   const before=reflection(),updates=gpu.diagnostics().reflectionUpdates;
   light.time+=.1;gpu.render(light,window.gpuFrame,'high');const cached=gpu.diagnostics().reflectionUpdates;
   gl.useProgram(p.program);gl.uniform3f(gl.getUniformLocation(p.program,'uCameraOffset'),7,4,-5);gl.uniform1f(gl.getUniformLocation(p.program,'uDebug'),1);gpu.terrainKey='';gpu.render(light,window.gpuFrame,'high');
   const after=reflection();let changed=0,covered=0;for(let i=0;i<before.length;i+=4){if(before[i+3]>.5)covered++;if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>.02)changed++;}
   const c=document.createElement('canvas');c.width=gpu.canvas.width;c.height=gpu.canvas.height;c.getContext('2d').drawImage(gpu.canvas,0,0);const oblique=c.toDataURL('image/png').split(',')[1];
   gl.useProgram(p.program);gl.uniform3f(gl.getUniformLocation(p.program,'uCameraOffset'),0,0,0);gl.uniform1f(gl.getUniformLocation(p.program,'uDebug'),0);gpu.terrainKey='';gpu.render(light,window.gpuFrame,'high');
   return {covered,changed,updates,cached,oblique,error:gl.getError()};
  });
  assert.equal(spatial.error,0);assert.ok(spatial.covered>1000,'the mirror target contains actual opaque scene geometry');assert.ok(spatial.changed>1000,'a translated camera produces geometry parallax in the reflection');assert.equal(spatial.cached,spatial.updates,'wave time does not redraw the stationary scene');
  fs.mkdirSync('test/ui-previews',{recursive:true});fs.writeFileSync('test/ui-previews/landscape-scene-oblique.png',Buffer.from(spatial.oblique,'base64'));
  // A lit river needs a coloured reflection area, a finite HDR halo and a dark
  // source-free night. These measure output pixels, not shader source strings.
  const filmic=await page.evaluate(()=>{
   const gpu=window.gpu,gl=gpu.canvas.getContext('webgl2'),original=window.gpuLight;
   const light={...original,sky:{...original.sky,day:.45,twilight:1},sun:{...original.sun,x:.5,y:.39,altitude:.06,intensity:.8,color:[1,.66,.45]},moon:{...original.moon,intensity:0}};
   const buffer=()=>{const t=gpu.bloomUp[0],hdr=gpu.diagnostics().hdr,p=hdr?new Float32Array(t.width*t.height*4):new Uint8Array(t.width*t.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.framebuffer);gl.readPixels(0,0,t.width,t.height,gl.RGBA,hdr?gl.FLOAT:gl.UNSIGNED_BYTE,p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return hdr?p:Float32Array.from(p,v=>v/255);};
   gpu.render(light,window.gpuFrame,'high');const pixels=window.gpuCopy(),halo=buffer();
   const c=document.createElement('canvas');c.width=gpu.canvas.width;c.height=gpu.canvas.height;const ctx=c.getContext('2d');ctx.drawImage(gpu.assets.water,0,0,c.width,c.height);const mask=ctx.getImageData(0,0,c.width,c.height).data;
   let water=0,warm=0,white=0,energy=0,finite=true;
   for(let i=0;i<pixels.length;i+=4)if(mask[i+3]>220){water++;const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r>70&&r>g*1.08&&g>b*1.15)warm++;if(Math.min(r,g,b)>230)white++;}
   for(let i=0;i<halo.length;i+=4){finite&&=Number.isFinite(halo[i]+halo[i+1]+halo[i+2]);energy+=halo[i]+halo[i+1]+halo[i+2];}
   gpu.render({...light,sun:{...light.sun,y:.20}},window.gpuFrame,'high');const moved=window.gpuCopy();let relocated=0;for(let i=0;i<pixels.length;i+=4)if(mask[i+3]>220&&Math.abs(pixels[i]-moved[i])+Math.abs(pixels[i+1]-moved[i+1])+Math.abs(pixels[i+2]-moved[i+2])>12)relocated++;
   light.sun.intensity=0;light.moon.intensity=0;light.sky.day=0;light.sky.twilight=0;gpu.render(light,window.gpuFrame,'high');const dark=buffer();let nightEnergy=0;for(let i=0;i<dark.length;i+=4)nightEnergy+=dark[i]+dark[i+1]+dark[i+2];
   gpu.render(original,window.gpuFrame,'high');return {water,warm,white,energy,finite,relocated,nightEnergy,error:gl.getError()};
  });
  assert.equal(filmic.error,0);assert.equal(filmic.finite,true,'HDR bloom never contains NaN/Infinity');
  assert.ok(filmic.warm>filmic.water*.025,'warm light occupies a reflection path rather than isolated pinpoints: '+JSON.stringify(filmic));
  assert.ok(filmic.white<filmic.water*.10,'the reflection keeps warm colour instead of a clipped white sheet');
  assert.ok(filmic.relocated>filmic.water*.01,'reflected light follows the visible disc height as well as its azimuth');
  assert.ok(filmic.energy>1,'bright facets produce an optical halo');assert.ok(filmic.nightEnergy<.001,'a source-free night cannot retain solar bloom');
  console.log('Filmic reflection pixels:',filmic);
  // Each optical slider must change actual rendered pixels, including its
  // upper half. Hold astronomy/time fixed so animation cannot fake a result.
  const effectPixels=await page.evaluate(()=>{
   const gpu=window.gpu,light={...window.gpuLight,time:7},frame=window.gpuFrame;
   const defaults={bloom:1,reflections:1,rays:1,waveSpeed:1,exposure:1},rows=[];
   for(const key of Object.keys(defaults)){
    const values=key==='exposure'?[.5,1,1.5]:[0,1,2],images=[];
    for(const value of values){gpu.render(light,frame,'high',{...defaults,[key]:value});images.push(window.gpuCopy());}
    const difference=(a,b)=>{let total=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;if(d>1)changed++;}return {total,changed};};
    rows.push({key,lower:difference(images[0],images[1]),upper:difference(images[1],images[2])});
   }
   gpu.render(light,frame,'high',defaults);return rows;
  });
  for(const row of effectPixels){assert.ok(row.lower.changed>20,row.key+' lower range: '+JSON.stringify(row));assert.ok(row.upper.changed>20,row.key+' upper range: '+JSON.stringify(row));}
  console.log('Live optical slider pixel differences:',effectPixels);
  const lens=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=c.height=1000;const ctx=c.getContext('2d');
   return [0,1,2].map(strength=>{ctx.clearRect(0,0,1000,1000);window.paintSun(ctx,500,500,1,strength);const p=ctx.getImageData(0,0,1000,1000).data;let energy=0;for(let y=0;y<1000;y++)for(let x=0;x<1000;x++)if(Math.hypot(x-500,y-500)>100)energy+=p[(y*1000+x)*4+3];return energy;});
  });
  assert.equal(lens[0],0,'0% hides optical rays without hiding the sun disc');assert.ok(lens[1]>1000);assert.ok(lens[2]>lens[1]*1.5,'maximum soft rays remain stronger than default: '+lens);
  console.log('Feathered sun ray energy:',lens);
  // Test every pixel against the actual water mask, not a rectangular bounding box.
  const outside=await page.evaluate(async()=>{
   const gpu=window.gpu,c=document.createElement('canvas');c.width=gpu.targets[0].width;c.height=gpu.targets[0].height;
   const image=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src='/water-mask.png';});c.getContext('2d').drawImage(image,0,0,c.width,c.height);
   const mask=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   const previous=window.gpuLight.sun.intensity;window.gpuLight.sun.intensity=12;
   gpu.render(window.gpuLight,window.gpuFrame,'high');window.gpuLight.sun.intensity=previous;const gl=gpu.canvas.getContext('webgl2'),target=gpu.targets[0];
   gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);const hdr=gpu.diagnostics().hdr;
   const pixels=hdr?new Float32Array(c.width*c.height*4):new Uint8Array(c.width*c.height*4);
   gl.readPixels(0,0,c.width,c.height,gl.RGBA,hdr?gl.FLOAT:gl.UNSIGNED_BYTE,pixels);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   let escaped=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const a=mask[(y*c.width+x)*4+3],alpha=pixels[((c.height-1-y)*c.width+x)*4+3]*(hdr?255:1);if(a===0&&alpha>20)escaped++;
   }if(gl.getError()!==gl.NO_ERROR)throw Error('water FBO read failed');
   let maximum=0;for(let i=0;i<pixels.length;i+=4)maximum=Math.max(maximum,pixels[i],pixels[i+1],pixels[i+2]);return {escaped,hdr,maximum};
  });assert.equal(outside.escaped,0,'GPU water cannot reach opaque land');if(outside.hdr)assert.ok(outside.maximum>1,'HDR target preserves highlight energy before tone mapping: '+JSON.stringify(outside));
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
  assert.ok(await page.evaluate(()=>window.gpu.diagnostics().pixels<=210000));
  assert.equal(await page.evaluate(()=>window.gpu.diagnostics().hdr),result.diagnostics.hdr,'lower resolution retains HDR on capable GPUs');
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
