import type {LandscapeLightingState} from './landscape-lighting';
export type WaterQuality='high'|'medium'|'low';
export const WATER_QUALITY={high:{fps:30,pixels:360000,scale:.85},medium:{fps:24,pixels:210000,scale:.65},low:{fps:12,pixels:110000,scale:.45}} as const;
const vertex=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
export const WATER_FRAGMENT=`#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform sampler2D uMask;
uniform sampler2D uTerrain;
uniform float uTime;
uniform float uQuality;
uniform vec2 uSunPosition;
uniform float uSunAltitude;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec2 uMoonPosition;
uniform float uMoonAltitude;
uniform float uMoonIllumination;
uniform vec3 uMoonColor;
uniform float uMoonIntensity;
uniform float uDay;
uniform float uWarm;
out vec4 fragColor;
// The atlas uses top-left coordinates, exactly like the original Canvas artwork.
float maskAt(vec2 uv){return texture(uMask,uv).a;}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
// Short wavelets: mostly horizontal, with spatially varying phase and independent speeds.
// The fine third train is retained in low quality; lower pixel count saves energy.
vec3 waveField(vec2 p,float t){
  float warp=sin(p.x*1.73+p.y*.91)*1.35;
  float a=p.y*29.+warp+t*.85;
  float b=p.y*47.-p.x*1.8+sin(p.x*2.31)*.9-t*1.12;
  float c=p.y*83.+p.x*3.4+t*1.51;
  // Suppress subpixel waves at distant banks / low resolution instead of aliasing.
  vec3 aa=1.-smoothstep(vec3(1.2),vec3(3.14),vec3(fwidth(a),fwidth(b),fwidth(c)));
  float height=sin(a)*.50*aa.x+sin(b)*.30*aa.y+sin(c)*.20*aa.z;
  float dx=cos(a)*cos(p.x*1.73+p.y*.91)*2.34*.50*aa.x+cos(b)*(-1.8+cos(p.x*2.31)*2.08)*.30*aa.y+cos(c)*.68*aa.z;
  float dy=cos(a)*.50*aa.x+cos(b)*.49*aa.y+cos(c)*.57*aa.z;
  return vec3(height,dx*.18,dy*.45);
}
// Centre/span sampled offline from the unchanged water mask. The illustrated
// river is a curved perspective projection, not a rectangular flat wallpaper.
vec2 riverSection(float y){
  const vec2 profile[48]=vec2[48](vec2(0.94176,0.11412),vec2(0.94176,0.11412),vec2(0.94176,0.11412),vec2(0.94176,0.11412),vec2(0.89529,0.10588),vec2(0.90118,0.03500),vec2(0.79318,0.10588),vec2(0.73941,0.10235),vec2(0.72294,0.03500),vec2(0.72294,0.03500),vec2(0.59833,0.04471),vec2(0.48837,0.12235),vec2(0.46068,0.08000),vec2(0.60248,0.28353),vec2(0.63549,0.24588),vec2(0.64412,0.17529),vec2(0.65699,0.10118),vec2(0.78324,0.27294),vec2(0.84159,0.32588),vec2(0.85588,0.28588),vec2(0.85529,0.28706),vec2(0.75537,0.41294),vec2(0.69673,0.37294),vec2(0.68170,0.29412),vec2(0.68190,0.21176),vec2(0.67442,0.15294),vec2(0.68367,0.07529),vec2(0.72856,0.10824),vec2(0.80861,0.20588),vec2(0.87309,0.26000),vec2(0.89033,0.23294),vec2(0.90095,0.20471),vec2(0.90882,0.17294),vec2(0.87424,0.20000),vec2(0.82384,0.23529),vec2(0.76549,0.22706),vec2(0.71996,0.28000),vec2(0.68834,0.29882),vec2(0.69456,0.22706),vec2(0.71125,0.22588),vec2(0.76754,0.24706),vec2(0.79455,0.24588),vec2(0.81565,0.20471),vec2(0.83962,0.22471),vec2(0.95000,0.03500),vec2(0.88000,0.03500),vec2(0.88000,0.03500),vec2(0.88000,0.03500));
  float row=clamp((y-.58)/.32*47.,0.,47.);int i=int(floor(row));
  return mix(profile[i],profile[min(47,i+1)],smoothstep(0.,1.,fract(row)));
}
float reflection(vec2 uv,vec3 n,vec2 body,float altitude,float power,float crest,float lunar){
  if(altitude<=0.||power<=.0001)return 0.;
  float depth=clamp((uv.y-.575)/.425,0.,1.);
  vec2 section=riverSection(uv.y);
  vec3 view=normalize(vec3((section.x-uv.x)/max(.04,section.y)*.16,.55,-1.6+depth*.7));
  vec3 light=normalize(vec3((body.x-.5)*1.4,max(.035,sin(altitude)),.9));
  vec3 halfVector=normalize(view+light);
  float spec=pow(max(0.,dot(n,halfVector)),mix(32.,64.,uQuality*.5));
  // Project the light's lateral bearing into the river's authored perspective.
  // This follows the bends; the exact alpha mask still rejects islands and banks.
  float axis=section.x+(body.x-.5)*1.8*section.y;
  float width=max(.009,section.y*mix(.22,.42,depth))*mix(1.,1.35,lunar);
  float corridor=exp(-pow((uv.x-axis)/width,2.));
  float low=1.-smoothstep(.05,.65,altitude);
  return power*corridor*(spec*.45+crest*4.5)*mix(mix(.28,4.,low),1.8,lunar)*smoothstep(.575,.60,uv.y);
}
void main(){
  vec2 screen=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);
  vec2 uv=(screen-uFrame.zw)/uFrame.xy;
  float mask=maskAt(uv);
  if(mask<.004||uv.y<.57){fragColor=vec4(0.);return;}
  // Erode the real shoreline, including small islands/trees. Never displace its silhouette.
  vec2 texel=1./vec2(textureSize(uMask,0));
  float bank=min(min(maskAt(uv+vec2(texel.x*2.,0.)),maskAt(uv-vec2(texel.x*2.,0.))),min(maskAt(uv+vec2(0.,texel.y*2.)),maskAt(uv-vec2(0.,texel.y*2.))));
  float edge=smoothstep(.05,.95,bank);
  float depth=smoothstep(.575,1.,uv.y);
  // Logarithmic perspective compresses distant ripples without broad diagonal slabs.
  vec2 plane=vec2((uv.x-.5)/mix(.24,1.,depth)*7.,log(1.+depth*9.)*8.);
  vec3 waves=waveField(plane,uTime);
  vec3 normal=normalize(vec3(-waves.y*edge,1.,-waves.z*edge));
  float fragments=noise(vec2(plane.x*6.,plane.y*8.)+vec2(uTime*.22,-uTime*.13));
  float crest=pow(clamp(.5+.5*waves.x,0.,1.),3.)*smoothstep(.10,.70,fragments);
  vec3 base=mix(vec3(.018,.051,.105),vec3(.18,.42,.55),uDay);
  base=mix(base,vec3(.22,.115,.17),uWarm*.28);
  base*=mix(1.12,.78,depth);
  vec2 reflected=vec2(uv.x+waves.x*.002*edge,clamp(1.30-uv.y+waves.z*.002*edge,0.,1.));
  vec4 terrain=texture(uTerrain,reflected);
  vec3 terrainColor=terrain.rgb*mix(vec3(.10,.19,.34),vec3(.72,.86,1.),uDay);
  base=mix(base,terrainColor,terrain.a*.13);
  // Pale broken crests contrast with coloured troughs; never a full-width stripe.
  base+=vec3(.10,.17,.21)*crest*edge*(.20+.80*uDay);
  base+=vec3(.009,.018,.024)*waves.x*edge;
  float sun=reflection(uv,normal,uSunPosition,uSunAltitude,uSunIntensity,crest,0.);
  float moon=reflection(uv,normal,uMoonPosition,uMoonAltitude,uMoonIntensity,crest,1.)*smoothstep(0.,.04,uMoonIllumination);
  vec3 color=base+uSunColor*sun*edge+uMoonColor*moon*edge;
  fragColor=vec4(clamp(color,0.,1.),mask);
}`;

