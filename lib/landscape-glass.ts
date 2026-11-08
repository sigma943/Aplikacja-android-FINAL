import type {GlassQuality} from './landscape-settings';
import type {LandscapeLightingState} from './landscape-lighting';

export const GLASS_QUALITY={
  eco:{scale:.42,interval:100,level:0},
  balanced:{scale:.72,interval:1000/30,level:1},
  ultra:{scale:1,interval:1000/60,level:2},
} as const;

const VERTEX=`#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;

const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uScene,uProfile;
uniform vec2 uPixels,uScreen,uSun;
uniform vec4 uPanel;
uniform vec3 uSunColor,uAmbient;
uniform float uRadius,uStrength,uSunlight,uRays,uSceneVisible,uBevel;
uniform int uQuality;
out vec4 fragColor;

vec3 backdrop(vec2 uv,vec2 bend,vec2 normal){
  vec3 sharp=texture(uScene,uv+bend).rgb;
  if(uQuality==0)return sharp;
  vec2 px=1./uScreen;
  vec2 tangent=vec2(-normal.y,normal.x)*px*2.;
  vec2 crossEdge=normal*px*2.;
  vec3 soft=sharp*.4+.15*(texture(uScene,uv+bend+tangent).rgb+
    texture(uScene,uv+bend-tangent).rgb+texture(uScene,uv+bend+crossEdge).rgb+
    texture(uScene,uv+bend-crossEdge).rgb);
  if(uQuality==1)return soft;
  vec2 split=normal*px*.95;
  vec3 dispersed=vec3(texture(uScene,uv+bend+split).r,sharp.g,texture(uScene,uv+bend-split).b);
  vec3 wide=.25*(texture(uScene,uv+bend+tangent+crossEdge).rgb+
    texture(uScene,uv+bend-tangent+crossEdge).rgb+texture(uScene,uv+bend+tangent-crossEdge).rgb+
    texture(uScene,uv+bend-tangent-crossEdge).rgb);
  return soft*.42+dispersed*.38+wide*.20;
}
float shafts(vec2 screen){
  vec2 delta=screen-uSun*uScreen;
  float angle=atan(delta.y,delta.x+.00001)/6.283185307;
  float beam=texture(uProfile,vec2(fract(angle+.5/float(textureSize(uProfile,0).x)),.5)).r;
  float d=length(delta)/(.91*length(uScreen));
  float falloff=d<.08?mix(.4,.87,d/.08):
    d<.30?mix(.87,.60,(d-.08)/.22):
    d<.63?mix(.60,.20,(d-.30)/.33):.20*(1.-smoothstep(.63,1.,d));
  return uRays*beam*falloff;
}
void main(){
  vec2 local=vec2(gl_FragCoord.x,uPixels.y-gl_FragCoord.y)*uPanel.zw/uPixels;
  vec2 point=local-.5*uPanel.zw;
  vec2 q=abs(point)-(.5*uPanel.zw-uRadius);
  vec2 corner=max(q,0.);
  float distance=length(corner)+min(max(q.x,q.y),0.)-uRadius;
  float coverage=1.-smoothstep(-.5,.5,distance);
  if(coverage<=0.)discard;
  vec2 axis=q.x>q.y?vec2(1.,0.):vec2(0.,1.);
  vec2 direction=(length(corner)>.001?normalize(corner):axis)*sign(point);
  float bevel=1.-smoothstep(0.,uBevel,max(0.,-distance));
  float slope=.91*bevel;
  vec3 normal=vec3(direction*slope,sqrt(1.-slope*slope));
  vec3 transmitted=refract(vec3(0.,0.,-1.),normal,1./1.5);
  vec2 bend=transmitted.xy/max(.25,-transmitted.z)*uBevel*2.;
  vec2 screen=uPanel.xy+local;
  vec2 uv=screen/uScreen;
  vec3 scene=uAmbient;
  if(uSceneVisible>.5)scene=backdrop(uv,bend/uScreen,direction);
  float fresnel=.04+.96*pow(1.-normal.z,5.);
  float lens=(.035+.26*bevel)*(1.-fresnel)*uStrength*uSceneVisible;
  vec2 towardSun=(uSun*uScreen-screen)/uScreen.y;
  vec3 light=normalize(vec3(towardSun,.11));
  vec3 halfAngle=normalize(light+vec3(0.,0.,1.));
  float specular=pow(max(0.,dot(normal,halfAngle)),uQuality==2?52.:32.);
  float grazing=.12+.88*fresnel;
  float highlight=bevel*(.11+.55*specular)*grazing*uSunlight*uStrength;
  float edge=bevel*bevel*(.04+.11*fresnel)*uStrength;
  float ray=shafts(screen+bend)*(1.-fresnel)*(.80+.18*bevel);
  if(uQuality>0)ray=mix(ray,shafts(screen+bend+direction*1.8),.22);
  vec3 reflected=mix(uAmbient,scene,uSceneVisible*.55);
  if(uSceneVisible>.5&&uQuality>0){
    reflected=mix(uAmbient,texture(uScene,uv-.68*bend/uScreen).rgb,.65);
  }
  vec3 transmittedLight=uSunColor*ray;
  if(uQuality==2&&uRays>0.){
    vec2 split=direction*.8*bevel;
    vec2 colors=vec2(shafts(screen+bend+split),shafts(screen+bend-split));
    transmittedLight=mix(transmittedLight,uSunColor*vec3(colors.x,ray,colors.y),.25*bevel);
  }
  float alpha=lens+edge+highlight+ray*uStrength;
  vec3 color=(scene*lens+reflected*edge+uSunColor*highlight+transmittedLight*uStrength)/max(.0001,alpha);
  fragColor=vec4(color,coverage*min(.52,alpha));
}`;

