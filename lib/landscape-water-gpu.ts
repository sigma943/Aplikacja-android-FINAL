import {LandscapeSolidScene} from './landscape-scene-gpu';
import calibration from './landscape-water-calibration.json';
import type {LandscapeLightingState} from './landscape-lighting';
import {WATER_VERTEX,WATER_FRAGMENT,SCREEN_VERTEX,LIGHT_FRAGMENT,PRESENT_FRAGMENT,TERRAIN_FRAGMENT,SCENE_VERTEX,SCENE_FRAGMENT,BLOOM_FRAGMENT} from './landscape-water-shaders';
export {WATER_VERTEX,WATER_FRAGMENT,SCREEN_VERTEX,LIGHT_FRAGMENT,PRESENT_FRAGMENT,TERRAIN_FRAGMENT,SCENE_VERTEX,SCENE_FRAGMENT,BLOOM_FRAGMENT} from './landscape-water-shaders';
export type WaterQuality='high'|'medium'|'low';
export const WATER_QUALITY={high:{fps:60,pixels:2400000,scale:1,columns:160,rows:224,bloomLevels:5},medium:{fps:30,pixels:900000,scale:.85,columns:96,rows:128,bloomLevels:4},low:{fps:15,pixels:210000,scale:.55,columns:48,rows:64,bloomLevels:3}} as const;
export type WaterAssets={terrain:CanvasImageSource;water:CanvasImageSource;clouds:CanvasImageSource;geometry?:CanvasImageSource;perspective?:CanvasImageSource;sceneDepth?:CanvasImageSource;terrainNormal?:CanvasImageSource};
type Frame={width:number;height:number;scale:number;x:number;y:number};
type Target={framebuffer:WebGLFramebuffer;texture:WebGLTexture;width:number;height:number;depth?:WebGLRenderbuffer};
type Program={program:WebGLProgram;uniforms:Map<string,WebGLUniformLocation|null>;values:Map<string,Float32Array>};
/** One directly presented WebGL2 context; a displaced mesh, low-resolution light
 * pass and ACES presentation. Static textures/meshes never upload per frame. */
