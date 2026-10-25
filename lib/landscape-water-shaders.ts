import calibration from './landscape-water-calibration.json';
import waves from './landscape-water-spectrum.json';
/** GLSL ES 3.00. Relative coplanar reconstruction follows projectCelestial's
 * azimuth/elevation projection; no light corridor, animated texture or glitter mask. */
const projection=`
const float PI=3.141592653589793;
const float AZ_SPAN=${(calibration.azimuthSpanDegrees*Math.PI/180).toPrecision(12)};
const float HORIZON=${calibration.horizon.toPrecision(12)};
const float ALT_SPAN=${calibration.altitudeSpan.toPrecision(12)};
const float CAMERA_HEIGHT=${calibration.cameraHeight.toFixed(1)};
vec2 projectWater(vec3 p){float az=atan(p.x,p.z);float el=atan(p.y-CAMERA_HEIGHT,length(p.xz));return vec2(.5+az/AZ_SPAN,HORIZON-el/(PI*.5)*ALT_SPAN);}
vec2 unprojectWater(vec2 uv){float az=(uv.x-.5)*AZ_SPAN;float down=max(.012,(uv.y-HORIZON)/ALT_SPAN*(PI*.5));float r=CAMERA_HEIGHT/tan(down);return r*vec2(sin(az),cos(az));}
vec3 lightDirection(vec2 projected,float altitude){float az=(projected.x-.5)*AZ_SPAN;return vec3(sin(az)*cos(altitude),sin(altitude),cos(az)*cos(altitude));}
`;
// direction, wavelength, amplitude; each oscillator has the deep-water dispersion omega=sqrt(g*k).
// Emit explicit constant calls. Dynamic indexing of local GLSL arrays can spill
// large wave tables per fragment on mobile/SwiftShader drivers.
const number=(v:number)=>Number(v.toPrecision(10)).toString().includes('.')?v.toPrecision(10):v.toFixed(1);
const energy=(from:number)=>waves.slice(from).reduce((sum,w)=>sum+.5*(2*Math.PI/w[2]*w[3])**2,0);
const emit=(from:number,to:number)=>waves.slice(from,to).map((w,j)=>`addWave(rest,time,pixelDx,pixelDy,dt,bank,vec2(${number(w[0])},${number(w[1])}),${number(2*Math.PI/w[2])},${number(.65*Math.sqrt(9.81*2*Math.PI/w[2]))},${number(w[3])},${number((from+j)*1.713)},${number((from+j)*3.477)},displacement,tangent,bitangent,variance);`).join('\n');
const spectrum=`
void addWave(vec2 rest,float time,vec2 pixelDx,vec2 pixelDy,float dt,float bank,vec2 d,float k,float omega,float amp0,float seed,float groupSeed,
 inout vec3 displacement,inout vec3 tangent,inout vec3 bitangent,inout float variance){
 float amp=amp0*bank,slope=amp*k;
 float carrier=k*(abs(dot(d,pixelDx))+abs(dot(d,pixelDy)));
 if(carrier>4.8||omega*dt>3.14){variance+=.5*slope*slope;return;}
 vec2 crosswind=vec2(-d.y,d.x);
 // Dispersive packets travel at half phase velocity; lateral sidebands break
 // long parallel fronts. Different frequencies never share an artificial pulse.
 float group=k*.19*dot(d,rest)-omega*.095*time+groupSeed;
 float lateral=k*.23*dot(crosswind,rest)+seed;
 float envelope=.60+.28*sin(group)+.12*sin(lateral);
 vec2 ampGradient=amp*(.0532*k*cos(group)*d+.0276*k*cos(lateral)*crosswind);
 amp*=envelope;
 // Low-frequency crosswind sidebands bend the crests and break up parallel
 // interference grids. Different packets retain their own dispersive speed.
 float bend=k*.31*dot(crosswind,rest)-omega*.13*time+groupSeed;
 float bend2=k*.17*dot(d,rest)-omega*.07*time+seed;
 float phase=k*dot(d,rest)-omega*time+seed+2.1*sin(bend)+.65*sin(bend2);
 vec2 gradient=k*d+.651*k*cos(bend)*crosswind+.1105*k*cos(bend2)*d;
 float footprint=abs(dot(gradient,pixelDx))+abs(dot(gradient,pixelDy));
 float attenuation=(1.-smoothstep(1.2,3.14,footprint))*(1.-smoothstep(1.2,3.14,omega*dt));
 variance+=.5*slope*slope*(1.-attenuation*attenuation);
 amp*=attenuation;ampGradient*=attenuation;float q=.20,s=sin(phase),c=cos(phase);
 displacement+=vec3(q*amp*d.x*c,amp*s,q*amp*d.y*c);
 float gx=ampGradient.x*c-amp*s*gradient.x,gy=ampGradient.y*c-amp*s*gradient.y;
 tangent+=vec3(q*d.x*gx,ampGradient.x*s+amp*c*gradient.x,q*d.y*gx);
 bitangent+=vec3(q*d.x*gy,ampGradient.y*s+amp*c*gradient.y,q*d.y*gy);
}
void gerstner(vec2 rest,float time,int count,vec2 pixelDx,vec2 pixelDy,float dt,float bank,
 out vec3 displacement,out vec3 tangent,out vec3 bitangent,out float variance){
 displacement=vec3(0.);tangent=vec3(1.,0.,0.);bitangent=vec3(0.,0.,1.);
 variance=(count>=20?${number(energy(20))}:count>=16?${number(energy(16))}:count>=12?${number(energy(12))}:${number(energy(3))})*bank*bank*.56;
 if(bank<.001)return;
 ${emit(0,3)}
 if(count>=12){${emit(3,12)}}
 if(count>=16){${emit(12,16)}}
 if(count>=20){${emit(16,20)}}
}
`;
const optics=`
vec3 fresnelSchlick(float cosine){return vec3(.02037)+(1.-vec3(.02037))*pow(1.-clamp(cosine,0.,1.),5.);}
float distributionGGX(float NoH,float alpha){float a2=alpha*alpha;float den=(NoH*a2-NoH)*NoH+1.;return a2/(PI*max(den*den,1.e-8));}
float visibilitySmith(float NoV,float NoL,float alpha){float a2=alpha*alpha;float a=NoV*sqrt(NoL*NoL*(1.-a2)+a2);float b=NoL*sqrt(NoV*NoV*(1.-a2)+a2);return .5/max(a+b,1.e-5);}
vec3 evaluateLight(vec3 n,vec3 v,vec3 l,vec3 radiance,float alpha){
 float NoL=max(dot(n,l),0.),NoV=abs(dot(n,v))+.001;if(NoL<=0.)return vec3(0.);
 vec3 h=normalize(v+l);float NoH=max(dot(n,h),0.),VoH=max(dot(v,h),0.);
 return radiance*NoL*distributionGGX(NoH,alpha)*visibilitySmith(NoV,NoL,alpha)*fresnelSchlick(VoH);
}
vec3 evaluateDisc(vec3 n,vec3 v,vec3 l,vec3 radiance,float alpha,float quality,float radius){
 if(quality<.5)return evaluateLight(n,v,l,radiance,sqrt(alpha*alpha+radius*radius));
 vec3 a=normalize(cross(l,vec3(0.,1.,.001))),b=cross(a,l);
 vec3 sum=evaluateLight(n,v,normalize(l+a*radius),radiance,alpha)+evaluateLight(n,v,normalize(l-a*radius),radiance,alpha);
 if(quality<1.5)return sum*.5;
 return (sum+evaluateLight(n,v,normalize(l+b*radius),radiance,alpha)+evaluateLight(n,v,normalize(l-b*radius),radiance,alpha))*.25;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 displayColor(vec3 hdr){return pow(aces(max(hdr,0.)),vec3(1./2.2));}
`;
/** One-bounce screen-space ray tracing against an explicitly approximate depth
 * proxy. Offscreen/missing geometry falls back to the atmosphere, not fake hits. */
