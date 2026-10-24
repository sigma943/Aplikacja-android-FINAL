import calibration from './landscape-water-calibration.json';
/** GLSL ES 3.00. Relative coplanar reconstruction follows projectCelestial's
 * azimuth/elevation projection; no light corridor, animated texture or glitter mask. */
const projection=`
const float PI=3.141592653589793;
const float AZ_SPAN=${(calibration.azimuthSpanDegrees*Math.PI/180).toPrecision(12)};
const float CAMERA_HEIGHT=${calibration.cameraHeight.toFixed(1)};
vec2 projectWater(vec3 p){float az=atan(p.x,p.z);float el=atan(p.y-CAMERA_HEIGHT,length(p.xz));return vec2(.5+az/AZ_SPAN,.55-el/(PI*.5)*.49);}
vec2 unprojectWater(vec2 uv){float az=(uv.x-.5)*AZ_SPAN;float down=max(.012,(uv.y-.55)/.49*(PI*.5));float r=CAMERA_HEIGHT/tan(down);return r*vec2(sin(az),cos(az));}
vec3 lightDirection(vec2 projected,float altitude){float az=(projected.x-.5)*AZ_SPAN;return vec3(sin(az)*cos(altitude),sin(altitude),cos(az)*cos(altitude));}
`;
// direction, wavelength, amplitude; each oscillator has the deep-water dispersion omega=sqrt(g*k).
const spectrum=`
const vec4 WAVES[24]=vec4[24](vec4(0.810000,0.586000,5.300000,0.0150000),vec4(-0.290000,0.957000,2.130000,0.0100000),vec4(0.560000,0.828000,0.970000,0.0080000),vec4(0.120000,0.993000,0.530000,0.0080000),vec4(0.297018,0.954872,0.404754,0.0086287),vec4(-0.194010,0.981000,0.360410,0.0074322),vec4(-0.592307,0.805712,0.317489,0.0068812),vec4(-0.235285,0.971926,0.273392,0.0051557),vec4(0.135575,0.990767,0.223782,0.0044277),vec4(0.986896,0.161355,0.191303,0.0034828),vec4(-0.367398,0.930064,0.178533,0.0036564),vec4(0.871007,0.491271,0.149302,0.0034069),vec4(-0.462735,0.886497,0.124181,0.0025501),vec4(0.992628,0.121203,0.115517,0.0023474),vec4(0.295286,0.955409,0.095185,0.0016498),vec4(0.256914,0.966434,0.085229,0.0018933),vec4(0.941474,0.337085,0.073625,0.0012892),vec4(-0.721479,0.692436,0.062218,0.0013925),vec4(-0.225035,0.974351,0.055504,0.0009942),vec4(0.997656,-0.068435,0.047106,0.0009962),vec4(0.633985,0.773345,0.038421,0.0007220),vec4(-0.244595,0.969625,0.033971,0.0007109),vec4(0.935421,0.353536,0.028932,0.0006610),vec4(-0.633929,0.773391,0.026053,0.0005680));
void gerstner(vec2 rest,float time,int count,vec2 pixelDx,vec2 pixelDy,float dt,float bank,
 out vec3 displacement,out vec3 tangent,out vec3 bitangent,out float variance){
 displacement=vec3(0.);tangent=vec3(1.,0.,0.);bitangent=vec3(0.,0.,1.);variance=0.;
 for(int i=0;i<24;i++){
  vec2 d=normalize(WAVES[i].xy);float k=2.*PI/WAVES[i].z,amp=WAVES[i].w*bank;
  if(i>=count){variance+=.5*amp*amp*k*k;continue;}
  float omega=sqrt(9.81*k);
  float carrierFootprint=k*(abs(dot(d,pixelDx))+abs(dot(d,pixelDy)));
  if(carrierFootprint>4.8||omega*dt>3.14){variance+=.5*amp*amp*k*k;continue;}
  vec2 crosswind=vec2(-d.y,d.x);
  // A transverse sideband forms finite curved wave groups. Its gradient is
  // differentiated below, so normals still come from this displaced surface.
  float group=k*.37*dot(crosswind,rest)-omega*.17*time+float(i)*3.477;
  float phase=k*dot(d,rest)-omega*time+float(i)*1.713+.9*sin(group);
  vec2 gradient=k*d+k*.333*cos(group)*crosswind;
  float footprint=abs(dot(gradient,pixelDx))+abs(dot(gradient,pixelDy));
  float attenuation=(1.-smoothstep(1.2,3.14,footprint))*(1.-smoothstep(1.2,3.14,omega*dt));
  float slope=amp*k;variance+=.5*slope*slope*(1.-attenuation*attenuation);
  amp*=attenuation;float q=.20,s=sin(phase),c=cos(phase);
  displacement+=vec3(q*amp*d.x*c,amp*s,q*amp*d.y*c);
  tangent+=vec3(-q*amp*d.x*s*gradient.x,amp*c*gradient.x,-q*amp*d.y*s*gradient.x);
  bitangent+=vec3(-q*amp*d.x*s*gradient.y,amp*c*gradient.y,-q*amp*d.y*s*gradient.y);
 }
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
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 displayColor(vec3 hdr){return pow(aces(max(hdr,0.)),vec3(1./2.2));}
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
vec3 skyRadiance(vec3 direction){
 float elevation=max(direction.y,0.);vec3 zenith=mix(vec3(.0018,.004,.012),vec3(.11,.31,.64),uDay);
 vec3 horizon=mix(vec3(.006,.012,.03),vec3(.60,.78,.91),uDay);
 horizon=mix(horizon,vec3(.80,.24,.075),uWarm*.84);
 vec3 sky=mix(horizon,zenith,smoothstep(0.,.75,elevation));
 vec2 reflected=vec2(.5+atan(direction.x,direction.z)/AZ_SPAN,.55-asin(clamp(direction.y,-1.,1.))/(PI*.5)*.49);
 vec2 cloudUV=vec2(fract(reflected.x-uTime*.012),reflected.y);vec4 cloud=texture(uClouds,cloudUV);
 float cloudAlpha=cloud.a*smoothstep(0.,.09,cloudUV.x)*(1.-smoothstep(.91,1.,cloudUV.x));
 vec3 cloudLinear=pow(cloud.rgb,vec3(2.2));
 vec3 cloudLit=cloudLinear*mix(vec3(.025,.045,.09),vec3(.8),uDay);
 cloudLit=mix(cloudLit,cloudLinear*vec3(1.15,.43,.13),uWarm*.7);
 sky=mix(sky,cloudLit,cloudAlpha);
 vec4 terrain=texture(uTerrain,reflected);vec3 terrainLinear=pow(terrain.rgb,vec3(2.2));
 vec3 shaded=terrainLinear*mix(vec3(.025,.045,.09),vec3(.6,.75,.85),uDay);
 return mix(sky,shaded,terrain.a);
}
void main(){
 vec2 uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec2 rest=unprojectWater(uv),dx=dFdx(rest),dy=dFdy(rest);
 float mask=texture(uMask,uv).a;if(mask<.004){fragColor=vec4(0.);return;}
 vec3 perspective=texture(uPerspective,uv).rgb;
 vec3 disp,t,b;float variance;int count=uQuality>1.5?24:uQuality>.5?18:12;
 gerstner(rest,uTime,count,dx,dy,uFrameInterval,perspective.g,disp,t,b,variance);
 vec3 n=normalize(cross(b,t)),v=normalize(vec3(0.,CAMERA_HEIGHT,0.)-vPosition);
 float roughness=.10+.018*perspective.r+.035*(.5+.5*sin(dot(rest,vec2(.43,.71))));
 // Unresolved spatial/temporal slopes broaden the microfacet lobe instead of flickering.
 float alpha=sqrt(pow(roughness,4.)+variance*.10+.000022);
 float NoV=abs(dot(n,v))+.001;vec3 F=fresnelSchlick(NoV),r=reflect(-v,n);
 vec3 reflectedSky=skyRadiance(r)*F;
 vec3 body=mix(vec3(.001,.005,.012),vec3(.012,.095,.135),uDay);
 body=mix(body,vec3(.045,.018,.015),uWarm*.30);
 vec3 radiance=(body*(1.-F)+reflectedSky)*perspective.b;
 if(uSunAltitude>0.&&uSunIntensity>.00001)radiance+=evaluateLight(n,v,lightDirection(uSunPosition,uSunAltitude),uSunColor*uSunIntensity*36.,alpha);
 if(uMoonAltitude>0.&&uMoonIntensity>.00001&&uMoonIllumination>0.)radiance+=evaluateLight(n,v,lightDirection(uMoonPosition,uMoonAltitude),uMoonColor*uMoonIntensity*3.,alpha);
 float aerial=perspective.r*.07;
 radiance=mix(radiance,skyRadiance(vec3(0.,.06,1.))*.08,aerial);
 // Relative exposure is continuous through the existing solar state.
 radiance*=mix(2.4,1.10,uDay);
 radiance=min(radiance,vec3(60000.));
 fragColor=vec4(uHdr>.5?radiance:displayColor(radiance),mask);
}`;
export const SCREEN_VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}`;
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
float visibility(vec2 uv){
 float terrain=texture(uTerrain,uv).a;vec2 cloudUV=vec2(fract(uv.x-uTime*.012),uv.y);
 float cloud=texture(uClouds,cloudUV).a*smoothstep(0.,.09,cloudUV.x)*(1.-smoothstep(.91,1.,cloudUV.x));
 return (1.-terrain)*(1.-cloud*.94);
}
vec3 bright(vec2 uv){vec4 s=texture(uWater,uv);float lum=dot(s.rgb,vec3(.2126,.7152,.0722));float threshold=uHdr>.5?1.25:.86;return s.rgb*max(lum-threshold,0.)/max(lum,.0001)*s.a;}
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
 if(uSunAltitude>0.&&uSunIntensity>.001&&uv.y<.60){
  float low=1.-smoothstep(.08,.36,uSunAltitude);int samples=uQuality>1.5?8:uQuality>.5?6:4;
  vec2 ray=uSunPosition-uv;
  for(int i=0;i<8;i++){if(i>=samples)break;float t=(float(i)+.5)/float(samples);vec2 q=uv+ray*t*.94;
   shafts+=visibility(q)*exp(-length(q-uSunPosition)*10.)/float(samples);
  }
  shafts*=visibility(uv)*uSunIntensity*low*exp(-length(ray)*1.8)*.16;
 }
 fragColor=vec4(bloom,shafts);
}`;
export const PRESENT_FRAGMENT=`#version 300 es
precision highp float;
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
 vec3 color=uHdr>.5?displayColor(water.rgb+light.rgb*.075):clamp(water.rgb+light.rgb*.06,0.,1.);
 float shaftAlpha=light.a*(1.-texture(uTerrain,uv).a)*(1.-smoothstep(.56,.62,uv.y));
 float total=alpha+shaftAlpha*(1.-alpha);
 vec3 premult=color*alpha+clamp(uSunColor,0.,1.)*shaftAlpha*(1.-alpha);
 fragColor=total>.00001?vec4(premult/total,total):vec4(0.);
}`;