export class LandscapeWaterGPU {
 readonly canvas=document.createElement('canvas');
 private gl:WebGL2RenderingContext|null=null;
 private programs:Program[]=[];
 private textures:{unit:number;texture:WebGLTexture}[]=[];
 private vao:WebGLVertexArrayObject|null=null;
 private buffers:WebGLBuffer[]=[];
 private indices=0;
 private meshQuality:WaterQuality|null=null;
 private targets:Target[]=[];
 private bloomDown:Target[]=[];
 private bloomUp:Target[]=[];
 private hdr=false;
 private solid:LandscapeSolidScene|null=null;
 private reflectionUpdates=0;
 private terrainKey='';
 private lastTerrainUpdate=-Infinity;
 private lastTerrainLight=[-1,-1,-1,-1,-1,-1,-1,-1,-1,-1];
 private terrainRelights=0;
 private lastDrawCalls=0;
 private bindingsDirty=true;
 private uniformUploads=0;
 private textureRestores=0;
 private floatSupported=false;
 private hdrUnavailable=false;
 private lost=false;
 private failed=false;
 private assets:WaterAssets|null=null;
 private query:WebGLQuery|null=null;
 private timer:{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null=null;
 private pendingQuery=false;
 private gpuMs=0;
 private sunLinear=new Float32Array(3);
 private moonLinear=new Float32Array(3);
 private loss=(event:Event)=>{event.preventDefault();this.lost=true;};
 private restore=()=>{this.hdrUnavailable=false;this.lost=false;this.failed=false;this.solid=null;this.programs=[];this.textures=[];this.buffers=[];this.targets=[];this.bloomDown=[];this.bloomUp=[];this.vao=null;this.query=null;this.meshQuality=null;this.initialize();};
 constructor(){
  this.canvas.addEventListener('webglcontextlost',this.loss);this.canvas.addEventListener('webglcontextrestored',this.restore);
  try{this.gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});}catch(e){this.failed=true;this.canvas.dataset.error=String(e);}
 }
 setAssets(assets:WaterAssets){this.release();this.assets=assets;this.failed=false;this.initialize();}
 private compile(vertex:string,fragment:string):Program{
  const gl=this.gl!,shaders:WebGLShader[]=[];const program=gl.createProgram();if(!program)throw Error('program allocation');
  try{
   for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){const shader=gl.createShader(kind);if(!shader)throw Error('shader allocation');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'shader compile');gl.attachShader(program,shader);}
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'shader link');
   return {program,uniforms:new Map(),values:new Map()};
  }catch(e){gl.deleteProgram(program);throw e;}finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 private uniform(p:Program,name:string){if(!p.uniforms.has(name))p.uniforms.set(name,this.gl!.getUniformLocation(p.program,name));return p.uniforms.get(name)!;}
 /** The context is exclusively owned here. Compare the actual float32 values
  * accepted by WebGL; avoiding redundant driver calls cannot change pixels. */
 private upload(p:Program,name:string,a:number,b?:number,c?:number,d?:number){
  const location=this.uniform(p,name);if(location===null)return;
  a=Math.fround(a);if(b!==undefined)b=Math.fround(b);if(c!==undefined)c=Math.fround(c);if(d!==undefined)d=Math.fround(d);
  let previous=p.values.get(name);
  if(previous&&previous[0]===a&&(b===undefined||previous[1]===b)&&(c===undefined||previous[2]===c)&&(d===undefined||previous[3]===d))return;
  if(!previous){previous=new Float32Array(4);p.values.set(name,previous);}
  previous[0]=a;if(b!==undefined)previous[1]=b;if(c!==undefined)previous[2]=c;if(d!==undefined)previous[3]=d;
  const gl=this.gl!;
  if(d!==undefined)gl.uniform4f(location,a,b!,c!,d);
  else if(c!==undefined)gl.uniform3f(location,a,b!,c);
  else if(b!==undefined)gl.uniform2f(location,a,b);
  else gl.uniform1f(location,a);
  this.uniformUploads++;
 }
 private texture(unit:number,source:CanvasImageSource){
  const gl=this.gl!,texture=gl.createTexture();if(!texture)throw Error('texture allocation');this.textures.push({unit,texture});gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);this.parameters(gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source as TexImageSource);
  if(unit===1||unit===4){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}
 }
 private parameters(filter:number){const gl=this.gl!;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
 private initialize(){
  const gl=this.gl;if(!gl||!this.assets||this.lost||this.failed)return;
  if(!this.assets.geometry||!this.assets.perspective){this.failed=true;this.canvas.dataset.error='missing water geometry';return;}
  try{
   this.programs.push(this.compile(WATER_VERTEX,WATER_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,LIGHT_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,PRESENT_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,TERRAIN_FRAGMENT));this.programs.push(this.compile(SCENE_VERTEX,SCENE_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,BLOOM_FRAGMENT));
   this.texture(0,this.assets.water);this.texture(1,this.assets.terrain);
   // Decode the opaque 24-bit UV atlas once. Float filtering is performed in the vertex shader.
   const atlas=document.createElement('canvas'),image=this.assets.geometry as HTMLImageElement;
   atlas.width=image.width;atlas.height=image.height;const c=atlas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0);
   const pixels=c.getImageData(0,0,atlas.width,atlas.height).data,w=atlas.width/2,h=atlas.height,positions=new Float32Array(w*h*2);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=(y*atlas.width+x)*4,b=a+w*4,i=(y*w+x)*2;positions[i]=((pixels[a]*65536+pixels[a+1]*256+pixels[a+2])/16777215-.5)*(2*calibration.worldExtent);positions[i+1]=((pixels[b]*65536+pixels[b+1]*256+pixels[b+2])/16777215-.5)*(2*calibration.worldExtent);}
   const geometry=gl.createTexture();if(!geometry)throw Error('geometry allocation');this.textures.push({unit:2,texture:geometry});gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,geometry);this.parameters(gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,w,h,0,gl.RG,gl.FLOAT,positions);atlas.width=atlas.height=1;
   this.texture(3,this.assets.perspective);this.texture(4,this.assets.clouds);
   const empty=document.createElement('canvas');empty.width=empty.height=1;
   this.texture(7,this.assets.sceneDepth??empty);this.texture(8,this.assets.terrainNormal??empty);this.texture(9,empty);this.texture(10,empty);
   if(this.assets.terrainNormal&&this.assets.sceneDepth)this.solid=new LandscapeSolidScene(gl,this.assets.water);
   const samplers:{[key:string]:number}={uMask:0,uTerrain:1,uGeometry:2,uPerspective:3,uClouds:4,uWater:5,uLight:6,uSceneDepth:7,uTerrainNormal:8,uLitTerrain:9,uPlanar:10,uSceneHeight:11,uBloomSource:12,uBloomDetail:13,uBloom:14};
   for(const p of this.programs){gl.useProgram(p.program);for(const [name,unit] of Object.entries(samplers))gl.uniform1i(this.uniform(p,name),unit);}
   this.floatSupported=!!gl.getExtension('EXT_color_buffer_float');
   this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');if(this.timer)this.query=gl.createQuery();this.pendingQuery=false;
  }catch(e){this.canvas.dataset.error=String(e);this.release();this.failed=true;}
 }
 private mesh(quality:WaterQuality){
  if(this.meshQuality===quality)return;const gl=this.gl!;for(const b of this.buffers)gl.deleteBuffer(b);this.buffers=[];if(this.vao)gl.deleteVertexArray(this.vao);
  const {columns,rows}=WATER_QUALITY[quality],vertices=new Float32Array((columns+1)*(rows+1)*2),indices=new Uint16Array(columns*rows*6);
  let v=0,k=0;for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){vertices[v++]=x/columns;vertices[v++]=calibration.waterTop+y/rows*(1-calibration.waterTop);}
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=y*(columns+1)+x;indices[k++]=i;indices[k++]=i+1;indices[k++]=i+columns+1;indices[k++]=i+1;indices[k++]=i+columns+2;indices[k++]=i+columns+1;}
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  for(const [target,data] of [[gl.ARRAY_BUFFER,vertices],[gl.ELEMENT_ARRAY_BUFFER,indices]] as const){const buffer=gl.createBuffer();if(!buffer)throw Error('mesh allocation');this.buffers.push(buffer);gl.bindBuffer(target,buffer);gl.bufferData(target,data,gl.STATIC_DRAW);}
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindVertexArray(null);this.indices=indices.length;this.meshQuality=quality;
 }
 private clearTargets(){const gl=this.gl!;for(const t of [...this.targets,...this.bloomDown,...this.bloomUp]){gl.deleteFramebuffer(t.framebuffer);gl.deleteTexture(t.texture);if(t.depth)gl.deleteRenderbuffer(t.depth);}this.targets=[];this.bloomDown=[];this.bloomUp=[];this.terrainKey='';}
 private target(width:number,height:number,hdr:boolean,depthBuffer=false):Target{
  const gl=this.gl!,framebuffer=gl.createFramebuffer(),texture=gl.createTexture();if(!texture||!framebuffer){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw Error('target allocation');}
  gl.bindTexture(gl.TEXTURE_2D,texture);this.parameters(gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,hdr?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  let depth:WebGLRenderbuffer|undefined;
  if(depthBuffer){depth=gl.createRenderbuffer()??undefined;if(!depth){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw Error('depth allocation');}gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);}
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);if(depth)gl.deleteRenderbuffer(depth);throw Error('incomplete target');}
  return {framebuffer,texture,width,height,depth};
 }
 private resize(width:number,height:number,hdr:boolean,presentWidth:number,presentHeight:number,levels:number){
  if(this.targets[0]?.width===width&&this.targets[0]?.height===height&&this.hdr===hdr&&this.canvas.width===presentWidth&&this.canvas.height===presentHeight&&this.bloomDown.length===levels)return;
  this.clearTargets();this.bindingsDirty=true;this.canvas.width=presentWidth;this.canvas.height=presentHeight;this.hdr=hdr;
  try{this.targets.push(this.target(width,height,hdr));this.targets.push(this.target(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),hdr));}
  catch(e){this.clearTargets();if(!hdr)throw e;this.hdrUnavailable=true;this.hdr=false;this.targets.push(this.target(width,height,false));this.targets.push(this.target(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),false));}
  if(this.assets?.terrainNormal&&this.assets?.sceneDepth)this.targets.push(this.target(presentWidth,presentHeight,false));
  if(this.solid)this.targets.push(this.target(width,height,this.hdr,true));
  // Keep every successfully allocated target owned even if a later allocation
  // fails. release()/context restoration then disposes the complete pyramid.
  for(let i=0;i<levels;i++){
   const w=Math.max(1,Math.ceil(width/2**(i+1))),h=Math.max(1,Math.ceil(height/2**(i+1)));
   this.bloomDown.push(this.target(w,h,this.hdr));
   if(i<levels-1)this.bloomUp.push(this.target(w,h,this.hdr));
  }
 }

 private renderBloom(){
  const gl=this.gl!,p=this.programs[5];gl.useProgram(p.program);
  this.upload(p,'uHdr',this.hdr?1:0);
  const draw=(source:Target,target:Target,stage:number,detail?:Target)=>{
   gl.activeTexture(gl.TEXTURE12);gl.bindTexture(gl.TEXTURE_2D,source.texture);
   // Also bind a non-destination texture when the branch ignores this sampler.
   gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,(detail??source).texture);
   gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,target.width,target.height);
   this.upload(p,'uResolution',target.width,target.height);this.upload(p,'uSourceResolution',source.width,source.height);this.upload(p,'uBloomStage',stage);
   gl.drawArrays(gl.TRIANGLES,0,3);this.lastDrawCalls++;
  };
  let source=this.targets[0];
  for(let i=0;i<this.bloomDown.length;i++){draw(source,this.bloomDown[i],i===0?0:1);source=this.bloomDown[i];}
  for(let i=this.bloomUp.length-1;i>=0;i--){draw(source,this.bloomUp[i],2,this.bloomDown[i]);source=this.bloomUp[i];}
  gl.activeTexture(gl.TEXTURE14);gl.bindTexture(gl.TEXTURE_2D,source.texture);
 }

 private configure(p:Program,light:LandscapeLightingState,frame:Frame,quality:WaterQuality,w:number,h:number,width:number,height:number,linear:boolean){
  const sun=linear?this.sunLinear:light.sun.color,moon=linear?this.moonLinear:light.moon.color,sx=w/frame.width,sy=h/frame.height;
    this.upload(p,'uResolution',w,h);this.upload(p,'uFrame',1000*frame.scale*sx,(1000*1850/850)*frame.scale*sy,frame.x*sx,frame.y*sy);
    this.upload(p,'uTime',light.time);this.upload(p,'uQuality',quality==='high'?2:quality==='medium'?1:0);this.upload(p,'uFrameInterval',1/WATER_QUALITY[quality].fps);this.upload(p,'uHdr',this.hdr?1:0);
    this.upload(p,'uSceneEnabled',this.assets?.sceneDepth?1:0);
    this.upload(p,'uTerrainEnabled',this.targets[2]?1:0);
    this.upload(p,'uDay',light.sky.day);this.upload(p,'uWarm',light.sky.twilight);this.upload(p,'uMoonIllumination',light.moon.illumination);this.upload(p,'uWaterResolution',width,height);
    this.upload(p,'uSunPosition',light.sun.x,light.sun.y);this.upload(p,'uSunAltitude',light.sun.altitude);this.upload(p,'uSunColor',sun[0],sun[1],sun[2]);this.upload(p,'uSunIntensity',light.sun.intensity);
    this.upload(p,'uMoonPosition',light.moon.x,light.moon.y);this.upload(p,'uMoonAltitude',light.moon.altitude);this.upload(p,'uMoonColor',moon[0],moon[1],moon[2]);this.upload(p,'uMoonIntensity',light.moon.intensity);
  this.upload(p,'uScene3D',this.solid?1:0);
 }

 render(light:LandscapeLightingState,frame:Frame,quality:WaterQuality,effects={bloom:1,reflections:1,rays:1,waveSpeed:1,exposure:1}){
  const gl=this.gl;if(!gl||this.lost||this.failed)return false;if(!this.programs.length)this.initialize();if(!this.programs.length)return false;
  try{
   const q=WATER_QUALITY[quality],density=Math.min(q.scale,Math.sqrt(q.pixels/(frame.width*frame.height))),width=Math.max(1,Math.floor(frame.width*density)),height=Math.max(1,Math.floor(frame.height*density));
   this.resize(width,height,this.floatSupported&&!this.hdrUnavailable,frame.width,frame.height,q.bloomLevels);this.mesh(quality);
   // Target allocation can disturb texture units. Animation passes do not:
   // restore once after resize/recovery, then retain the context's bindings.
   if(this.bindingsDirty){
   for(const {unit,texture} of this.textures){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);}
   for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE5+i);gl.bindTexture(gl.TEXTURE_2D,this.targets[i].texture);}
   if(this.targets[2]){gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,this.targets[2].texture);}
   if(this.targets[3]){gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,this.targets[3].texture);}this.solid?.bind();
    this.bindingsDirty=false;this.textureRestores++;
   }
   let timing=false;
   if(this.timer&&this.query){if(this.pendingQuery&&gl.getQueryParameter(this.query,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(this.timer.GPU_DISJOINT_EXT))this.gpuMs=gl.getQueryParameter(this.query,gl.QUERY_RESULT)/1e6;this.pendingQuery=false;}if(!this.pendingQuery){gl.beginQuery(this.timer.TIME_ELAPSED_EXT,this.query);timing=true;}}
   // Shared palette colours are display sRGB. BRDF radiance must be linear;
   // presentation rays retain display colour. Reuse the upload arrays.
   for(let i=0;i<3;i++){this.sunLinear[i]=light.sun.color[i]**2.2;this.moonLinear[i]=light.moon.color[i]**2.2;}
   const wall=performance.now(),previous=this.lastTerrainLight;
   const major=Math.abs(light.sky.day-previous[0])>.08||Math.abs(light.sky.twilight-previous[1])>.08||Math.abs(light.sun.intensity-previous[2])>.08||Math.abs(light.moon.intensity-previous[3])>.08||Math.abs(light.sun.x-previous[4])>.08||Math.abs(light.sun.altitude-previous[5])>.08||Math.abs(light.moon.x-previous[6])>.08||Math.abs(light.moon.altitude-previous[7])>.08||Math.abs(light.sun.y-previous[8])>.08||Math.abs(light.moon.y-previous[9])>.08;
   let materialKey=this.terrainKey;
   if(this.targets[2]&&(!materialKey||major||wall-this.lastTerrainUpdate>1000))materialKey=`${light.sky.day.toFixed(2)}:${light.sky.twilight.toFixed(2)}:${light.sun.intensity.toFixed(2)}:${light.sun.x.toFixed(2)}:${light.sun.altitude.toFixed(2)}:${light.moon.intensity.toFixed(2)}:${light.moon.x.toFixed(2)}:${light.moon.altitude.toFixed(2)}:${light.sun.y.toFixed(3)}:${light.moon.y.toFixed(3)}`;
   const relight=!!this.targets[2]&&materialKey!==this.terrainKey;
   this.lastDrawCalls=relight?(this.solid?6:4):3;
   for(let stage=relight?(this.solid?-2:-1):0;stage<3;stage++){
    if(stage===2)this.renderBloom();
    const pass=stage===-2?4:stage<0?3:stage;
    const p=this.programs[pass],target=pass===4?this.targets[3]:pass===3?this.targets[2]:pass<2?this.targets[pass]:null,w=target?.width??this.canvas.width,h=target?.height??this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer??null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|(target?.depth?gl.DEPTH_BUFFER_BIT:0));gl.useProgram(p.program);
    this.configure(p,light,frame,quality,w,h,width,height,pass===0||pass===3||pass===4);
    this.upload(p,'uBloomOffset',effects.bloom-1);this.upload(p,'uReflectionsOffset',effects.reflections-1);this.upload(p,'uRaysOffset',effects.rays-1);this.upload(p,'uWaveSpeedOffset',effects.waveSpeed-1);this.upload(p,'uExposureOffset',effects.exposure-1);
    if(pass===4){gl.uniform1f(this.uniform(p,'uMirror'),1);gl.uniform1f(this.uniform(p,'uSceneHdr'),1);this.solid!.draw(this.uniform(p,'uTree'));gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,this.targets[3].texture);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);this.reflectionUpdates++;}
    else if(pass===0){gl.bindVertexArray(this.vao);gl.drawElements(gl.TRIANGLES,this.indices,gl.UNSIGNED_SHORT,0);gl.bindVertexArray(null);}
    // The fixed camera already has registered albedo, normals and coverage in
    // TERRAIN_FRAGMENT. Painting the proxy mesh/forest over it creates cone
    // silhouettes and triangle-shaped lighting on the photographic foreground.
    // Keep solid geometry for the depth-tested mirror and terrain shadows.
    else gl.drawArrays(gl.TRIANGLES,0,3);
   }
   if(relight){this.terrainKey=materialKey;this.lastTerrainUpdate=wall;previous[0]=light.sky.day;previous[1]=light.sky.twilight;previous[2]=light.sun.intensity;previous[3]=light.moon.intensity;previous[4]=light.sun.x;previous[5]=light.sun.altitude;previous[6]=light.moon.x;previous[7]=light.moon.altitude;previous[8]=light.sun.y;previous[9]=light.moon.y;this.terrainRelights++;}
   if(timing&&this.timer){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pendingQuery=true;}
   return true;
  }catch(e){this.canvas.dataset.error=String(e);this.release();this.failed=true;return false;}
 }
 getGpuMs(){return this.gpuMs;}
 private release(){this.bindingsDirty=true;const gl=this.gl;if(!gl)return;this.solid?.dispose();this.solid=null;for(const p of this.programs)gl.deleteProgram(p.program);this.programs=[];for(const t of this.textures)gl.deleteTexture(t.texture);this.textures=[];for(const b of this.buffers)gl.deleteBuffer(b);this.buffers=[];if(this.vao)gl.deleteVertexArray(this.vao);this.vao=null;this.meshQuality=null;this.clearTargets();if(this.query)gl.deleteQuery(this.query);this.query=null;this.pendingQuery=false;this.gpuMs=0;}
 suspend(){this.release();this.canvas.width=this.canvas.height=1;}
 dispose(){this.release();this.canvas.removeEventListener('webglcontextlost',this.loss);this.canvas.removeEventListener('webglcontextrestored',this.restore);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;this.assets=null;this.canvas.width=this.canvas.height=1;this.canvas.remove();}
 diagnostics(){return {bloomLevels:this.bloomDown.length,bloomPixels:[...this.bloomDown,...this.bloomUp].reduce((sum,t)=>sum+t.width*t.height,0),qualityProfile:"cinematic",uniformUploads:this.uniformUploads,textureRestores:this.textureRestores,depthBufferPixels:this.targets.filter(t=>t.depth).reduce((sum,t)=>sum+t.width*t.height,0),available:!!this.gl&&!this.failed,lost:this.lost,error:this.canvas.dataset.error,pixels:(this.targets[0]?.width??1)*(this.targets[0]?.height??1),presentationPixels:this.canvas.width*this.canvas.height,terrainRelights:this.terrainRelights,scene3D:!!this.solid,sceneVertices:this.solid?.vertexCount??0,treeInstances:this.solid?.treeCount??0,reflectionUpdates:this.reflectionUpdates,reflectionPixels:(this.targets[3]?.width??0)*(this.targets[3]?.height??0),hdr:this.hdr,drawCalls:this.lastDrawCalls,vertices:this.meshQuality?(WATER_QUALITY[this.meshQuality].columns+1)*(WATER_QUALITY[this.meshQuality].rows+1):0,gpuMs:this.timer?this.gpuMs:null,targetPixels:[...this.targets,...this.bloomDown,...this.bloomUp].reduce((sum,t)=>sum+t.width*t.height,0)};}
}
