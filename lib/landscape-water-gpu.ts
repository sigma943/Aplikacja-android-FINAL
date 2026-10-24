import calibration from './landscape-water-calibration.json';
import type {LandscapeLightingState} from './landscape-lighting';
import {WATER_VERTEX,WATER_FRAGMENT,SCREEN_VERTEX,LIGHT_FRAGMENT,PRESENT_FRAGMENT,TERRAIN_FRAGMENT} from './landscape-water-shaders';
export {WATER_VERTEX,WATER_FRAGMENT,SCREEN_VERTEX,LIGHT_FRAGMENT,PRESENT_FRAGMENT,TERRAIN_FRAGMENT} from './landscape-water-shaders';
export type WaterQuality='high'|'medium'|'low';
export const WATER_QUALITY={high:{fps:30,pixels:360000,scale:.85,columns:96,rows:128},medium:{fps:24,pixels:210000,scale:.65,columns:64,rows:96},low:{fps:15,pixels:80000,scale:.40,columns:48,rows:64}} as const;
export type WaterAssets={terrain:CanvasImageSource;water:CanvasImageSource;clouds:CanvasImageSource;geometry?:CanvasImageSource;perspective?:CanvasImageSource;sceneDepth?:CanvasImageSource;terrainNormal?:CanvasImageSource};
type Frame={width:number;height:number;scale:number;x:number;y:number};
type Target={framebuffer:WebGLFramebuffer;texture:WebGLTexture;width:number;height:number};
type Program={program:WebGLProgram;uniforms:Map<string,WebGLUniformLocation|null>};
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
 private hdr=false;
 private terrainKey='';
 private lastTerrainUpdate=-Infinity;
 private lastTerrainLight=[-1,-1,-1,-1,-1,-1,-1,-1];
 private terrainRelights=0;
 private lastDrawCalls=0;
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
 private restore=()=>{this.hdrUnavailable=false;this.lost=false;this.failed=false;this.programs=[];this.textures=[];this.buffers=[];this.targets=[];this.vao=null;this.query=null;this.meshQuality=null;this.initialize();};
 constructor(){
  this.canvas.addEventListener('webglcontextlost',this.loss);this.canvas.addEventListener('webglcontextrestored',this.restore);
  try{this.gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});}catch(e){this.failed=true;this.canvas.dataset.error=String(e);}
 }
 setAssets(assets:WaterAssets){this.release();this.assets=assets;this.failed=false;this.initialize();}
 private compile(vertex:string,fragment:string):Program{
  const gl=this.gl!,shaders:WebGLShader[]=[];const program=gl.createProgram();if(!program)throw Error('program allocation');
  try{
   for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){const shader=gl.createShader(kind);if(!shader)throw Error('shader allocation');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'shader compile');gl.attachShader(program,shader);}
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'shader link');
   return {program,uniforms:new Map()};
  }catch(e){gl.deleteProgram(program);throw e;}finally{for(const shader of shaders)gl.deleteShader(shader);}
 }
 private uniform(p:Program,name:string){if(!p.uniforms.has(name))p.uniforms.set(name,this.gl!.getUniformLocation(p.program,name));return p.uniforms.get(name)!;}
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
   this.programs.push(this.compile(WATER_VERTEX,WATER_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,LIGHT_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,PRESENT_FRAGMENT));this.programs.push(this.compile(SCREEN_VERTEX,TERRAIN_FRAGMENT));
   this.texture(0,this.assets.water);this.texture(1,this.assets.terrain);
   // Decode the opaque 16-bit UV atlas once. Float filtering is performed in the vertex shader.
   const atlas=document.createElement('canvas'),image=this.assets.geometry as HTMLImageElement;
   atlas.width=image.width;atlas.height=image.height;const c=atlas.getContext('2d',{willReadFrequently:true})!;c.drawImage(image,0,0);
   const pixels=c.getImageData(0,0,atlas.width,atlas.height).data,w=atlas.width/2,h=atlas.height,positions=new Float32Array(w*h*2);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=(y*atlas.width+x)*4,b=a+w*4,i=(y*w+x)*2;positions[i]=((pixels[a]*256+pixels[a+1])/65535-.5)*(2*calibration.worldExtent);positions[i+1]=((pixels[b]*256+pixels[b+1])/65535-.5)*(2*calibration.worldExtent);}
   const geometry=gl.createTexture();if(!geometry)throw Error('geometry allocation');this.textures.push({unit:2,texture:geometry});gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,geometry);this.parameters(gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,w,h,0,gl.RG,gl.FLOAT,positions);atlas.width=atlas.height=1;
   this.texture(3,this.assets.perspective);this.texture(4,this.assets.clouds);
   const empty=document.createElement('canvas');empty.width=empty.height=1;
   this.texture(7,this.assets.sceneDepth??empty);this.texture(8,this.assets.terrainNormal??empty);this.texture(9,empty);
   const samplers:{[key:string]:number}={uMask:0,uTerrain:1,uGeometry:2,uPerspective:3,uClouds:4,uWater:5,uLight:6,uSceneDepth:7,uTerrainNormal:8,uLitTerrain:9};
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
 private clearTargets(){const gl=this.gl!;for(const t of this.targets){gl.deleteFramebuffer(t.framebuffer);gl.deleteTexture(t.texture);}this.targets=[];this.terrainKey='';}
 private target(width:number,height:number,hdr:boolean):Target{
  const gl=this.gl!,framebuffer=gl.createFramebuffer(),texture=gl.createTexture();if(!texture||!framebuffer){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw Error('target allocation');}
  gl.bindTexture(gl.TEXTURE_2D,texture);this.parameters(gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,hdr?gl.RGBA16F:gl.RGBA8,width,height,0,gl.RGBA,hdr?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);throw Error('incomplete target');}
  return {framebuffer,texture,width,height};
 }
 private resize(width:number,height:number,hdr:boolean,presentWidth:number,presentHeight:number){
  if(this.targets[0]?.width===width&&this.targets[0]?.height===height&&this.hdr===hdr&&this.canvas.width===presentWidth&&this.canvas.height===presentHeight)return;
  this.clearTargets();this.canvas.width=presentWidth;this.canvas.height=presentHeight;this.hdr=hdr;
  try{this.targets.push(this.target(width,height,hdr));this.targets.push(this.target(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),hdr));}
  catch(e){this.clearTargets();if(!hdr)throw e;this.hdrUnavailable=true;this.hdr=false;this.targets.push(this.target(width,height,false));this.targets.push(this.target(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),false));}
  if(this.assets?.terrainNormal&&this.assets?.sceneDepth)this.targets.push(this.target(presentWidth,presentHeight,false));
 }

 render(light:LandscapeLightingState,frame:Frame,quality:WaterQuality){
  const gl=this.gl;if(!gl||this.lost||this.failed)return false;if(!this.programs.length)this.initialize();if(!this.programs.length)return false;
  try{
   const q=WATER_QUALITY[quality],density=Math.min(q.scale,Math.sqrt(q.pixels/(frame.width*frame.height))),width=Math.max(1,Math.floor(frame.width*density)),height=Math.max(1,Math.floor(frame.height*density));
   this.resize(width,height,this.floatSupported&&!this.hdrUnavailable&&quality!=='low',frame.width,frame.height);this.mesh(quality);
   // Texture bindings can be changed by target allocation; restore all static units.
   for(const {unit,texture} of this.textures){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);}
   for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE5+i);gl.bindTexture(gl.TEXTURE_2D,this.targets[i].texture);}
   if(this.targets[2]){gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,this.targets[2].texture);}
   let timing=false;
   if(this.timer&&this.query){if(this.pendingQuery&&gl.getQueryParameter(this.query,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(this.timer.GPU_DISJOINT_EXT))this.gpuMs=gl.getQueryParameter(this.query,gl.QUERY_RESULT)/1e6;this.pendingQuery=false;}if(!this.pendingQuery){gl.beginQuery(this.timer.TIME_ELAPSED_EXT,this.query);timing=true;}}
   // Shared palette colours are display sRGB. BRDF radiance must be linear;
   // presentation rays retain display colour. Reuse the upload arrays.
   for(let i=0;i<3;i++){this.sunLinear[i]=light.sun.color[i]**2.2;this.moonLinear[i]=light.moon.color[i]**2.2;}
   const wall=performance.now(),previous=this.lastTerrainLight;
   const major=Math.abs(light.sky.day-previous[0])>.08||Math.abs(light.sky.twilight-previous[1])>.08||Math.abs(light.sun.intensity-previous[2])>.08||Math.abs(light.moon.intensity-previous[3])>.08||Math.abs(light.sun.x-previous[4])>.08||Math.abs(light.sun.altitude-previous[5])>.08||Math.abs(light.moon.x-previous[6])>.08||Math.abs(light.moon.altitude-previous[7])>.08;
   let materialKey=this.terrainKey;
   if(this.targets[2]&&(!materialKey||major||wall-this.lastTerrainUpdate>1000))materialKey=`${light.sky.day.toFixed(2)}:${light.sky.twilight.toFixed(2)}:${light.sun.intensity.toFixed(2)}:${light.sun.x.toFixed(2)}:${light.sun.altitude.toFixed(2)}:${light.moon.intensity.toFixed(2)}:${light.moon.x.toFixed(2)}:${light.moon.altitude.toFixed(2)}`;
   const relight=!!this.targets[2]&&materialKey!==this.terrainKey;
   this.lastDrawCalls=relight?4:3;
   for(let stage=relight?-1:0;stage<3;stage++){
    const pass=stage<0?3:stage;
    const p=this.programs[pass],target=pass===3?this.targets[2]:pass<2?this.targets[pass]:null,w=target?.width??this.canvas.width,h=target?.height??this.canvas.height,sx=w/frame.width,sy=h/frame.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER,target?.framebuffer??null);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(p.program);
    gl.uniform2f(this.uniform(p,'uResolution'),w,h);gl.uniform4f(this.uniform(p,'uFrame'),1000*frame.scale*sx,(1000*1850/850)*frame.scale*sy,frame.x*sx,frame.y*sy);
    gl.uniform1f(this.uniform(p,'uTime'),light.time);gl.uniform1f(this.uniform(p,'uQuality'),quality==='high'?2:quality==='medium'?1:0);gl.uniform1f(this.uniform(p,'uFrameInterval'),1/q.fps);gl.uniform1f(this.uniform(p,'uHdr'),this.hdr?1:0);
    gl.uniform1f(this.uniform(p,'uSceneEnabled'),this.assets?.sceneDepth?1:0);
    gl.uniform1f(this.uniform(p,'uTerrainEnabled'),this.targets[2]?1:0);
    gl.uniform1f(this.uniform(p,'uDay'),light.sky.day);gl.uniform1f(this.uniform(p,'uWarm'),light.sky.twilight);gl.uniform1f(this.uniform(p,'uMoonIllumination'),light.moon.illumination);gl.uniform2f(this.uniform(p,'uWaterResolution'),width,height);
    gl.uniform2f(this.uniform(p,'uSunPosition'),light.sun.x,light.sun.y);gl.uniform1f(this.uniform(p,'uSunAltitude'),light.sun.altitude);gl.uniform3fv(this.uniform(p,'uSunColor'),pass===0||pass===3?this.sunLinear:light.sun.color);gl.uniform1f(this.uniform(p,'uSunIntensity'),light.sun.intensity);
    gl.uniform2f(this.uniform(p,'uMoonPosition'),light.moon.x,light.moon.y);gl.uniform1f(this.uniform(p,'uMoonAltitude'),light.moon.altitude);gl.uniform3fv(this.uniform(p,'uMoonColor'),pass===0||pass===3?this.moonLinear:light.moon.color);gl.uniform1f(this.uniform(p,'uMoonIntensity'),light.moon.intensity);
    if(pass===0){gl.bindVertexArray(this.vao);gl.drawElements(gl.TRIANGLES,this.indices,gl.UNSIGNED_SHORT,0);gl.bindVertexArray(null);}else gl.drawArrays(gl.TRIANGLES,0,3);
   }
   if(relight){this.terrainKey=materialKey;this.lastTerrainUpdate=wall;previous[0]=light.sky.day;previous[1]=light.sky.twilight;previous[2]=light.sun.intensity;previous[3]=light.moon.intensity;previous[4]=light.sun.x;previous[5]=light.sun.altitude;previous[6]=light.moon.x;previous[7]=light.moon.altitude;this.terrainRelights++;}
   if(timing&&this.timer){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pendingQuery=true;}
   return true;
  }catch(e){this.canvas.dataset.error=String(e);this.release();this.failed=true;return false;}
 }
 getGpuMs(){return this.gpuMs;}
 private release(){const gl=this.gl;if(!gl)return;for(const p of this.programs)gl.deleteProgram(p.program);this.programs=[];for(const t of this.textures)gl.deleteTexture(t.texture);this.textures=[];for(const b of this.buffers)gl.deleteBuffer(b);this.buffers=[];if(this.vao)gl.deleteVertexArray(this.vao);this.vao=null;this.meshQuality=null;this.clearTargets();if(this.query)gl.deleteQuery(this.query);this.query=null;this.pendingQuery=false;this.gpuMs=0;}
 suspend(){this.release();this.canvas.width=this.canvas.height=1;}
 dispose(){this.release();this.canvas.removeEventListener('webglcontextlost',this.loss);this.canvas.removeEventListener('webglcontextrestored',this.restore);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;this.assets=null;this.canvas.width=this.canvas.height=1;this.canvas.remove();}
 diagnostics(){return {available:!!this.gl&&!this.failed,lost:this.lost,error:this.canvas.dataset.error,pixels:(this.targets[0]?.width??1)*(this.targets[0]?.height??1),presentationPixels:this.canvas.width*this.canvas.height,terrainRelights:this.terrainRelights,hdr:this.hdr,drawCalls:this.lastDrawCalls,vertices:this.meshQuality?(WATER_QUALITY[this.meshQuality].columns+1)*(WATER_QUALITY[this.meshQuality].rows+1):0,gpuMs:this.timer?this.gpuMs:null,targetPixels:this.targets.reduce((sum,t)=>sum+t.width*t.height,0)};}
}