/** One WebGL2 water context, presented directly by the browser compositor.
 * No readPixels, per-frame texture uploads, extra frame loop or React updates. */
export class LandscapeWaterGPU {
  readonly canvas:HTMLCanvasElement;
  private gl:WebGL2RenderingContext|null=null;
  private program:WebGLProgram|null=null;
  private textures:WebGLTexture[]=[];
  private uniforms=new Map<string,WebGLUniformLocation|null>();
  private lost=false;
  private failed=false;
  private assets:{terrain:CanvasImageSource;water:CanvasImageSource}|null=null;
  private loss=(e:Event)=>{e.preventDefault();this.lost=true;};
  private restore=()=>{this.lost=false;this.failed=false;this.program=null;this.textures=[];this.uniforms.clear();if(this.assets)this.initialize();};
  constructor(){
    this.canvas=document.createElement('canvas');
    this.canvas.addEventListener('webglcontextlost',this.loss);
    this.canvas.addEventListener('webglcontextrestored',this.restore);
    try{this.gl=this.canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});}catch(e){this.failed=true;this.canvas.dataset.error=String(e);}
  }
  setAssets(assets:{terrain:CanvasImageSource;water:CanvasImageSource}){this.assets=assets;this.release();this.failed=false;this.initialize();}
  private release(){const gl=this.gl;if(!gl)return;for(const texture of this.textures)gl.deleteTexture(texture);this.textures=[];if(this.program)gl.deleteProgram(this.program);this.program=null;this.uniforms.clear();}
  private initialize(){
    const gl=this.gl;if(!gl||this.lost||this.failed||!this.assets)return;
    const shaders:WebGLShader[]=[];
    try{
      for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,WATER_FRAGMENT]] as const){
        const shader=gl.createShader(kind);if(!shader)throw Error('shader allocation');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'shader compile');
      }
      const program=gl.createProgram();if(!program)throw Error('program allocation');this.program=program;
      shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'shader link');
      gl.useProgram(program);
      for(const [index,source] of [this.assets.water,this.assets.terrain].entries()){
        const texture=gl.createTexture();if(!texture)throw Error('texture allocation');this.textures.push(texture);
        gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source as TexImageSource);
        gl.uniform1i(this.uniform(index===0?'uMask':'uTerrain'),index);
      }
    }catch(e){this.canvas.dataset.error=String(e);this.release();this.failed=true;}
    finally{shaders.forEach(shader=>gl.deleteShader(shader));}
  }
  private uniform(name:string){if(!this.uniforms.has(name))this.uniforms.set(name,this.gl!.getUniformLocation(this.program!,name));return this.uniforms.get(name)!;}
  render(light:LandscapeLightingState,frame:{width:number;height:number;scale:number;x:number;y:number},quality:WaterQuality){
    const gl=this.gl;if(!gl||this.lost||this.failed)return false;if(!this.program)this.initialize();if(!this.program)return false;
    const q=WATER_QUALITY[quality],density=Math.min(q.scale,Math.sqrt(q.pixels/(frame.width*frame.height)));
    const width=Math.max(1,Math.floor(frame.width*density)),height=Math.max(1,Math.floor(frame.height*density));
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    gl.viewport(0,0,width,height);gl.useProgram(this.program);
    gl.uniform2f(this.uniform('uResolution'),width,height);
    gl.uniform4f(this.uniform('uFrame'),1000*frame.scale*density,(1000*1850/850)*frame.scale*density,frame.x*density,frame.y*density);
    gl.uniform1f(this.uniform('uTime'),light.time);gl.uniform1f(this.uniform('uQuality'),quality==='high'?2:quality==='medium'?1:0);
    gl.uniform1f(this.uniform('uDay'),light.sky.day);gl.uniform1f(this.uniform('uWarm'),light.sky.twilight);
    for(const [name,body] of [['Sun',light.sun],['Moon',light.moon]] as const){
      gl.uniform2f(this.uniform('u'+name+'Position'),body.x,body.y);gl.uniform1f(this.uniform('u'+name+'Altitude'),body.altitude);
      gl.uniform3fv(this.uniform('u'+name+'Color'),body.color);gl.uniform1f(this.uniform('u'+name+'Intensity'),body.intensity);
    }
    gl.uniform1f(this.uniform('uMoonIllumination'),light.moon.illumination);
    gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    const waterTop=Math.max(0,Math.min(height,(frame.y+frame.scale*(1000*1850/850)*.57)*density));
    gl.enable(gl.SCISSOR_TEST);gl.scissor(0,0,width,Math.ceil(height-waterTop));
    gl.drawArrays(gl.TRIANGLES,0,3);gl.disable(gl.SCISSOR_TEST);return true;
  }
  suspend(){this.release();this.canvas.width=this.canvas.height=1;}
  dispose(){this.release();this.canvas.removeEventListener('webglcontextlost',this.loss);this.canvas.removeEventListener('webglcontextrestored',this.restore);this.gl?.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;this.assets=null;this.canvas.width=this.canvas.height=1;this.canvas.remove();}
  diagnostics(){return {available:!!this.gl&&!this.failed,lost:this.lost,error:this.canvas.dataset.error,pixels:this.canvas.width*this.canvas.height};}
}