const rayScene=`
uniform sampler2D uSceneDepth;
uniform float uSceneEnabled;
float sceneRadius(vec4 s){return dot(s.rg,vec2(65280.,255.))/65535.*${calibration.sceneDepthExtent.toFixed(1)};}
bool scenePoint(vec3 p,out vec2 uv,out float delta){
 uv=projectWater(p);delta=-1.;
 if(uSceneEnabled<.5||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return false;
 vec4 depth=textureLod(uSceneDepth,uv,0.);delta=length(p.xz)-sceneRadius(depth);
 return depth.b>.55&&delta>.10;
}
float traceScene(vec3 origin,vec3 direction,int steps,out vec2 hit){
 float previous=0.;hit=vec2(0.);
 for(int i=0;i<12;i++){
  if(i>=steps)break;float t=.3*(exp2(float(i+1)/float(steps)*8.7)-1.);
  vec2 uv;float delta;
  if(scenePoint(origin+direction*t,uv,delta)){
   float lo=previous,hi=t;
   for(int j=0;j<4;j++){float mid=(lo+hi)*.5;vec2 q;float d;if(scenePoint(origin+direction*mid,q,d))hi=mid;else lo=mid;}
   scenePoint(origin+direction*hi,hit,delta);
   return 1.-smoothstep(.5,3.,delta);
  }
  previous=t;
 }
 return 0.;
}
float rayShadow(vec3 origin,vec3 direction,int steps){
 for(int i=0;i<4;i++){if(i>=steps)break;vec2 uv;float d;float t=2.*exp2(float(i)*1.7);if(scenePoint(origin+direction*t,uv,d))return .08;}
 return 1.;
}
`;
export const WATER_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUV;
uniform sampler2D uGeometry;
uniform sampler2D uPerspective;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
out vec2 vRest;
out vec3 vPosition;
${projection}
${spectrum}
vec2 geometry(vec2 uv){
 vec2 p=uv*vec2(textureSize(uGeometry,0))-.5;ivec2 i=ivec2(floor(p));vec2 f=fract(p);
 ivec2 last=textureSize(uGeometry,0)-1;
 vec2 a=texelFetch(uGeometry,clamp(i,ivec2(0),last),0).rg,b=texelFetch(uGeometry,clamp(i+ivec2(1,0),ivec2(0),last),0).rg;
 vec2 c=texelFetch(uGeometry,clamp(i+ivec2(0,1),ivec2(0),last),0).rg,d=texelFetch(uGeometry,clamp(i+1,ivec2(0),last),0).rg;
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
void main(){
 vRest=geometry(aUV);float bank=texture(uPerspective,aUV).g;
 vec3 displacement,t,b;float unused;
 gerstner(vRest,uTime,3,vec2(0.),vec2(0.),0.,bank,displacement,t,b,unused);
 vPosition=vec3(vRest.x,0.,vRest.y)+displacement;
 vec2 uv=projectWater(vPosition),screen=uv*uFrame.xy+uFrame.zw;
 gl_Position=vec4(screen.x/uResolution.x*2.-1.,1.-screen.y/uResolution.y*2.,0.,1.);
}`;
export const WATER_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform sampler2D uTerrain;
uniform sampler2D uClouds;
uniform sampler2D uPerspective;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
uniform float uQuality;
uniform float uFrameInterval;
uniform float uHdr;
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
in vec2 vRest;
in vec3 vPosition;
out vec4 fragColor;
${projection}
${spectrum}
${optics}
${rayScene}
vec3 skyRadiance(vec3 direction){
 float elevation=max(direction.y,0.);vec3 zenith=mix(vec3(.0018,.004,.012),vec3(.11,.31,.64),uDay);
 zenith=mix(zenith,vec3(.20,.045,.13),uWarm*.65);
 vec3 horizon=mix(vec3(.006,.012,.03),vec3(.60,.78,.91),uDay);
 horizon=mix(horizon,vec3(.80,.24,.075),uWarm*.84);
 vec3 sky=mix(horizon,zenith,smoothstep(0.,.75,elevation));
 vec2 reflected=vec2(.5+atan(direction.x,direction.z)/AZ_SPAN,HORIZON-asin(clamp(direction.y,-1.,1.))/(PI*.5)*ALT_SPAN);
 vec2 cloudUV=vec2(1.-abs(mod(reflected.x-uTime*${(calibration.cloudSpeed/1000).toFixed(8)},2.)-1.),reflected.y);vec4 cloud=texture(uClouds,cloudUV);
 float cloudAlpha=cloud.a;
 vec3 cloudLinear=pow(cloud.rgb,vec3(2.2));
 vec3 cloudLit=cloudLinear*mix(vec3(.025,.045,.09),vec3(.8),uDay);
 cloudLit=mix(cloudLit,cloudLinear*vec3(1.15,.43,.13),uWarm*.7);
 sky=mix(sky,cloudLit,cloudAlpha);
 return sky;
}
vec3 tracedRadiance(vec3 origin,vec3 direction){
 vec3 sky=skyRadiance(direction);if(uSceneEnabled<.5||uQuality<.5)return sky;
 vec2 hit;float weight=traceScene(origin,direction,uQuality>1.5?12:6,hit);
 vec3 terrain=pow(textureLod(uTerrain,hit,0.).rgb,vec3(2.2));
 vec3 tint=mix(vec3(.025,.045,.09),vec3(.6,.75,.85),uDay);
 tint=mix(tint,vec3(.82,.34,.13),uWarm*.7);
 return mix(sky,terrain*tint,weight);
}
void main(){
 vec2 uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec2 rest=unprojectWater(uv),dx=dFdx(rest),dy=dFdy(rest);
 float mask=texture(uMask,uv).a;if(mask<.004){fragColor=vec4(0.);return;}
 vec3 perspective=texture(uPerspective,uv).rgb;
 vec3 disp,t,b;float variance;int count=uQuality>1.5?20:uQuality>.5?16:12;
 gerstner(rest,uTime,count,dx,dy,uFrameInterval,perspective.g,disp,t,b,variance);
 vec3 position=vec3(rest.x,0.,rest.y)+disp;
 vec3 n=normalize(cross(b,t)),v=normalize(vec3(0.,CAMERA_HEIGHT,0.)-position);
 float roughness=.10+.018*perspective.r+.035*(.5+.5*sin(dot(rest,vec2(.43,.71))));
 // Unresolved spatial/temporal slopes broaden the microfacet lobe instead of flickering.
 float alpha=sqrt(pow(roughness,4.)+variance*.035+.000022);
 float NoV=abs(dot(n,v))+.001;vec3 F=fresnelSchlick(NoV),r=reflect(-v,n);
 vec3 reflectedSky=tracedRadiance(position+n*.04,r)*F;
 // Water absorbs light; sunset colour belongs to reflected sky/light, never
 // an emissive red fill. This remains blue-black when direct sources vanish.
 vec3 body=mix(vec3(.0005,.0015,.004),vec3(.003,.022,.035),uDay);
 vec3 radiance=(body*(1.-F)+reflectedSky)*perspective.b;
 // Keep midday highlights restrained; preserve warm detail around the sunset
 // core instead of clipping entire wave fronts to tone-mapped white.
 float solarExposure=mix(.15,1.,1.-smoothstep(.08,.45,uSunAltitude));
 if(uSunAltitude>0.&&uSunIntensity>.00001)radiance+=evaluateDisc(n,v,lightDirection(uSunPosition,uSunAltitude),uSunColor*uSunIntensity*8.*solarExposure,alpha,uQuality,.009);
 if(uMoonAltitude>0.&&uMoonIntensity>.00001&&uMoonIllumination>0.)radiance+=evaluateDisc(n,v,lightDirection(uMoonPosition,uMoonAltitude),uMoonColor*uMoonIntensity*1.2,alpha,uQuality,.008);
 float aerial=perspective.r*.07;
 radiance=mix(radiance,skyRadiance(vec3(0.,.06,1.))*.08,aerial);
 // Relative exposure is continuous through the existing solar state.
 radiance*=mix(2.4,1.10,uDay);
 radiance=min(radiance,vec3(60000.));
 fragColor=vec4(uHdr>.5?radiance:displayColor(radiance),mask);
}`;
export const SCREEN_VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
/** Cached deferred lighting of the camera-registered 3D depth surface. Material
 * normals retain photographic texture contrast instead of painting a colour veil. */
export const TERRAIN_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uTerrain;
uniform sampler2D uTerrainNormal;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uDay;
uniform float uWarm;
uniform float uQuality;
uniform vec2 uSunPosition;
uniform float uSunAltitude;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec2 uMoonPosition;
uniform float uMoonAltitude;
uniform vec3 uMoonColor;
uniform float uMoonIntensity;
out vec4 fragColor;
${projection}
${optics}
${rayScene}
void main(){
 vec2 uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec4 art=texture(uTerrain,uv);if(art.a<.004){fragColor=vec4(0.);return;}
 vec3 albedo=pow(art.rgb,vec3(2.2));
 vec3 n=normalize(texture(uTerrainNormal,uv).rgb*2.-1.+vec3(0.,.0001,0.));
 float radius=sceneRadius(texture(uSceneDepth,uv));
 float az=(uv.x-.5)*AZ_SPAN,el=clamp((HORIZON-uv.y)/ALT_SPAN*(PI*.5),-1.45,1.45);
 vec3 position=vec3(radius*sin(az),CAMERA_HEIGHT+radius*tan(el),radius*cos(az));
 vec3 ambient=mix(vec3(.018,.028,.065),vec3(.55,.65,.82),uDay);
 ambient=mix(ambient,vec3(.40,.20,.30),uWarm*.15)*(.55+.45*max(n.y,0.));
 vec3 lighting=ambient;
 if(uSunAltitude>0.&&uSunIntensity>.001){
  vec3 l=lightDirection(uSunPosition,uSunAltitude);float NoL=max(dot(n,l),0.);
  float shadow=uQuality>.5&&NoL>0.?rayShadow(position+n*.12,l,3):1.;
  lighting+=uSunColor*uSunIntensity*NoL*1.8*shadow;
 }
 if(uMoonAltitude>0.)lighting+=uMoonColor*uMoonIntensity*max(dot(n,lightDirection(uMoonPosition,uMoonAltitude)),0.)*.20;
 vec3 radiance=albedo*lighting;
 float haze=1.-exp(-radius*(.0008+.002*uWarm));
 vec3 air=mix(vec3(.005,.013,.035),vec3(.36,.49,.62),uDay);
 air=mix(air,vec3(.65,.28,.18),uWarm*.7);
 radiance=mix(radiance,air,haze*.6);
 fragColor=vec4(displayColor(radiance),art.a);
}`;
export const LIGHT_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uWater;
uniform sampler2D uTerrain;
uniform sampler2D uClouds;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform vec2 uWaterResolution;
uniform vec2 uSunPosition;
uniform float uSunAltitude;
uniform float uSunIntensity;
uniform float uTime;
uniform float uQuality;
uniform float uHdr;
out vec4 fragColor;
${projection}
${rayScene}
float cloudShadow(vec3 point,vec3 light){
 float distanceToLayer=max(0.,64.-point.y)/max(light.y,.025);
 vec2 p=projectWater(point+light*distanceToLayer);
 p.x=1.-abs(mod(p.x-uTime*${(calibration.cloudSpeed/1000).toFixed(8)},2.)-1.);
 return 1.-textureLod(uClouds,p,0.).a*.94;
}
vec3 bright(vec2 uv){vec4 s=texture(uWater,uv);float lum=dot(s.rgb,vec3(.2126,.7152,.0722));float threshold=uHdr>.5?1.25:.86;return s.rgb*min(max(lum-threshold,0.),4.)/max(lum,.0001)*s.a;}
void main(){
 vec2 texUV=gl_FragCoord.xy/uResolution;
 vec2 pixel=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);
 vec2 uv=(pixel-uFrame.zw)/uFrame.xy;
 vec3 bloom=vec3(0.);
 if(uQuality>.5){
  vec2 d=2./uWaterResolution;
  bloom=bright(texUV)*.28;
  bloom+=(bright(texUV+vec2(d.x,0.))+bright(texUV-vec2(d.x,0.))+bright(texUV+vec2(0.,d.y))+bright(texUV-vec2(0.,d.y)))*.12;
  bloom+=(bright(texUV+d)+bright(texUV-d)+bright(texUV+vec2(d.x,-d.y))+bright(texUV+vec2(-d.x,d.y)))*.06;
 }
 float shafts=0.;
 if(uSceneEnabled>.5&&uQuality>.5&&uSunAltitude>0.&&uSunIntensity>.001){
  float az=(uv.x-.5)*AZ_SPAN,el=(HORIZON-uv.y)/ALT_SPAN*(PI*.5);
  vec3 direction=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el));
  vec3 light=lightDirection(uSunPosition,uSunAltitude);
  vec4 depth=texture(uSceneDepth,uv);
  float farDistance=depth.b>.55?min(110.,sceneRadius(depth)/max(length(direction.xz),.05)):110.;
  float g=.72,mu=dot(direction,light);
  float phase=(1.-g*g)/(4.*PI*pow(max(.02,1.+g*g-2.*g*mu),1.5));
  int count=uQuality>1.5?12:6;float stepLength=farDistance/float(count),transmittance=1.;
  for(int i=0;i<12;i++){
   if(i>=count)break;vec3 p=vec3(0.,CAMERA_HEIGHT,0.)+direction*((float(i)+.5)*stepLength);
   float density=.006*exp(-max(p.y,0.)/16.)*smoothstep(-.5,.5,p.y);
   float extinction=exp(-density*stepLength);
   float shadow=rayShadow(p,light,uQuality>1.5?4:2)*cloudShadow(p,light);
   shafts+=transmittance*(1.-extinction)*shadow*phase;transmittance*=extinction;
  }
  shafts=min(.20,shafts*uSunIntensity*(1.-smoothstep(.12,.5,uSunAltitude))*2.2);
 }
 fragColor=vec4(bloom,shafts);
}`;
export const PRESENT_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uLitTerrain;
uniform float uTerrainEnabled;
uniform sampler2D uWater;
uniform sampler2D uLight;
uniform sampler2D uMask;
uniform sampler2D uTerrain;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform vec3 uSunColor;
uniform float uHdr;
out vec4 fragColor;
const float PI=3.141592653589793;
${optics}
void main(){
 vec2 texUV=gl_FragCoord.xy/uResolution;
 vec2 uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec4 water=texture(uWater,texUV),light=texture(uLight,texUV);
 float mask=texture(uMask,uv).a,alpha=min(mask,water.a);
 vec3 color=uHdr>.5?displayColor(water.rgb+light.rgb*.065):clamp(water.rgb+light.rgb*.06,0.,1.);
 float shaftAlpha=light.a;
 color=mix(color,uSunColor,shaftAlpha*.25);
 vec4 terrain=texture(uLitTerrain,texUV);terrain.a*=uTerrainEnabled;
 float surface=min(1.,alpha+terrain.a);
 float total=surface+shaftAlpha*(1.-surface);
 vec3 premult=(color*alpha+terrain.rgb*terrain.a)*(1.-shaftAlpha)+clamp(uSunColor,0.,1.)*shaftAlpha;
 fragColor=total>.00001?vec4(premult/total,total):vec4(0.);
}`;