export type GlassPanel={
  canvas:HTMLCanvasElement;
  x:number;y:number;width:number;height:number;radius:number;
  bevel:number;
};
type GlassFrame={
  width:number;height:number;scale:number;quality:GlassQuality;panels:GlassPanel[];
  scene:HTMLCanvasElement|null;profile:Uint8Array<ArrayBuffer>;origin:{x:number;y:number};
  lighting:LandscapeLightingState;sunlight:number;rays:number;strength:number;
};

export class LandscapeGlass {
  private scratch=document.createElement('canvas');
  private gl:WebGL2RenderingContext|null=null;
  private program:WebGLProgram|null=null;
  private scene:WebGLTexture|null=null;
  private profile:WebGLTexture|null=null;
  private uniforms=new Map<string,WebGLUniformLocation|null>();
  private sceneWidth=0;
  private sceneHeight=0;
  private profileBytes:GlassFrame['profile']|undefined;
  private disposed=false;
  private static compile(gl:WebGL2RenderingContext,type:number,source:string){
    const shader=gl.createShader(type);
    if(!shader)return null;
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(gl.getShaderParameter(shader,gl.COMPILE_STATUS))return shader;
    gl.deleteShader(shader);
    return null;
  }
  constructor(){
    try{this.gl=this.scratch.getContext('webgl2',{alpha:true,antialias:false,depth:false,premultipliedAlpha:false});}catch{return;}
    this.scratch.addEventListener('webglcontextlost',event=>event.preventDefault());
    this.scratch.addEventListener('webglcontextrestored',()=>this.initialize());
    this.initialize();
  }
  private initialize(){
    const gl=this.gl;
    if(!gl||this.disposed)return;
    this.sceneWidth=this.sceneHeight=0;
    this.profileBytes=undefined;
    this.program=null;this.uniforms.clear();
    const vertex=LandscapeGlass.compile(gl,gl.VERTEX_SHADER,VERTEX);
    const fragment=LandscapeGlass.compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
    const program=gl.createProgram();
    if(program&&vertex&&fragment){
      gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
      if(gl.getProgramParameter(program,gl.LINK_STATUS))this.program=program;
    }
    gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!this.program){gl.deleteProgram(program);return;}
    this.scene=gl.createTexture();this.profile=gl.createTexture();
    gl.useProgram(this.program);
    for(const name of ['uScene','uProfile','uPixels','uScreen','uSun','uPanel','uSunColor','uAmbient','uRadius','uStrength','uSunlight','uRays','uSceneVisible','uBevel','uQuality']){
      this.uniforms.set(name,gl.getUniformLocation(this.program,name));
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.scene);
    this.configureTexture(gl,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.profile);
    this.configureTexture(gl,gl.REPEAT);
  }
  private configureTexture(gl:WebGL2RenderingContext,wrapS:number){
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrapS);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  get available(){return !!this.program&&!!this.scene&&!!this.profile&&!this.gl?.isContextLost();}
  draw(frame:GlassFrame){
    const gl=this.gl;
    if(!gl||!this.available)return false;
    const {panels,scene,origin,lighting,quality,scale}=frame;
    const pixels=(size:number)=>Math.max(1,Math.round(size*scale));
    const width=pixels(Math.max(...panels.map(panel=>panel.width)));
    const height=pixels(Math.max(...panels.map(panel=>panel.height)));
    if(this.scratch.width!==width)this.scratch.width=width;
    if(this.scratch.height!==height)this.scratch.height=height;
    const u=(name:string)=>this.uniforms.get(name)??null;
    gl.activeTexture(gl.TEXTURE0);
    if(scene&&this.sceneWidth===scene.width&&this.sceneHeight===scene.height){
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,scene);
    }else if(scene){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scene);
      this.sceneWidth=scene.width;this.sceneHeight=scene.height;
    }else if(this.sceneWidth!==1||this.sceneHeight!==1){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      this.sceneWidth=this.sceneHeight=1;
    }
    if(this.profileBytes!==frame.profile){
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,frame.profile.length,1,0,gl.RED,gl.UNSIGNED_BYTE,frame.profile);
      this.profileBytes=frame.profile;
    }
    gl.uniform1i(u('uScene'),0);gl.uniform1i(u('uProfile'),1);
    gl.uniform2f(u('uScreen'),frame.width,frame.height);gl.uniform2f(u('uSun'),origin.x,origin.y);
    gl.uniform3fv(u('uSunColor'),lighting.sun.color);gl.uniform3fv(u('uAmbient'),lighting.ambient.color);
    gl.uniform1f(u('uSceneVisible'),Number(!!scene));gl.uniform1f(u('uSunlight'),frame.sunlight);
    gl.uniform1f(u('uRays'),frame.rays);gl.uniform1f(u('uStrength'),frame.strength);
    gl.uniform1i(u('uQuality'),GLASS_QUALITY[quality].level);
    for(const panel of panels){
      const w=pixels(panel.width),h=pixels(panel.height);
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(u('uPixels'),w,h);gl.uniform4f(u('uPanel'),panel.x,panel.y,panel.width,panel.height);
      gl.uniform1f(u('uRadius'),panel.radius);gl.uniform1f(u('uBevel'),panel.bevel);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const target=panel.canvas,context=target.getContext('2d');
      if(!context)continue;
      if(target.width!==w)target.width=w;
      if(target.height!==h)target.height=h;
      context.globalCompositeOperation='copy';
      context.drawImage(this.scratch,0,height-h,w,h,0,0,w,h);
      target.hidden=false;
    }
    return true;
  }
  dispose(){
    this.disposed=true;
    const gl=this.gl;
    if(!gl)return;
    gl.deleteTexture(this.scene);gl.deleteTexture(this.profile);gl.deleteProgram(this.program);
    this.program=null;
    this.scratch.width=this.scratch.height=1;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
