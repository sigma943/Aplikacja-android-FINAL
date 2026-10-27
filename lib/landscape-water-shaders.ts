import calibration from './landscape-water-calibration.json';
import waves from './landscape-water-spectrum.json';
import {SCENE_GRID} from './landscape-scene-geometry';
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
vec3 lightDirection(vec2 projected,float altitude){float az=(projected.x-.5)*AZ_SPAN;float apparent=clamp((HORIZON-projected.y)/ALT_SPAN*(PI*.5),.001,PI*.5-.005);return vec3(sin(az)*cos(apparent),sin(apparent),cos(az)*cos(apparent));}
`;
// Sheltered river: low swell, short crossed ripples, no dominant ocean-scale wave.
// direction, wavelength, amplitude; dispersion follows sqrt(g*k) with a cinematic time scale.
// Emit explicit constant calls. Dynamic indexing of local GLSL arrays can spill
// large wave tables per fragment on mobile/SwiftShader drivers.
const number=(v:number)=>Number(v.toPrecision(10)).toString().includes('.')?v.toPrecision(10):v.toFixed(1);
const energy=(from:number)=>waves.slice(from).reduce((sum,w)=>sum+.5*(2*Math.PI/w[2]*w[3])**2,0);
const emit=(from:number,to:number)=>waves.slice(from,to).map((w,j)=>`addWave(rest,time,pixelDx,pixelDy,dt,bank,vec2(${number(w[0])},${number(w[1])}),${number(2*Math.PI/w[2])},${number(.48*Math.sqrt(9.81*2*Math.PI/w[2]))},${number(w[3])},${number((from+j)*1.713)},${number((from+j)*3.477)},displacement,tangent,bitangent,variance);`).join('\n');
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
 float phase=k*dot(d,rest)-omega*time+seed+.75*sin(bend)+.35*sin(bend2);
 vec2 gradient=k*d+.2325*k*cos(bend)*crosswind+.0595*k*cos(bend2)*d;
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
 variance=(count>=24?0.:count>=20?${number(energy(20))}:count>=16?${number(energy(16))}:count>=12?${number(energy(12))}:${number(energy(3))})*bank*bank*.56;
 if(bank<.001)return;
 ${emit(0,3)}
 if(count>=12){${emit(3,12)}}
 if(count>=16){${emit(12,16)}}
 if(count>=20){${emit(16,20)}}
 if(count>=24){${emit(20,24)}}
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
// Broad, wind-oriented Gaussian slope distribution (Beckmann). The narrow
// GGX lobe retains individual facets; this lobe supplies a coherent light path.
vec3 evaluateWaterSheen(vec3 n,vec3 v,vec3 l,vec3 radiance,float variance){
 float NoL=max(dot(n,l),0.),NoV=max(dot(n,v),.001);if(NoL<=0.)return vec3(0.);
 vec3 h=normalize(v+l),tx=normalize(vec3(1.,0.,0.)-n*n.x),tz=cross(n,tx);
 float NoH=max(dot(n,h),.001),VoH=max(dot(v,h),0.);
 float unresolved=sqrt(max(variance,0.));vec2 spread=vec2(.14,.20)+unresolved*vec2(.24,.18);
 vec2 slope=vec2(dot(h,tx),dot(h,tz))/(NoH*spread);
 float D=exp(-dot(slope,slope))/(PI*spread.x*spread.y*pow(NoH,4.));
 return radiance*NoL*D*visibilitySmith(NoV,NoL,sqrt(spread.x*spread.y))*fresnelSchlick(VoH);
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 displayColor(vec3 hdr){return pow(aces(max(hdr,0.)),vec3(1./2.2));}
// Preserve the hue of gold/pink/silver in the shoulder instead of mapping each
// high-energy channel independently to white. Only the hottest core desaturates.
vec3 waterDisplayColor(vec3 hdr){
 hdr=max(hdr,0.);float peak=max(max(hdr.r,hdr.g),hdr.b);
 vec3 hue=hdr/max(peak,.00001);
 hue=mix(hue,vec3(1.),smoothstep(6.,60.,peak)*.12);
 vec3 chroma=pow(clamp(hue*aces(vec3(peak)).r,0.,1.),vec3(1./2.2));
 return mix(displayColor(hdr),chroma,.78);
}

`;
/** The same solid heightfield drives direct-light occlusion and the mesh. */
const solidScene=`
uniform sampler2D uSceneHeight;
uniform float uScene3D;
float solidHeight(vec2 p){
 float r=length(p);vec2 uv=vec2(.5+atan(p.x,p.y)/${SCENE_GRID.span.toFixed(8)},log(max(r,.001)/${SCENE_GRID.near.toFixed(8)})/${Math.log(SCENE_GRID.far/SCENE_GRID.near).toFixed(10)});
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return -8.;
 vec2 grid=uv*vec2(textureSize(uSceneHeight,0)-1);ivec2 a=ivec2(floor(grid)),last=textureSize(uSceneHeight,0)-1;vec2 f=fract(grid);
 float h00=texelFetch(uSceneHeight,clamp(a,ivec2(0),last),0).r,h10=texelFetch(uSceneHeight,clamp(a+ivec2(1,0),ivec2(0),last),0).r;
 float h01=texelFetch(uSceneHeight,clamp(a+ivec2(0,1),ivec2(0),last),0).r,h11=texelFetch(uSceneHeight,clamp(a+1,ivec2(0),last),0).r;
 return mix(mix(h00,h10,f.x),mix(h01,h11,f.x),f.y);
}
float solidShadow(vec3 p,vec3 direction,int count){
 if(uScene3D<.5||direction.y<=0.)return 1.;
 float visibility=1.;
 for(int i=0;i<4;i++){if(i>=count)break;float t=1.5*exp2(float(i)*1.9);vec3 q=p+direction*t;visibility=min(visibility,mix(.12,1.,smoothstep(-.18,.35,q.y-solidHeight(q.xz))));}
 return visibility;
}
`;
/** One-bounce screen-space ray tracing against an explicitly approximate depth
 * proxy. Offscreen/missing geometry falls back to the atmosphere, not fake hits. */
const rayScene=`
${solidScene}
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
 if(uScene3D>.5)return solidShadow(origin,direction,steps);
 for(int i=0;i<4;i++){if(i>=steps)break;vec2 uv;float d;float t=2.*exp2(float(i)*1.7);if(scenePoint(origin+direction*t,uv,d))return .08;}
 return 1.;
}
`;
export const WATER_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUV;
uniform sampler2D uGeometry;
uniform sampler2D uPerspective;
uniform sampler2D uPlanar;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
out vec2 vRest;
uniform float uWaveSpeedOffset;
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
 gerstner(vRest,uTime*max(0.,1.+uWaveSpeedOffset),3,vec2(0.),vec2(0.),0.,bank,displacement,t,b,unused);
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
uniform sampler2D uPlanar;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uTime;
uniform float uQuality;
uniform float uFrameInterval;
uniform float uWaveSpeedOffset;
uniform float uReflectionsOffset;
uniform float uExposureOffset;
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
 horizon=mix(horizon,vec3(.85,.20,.15),uWarm*.84);
 vec3 sky=mix(horizon,zenith,smoothstep(0.,.75,elevation));
 vec2 reflected=vec2(.5+atan(direction.x,direction.z)/AZ_SPAN,HORIZON-asin(clamp(direction.y,-1.,1.))/(PI*.5)*ALT_SPAN);
 vec2 cloudUV=vec2(1.-abs(mod(reflected.x-uTime*${(calibration.cloudSpeed/1000).toFixed(8)},2.)-1.),reflected.y);vec4 cloud=texture(uClouds,cloudUV);
 float cloudAlpha=cloud.a;
 vec3 cloudLinear=pow(cloud.rgb,vec3(2.2));
 vec3 cloudLit=cloudLinear*mix(vec3(.025,.045,.09),vec3(.8),uDay);
 cloudLit=mix(cloudLit,cloudLinear*vec3(1.10,.34,.25),uWarm*.7);
 sky=mix(sky,cloudLit,cloudAlpha);
 return sky;
}
vec3 tracedRadiance(vec3 origin,vec3 direction,float roughness){
 vec3 sky=skyRadiance(direction);
 if(uScene3D>.5){
  // Virtual objects are mirrored about Y=0. The reflected ray samples a
  // second camera render of actual meshes, including occluded back slopes.
  vec2 uv=vec2(.5+atan(direction.x,direction.z)/AZ_SPAN,HORIZON+asin(clamp(direction.y,-1.,1.))/(PI*.5)*ALT_SPAN);
  vec2 screen=uv*uFrame.xy+uFrame.zw;
  vec2 sampleUV=vec2(screen.x/uResolution.x,1.-screen.y/uResolution.y);
  if(any(lessThan(sampleUV,vec2(0.)))||any(greaterThan(sampleUV,vec2(1.))))return sky;
  vec2 dx=dFdx(sampleUV)*vec2(textureSize(uPlanar,0)),dy=dFdy(sampleUV)*vec2(textureSize(uPlanar,0));
 float lod=max(.25+roughness*5.,.5*log2(max(1.,max(dot(dx,dx),dot(dy,dy)))));
  vec4 reflected=textureLod(uPlanar,sampleUV,lod);return mix(sky,reflected.rgb,reflected.a);
 }
 if(uSceneEnabled<.5||uQuality<.5)return sky;
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
 vec3 disp,t,b;float variance;int count=uQuality>1.5?24:uQuality>.5?20:16;
 gerstner(rest,uTime*max(0.,1.+uWaveSpeedOffset),count,dx,dy,uFrameInterval*max(0.,1.+uWaveSpeedOffset),perspective.g,disp,t,b,variance);
 vec3 position=vec3(rest.x,0.,rest.y)+disp;
 vec3 n=normalize(cross(b,t)),v=normalize(vec3(0.,CAMERA_HEIGHT,0.)-position);
 float roughness=.082+.022*perspective.r+.028*(.5+.5*sin(dot(rest,vec2(.43,.71))));
 // Unresolved spatial/temporal slopes broaden the microfacet lobe instead of flickering.
 float alpha=sqrt(pow(roughness,4.)+variance*.045+.000050);
 float NoV=abs(dot(n,v))+.001;vec3 F=fresnelSchlick(NoV),r=reflect(-v,n);
 vec3 reflectedSky=tracedRadiance(position+n*.04,r,roughness)*F*pow(max(0.,1.+uReflectionsOffset),2.);
 // Water absorbs light; sunset colour belongs to reflected sky/light, never
 // an emissive red fill. This remains blue-black when direct sources vanish.
 vec3 body=mix(vec3(.0005,.0015,.004),vec3(.004,.048,.090),uDay);
 vec3 radiance=(body*(1.-F)+reflectedSky)*perspective.b;
 // Keep midday highlights restrained; preserve warm detail around the sunset
 // core instead of clipping entire wave fronts to tone-mapped white.
 float solarExposure=mix(.65,1.85,1.-smoothstep(.08,.55,uSunAltitude));
 if(uSunAltitude>-.01454&&uSunIntensity>.00001){
  vec3 l=lightDirection(uSunPosition,uSunAltitude),glossNormal=normalize(mix(vec3(0.,1.,0.),n,.94));
  vec3 incident=uSunColor*uSunIntensity*13.*solarExposure*mix(.18,1.,solidShadow(position+n*.04,l,uQuality>.5?4:2));
  radiance+=(evaluateDisc(glossNormal,v,l,incident,alpha,uQuality,.006)*.80+evaluateWaterSheen(glossNormal,v,l,incident,variance)*.20)*pow(max(0.,1.+uReflectionsOffset),2.);
 }
 if(uMoonAltitude>0.&&uMoonIntensity>.00001&&uMoonIllumination>0.)radiance+=evaluateDisc(normalize(mix(vec3(0.,1.,0.),n,.85)),v,lightDirection(uMoonPosition,uMoonAltitude),uMoonColor*uMoonIntensity*1.2*solidShadow(position+n*.04,lightDirection(uMoonPosition,uMoonAltitude),uQuality>.5?4:2),alpha,uQuality,.009)*pow(max(0.,1.+uReflectionsOffset),2.);
 float aerial=perspective.r*.11;
 radiance=mix(radiance,skyRadiance(vec3(0.,.06,1.))*.08,aerial);
 // Relative exposure is continuous through the existing solar state.
 radiance*=mix(2.4,1.10,uDay)*max(0.,1.+uExposureOffset);
 radiance=min(radiance,vec3(60000.));
 fragColor=vec4(uHdr>.5?radiance:waterDisplayColor(radiance),mask);
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
 if(uSunAltitude>-.01454&&uSunIntensity>.001){
  vec3 l=lightDirection(uSunPosition,uSunAltitude);float NoL=max(dot(n,l),0.);
  float shadow=uQuality>.5&&NoL>0.?rayShadow(position+n*.12,l,3):1.;
  lighting+=uSunColor*uSunIntensity*NoL*1.8*shadow;
 }
 if(uMoonAltitude>0.)lighting+=uMoonColor*uMoonIntensity*max(dot(n,lightDirection(uMoonPosition,uMoonAltitude)),0.)*.20;
 vec3 radiance=albedo*lighting;
 float haze=1.-exp(-radius*(.0015+.0032*uWarm));
 vec3 air=mix(vec3(.005,.013,.035),vec3(.36,.49,.62),uDay);
 air=mix(air,vec3(.65,.28,.18),uWarm*.7);
 radiance=mix(radiance,air,haze*.64);
 fragColor=vec4(displayColor(radiance),art.a);
}`;
export const LIGHT_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uWater;
uniform sampler2D uTerrain;
uniform sampler2D uClouds;
uniform float uRaysOffset;
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
void main(){
 vec2 pixel=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);
 vec2 uv=(pixel-uFrame.zw)/uFrame.xy;
 float shafts=0.;
 float rayStrength=pow(max(0.,1.+uRaysOffset),2.);
 if(uSceneEnabled>.5&&uQuality>.5&&uSunAltitude>-.01454&&uSunIntensity>.001){
  float az=(uv.x-.5)*AZ_SPAN,el=(HORIZON-uv.y)/ALT_SPAN*(PI*.5);
  vec3 direction=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el));
  vec3 light=lightDirection(uSunPosition,uSunAltitude);
  vec4 depth=texture(uSceneDepth,uv);
  float farDistance=depth.b>.55?min(110.,sceneRadius(depth)/max(length(direction.xz),.05)):110.;
  float g=.64,mu=dot(direction,light);
  float phase=(1.-g*g)/(4.*PI*pow(max(.02,1.+g*g-2.*g*mu),1.5));
  int count=uQuality>1.5?12:6;float stepLength=farDistance/float(count),transmittance=1.;
  for(int i=0;i<12;i++){
   if(i>=count)break;vec3 p=vec3(0.,CAMERA_HEIGHT,0.)+direction*((float(i)+.5)*stepLength);
   float density=.0055*exp(-max(p.y,0.)/12.)*smoothstep(-.5,.5,p.y);
   float extinction=exp(-density*stepLength);
   float shadow=rayShadow(p,light,uQuality>1.5?4:2)*cloudShadow(p,light);
   shafts+=transmittance*(1.-extinction)*shadow*phase;transmittance*=extinction;
  }
  shafts=min(.18,shafts*uSunIntensity*(1.-smoothstep(.12,.5,uSunAltitude))*2.5);
 }
 // Crepuscular rays follow the visible Sun and sample the same terrain/cloud
 // occluders. Radial visibility varies across cloud gaps instead of painting
 // a static star or a second Sun over the scenery.
 if(uSunAltitude>-.01454&&uSunIntensity>.001&&uRaysOffset>-.999){
  vec2 delta=(uv-uSunPosition)*vec2(1.,2.17647);
  float distance=length(delta),visibility=0.,weight=0.;int steps=uQuality>1.5?64:uQuality>.5?32:12;
  for(int i=0;i<64;i++){
   if(i>=steps)break;float fraction=(float(i)+.5)/float(steps);
   vec2 q=mix(uv,uSunPosition,fraction);
   vec2 cloudUV=vec2(1.-abs(mod(q.x-uTime*${(calibration.cloudSpeed/1000).toFixed(8)},2.)-1.),q.y);
   float open=(1.-texture(uTerrain,q).a)*(1.-texture(uClouds,cloudUV).a);
   float decay=exp(-fraction*1.6);visibility+=open*decay;weight+=decay;
  }
  // Broad, feathered bundles alongside fine shafts. Their moving contrast
  // comes from real cloud visibility; the envelope never introduces hard spokes.
  float angle=atan(delta.y,delta.x);
  float fan=.55+.28*pow(.5+.5*sin(angle*11.+.9),6.)+.17*pow(.5+.5*sin(angle*23.-.4),10.);
  float reach=mix(3.8,2.1,clamp((rayStrength-1.)/3.,0.,1.));
  float radial=visibility/max(weight,.001)*exp(-distance*reach)*(1.-exp(-distance*18.))*fan;
  shafts+=radial*uSunIntensity*.24*(1.-smoothstep(.25,.8,uSunAltitude));
 }
 // Exponential exposure keeps increasing smoothly without a flat intensity cap.
 shafts=1.-exp(-max(0.,shafts)*rayStrength);
 fragColor=vec4(0.,0.,0.,shafts);
}`;
/** Linear HDR bloom pyramid: masked soft-knee extraction, 13-tap downsample,
 * then a normalized 9-tap tent reconstruction. No read/write feedback. */
export const BLOOM_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uBloomSource;
uniform sampler2D uBloomDetail;
uniform vec2 uResolution;
uniform vec2 uSourceResolution;
uniform float uBloomStage;
uniform float uHdr;
out vec4 fragColor;
vec3 sampleBloom(vec2 uv){
 vec4 value=texture(uBloomSource,clamp(uv,.5/uSourceResolution,1.-.5/uSourceResolution));
 if(uBloomStage>.5)return value.rgb;
 // Extract each source sample before averaging: tiny glints survive reduction.
 vec3 color=max(value.rgb,vec3(0.));float peak=max(max(color.r,color.g),color.b);
 float threshold=uHdr>.5?1.0:.72,knee=uHdr>.5?.6:.16;
 float soft=clamp(peak-threshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee+.0001);
 float weight=max(soft,peak-threshold)/max(peak,.0001);
 return color*weight*value.a;
}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution,d=1./uSourceResolution;
 vec3 color;
 if(uBloomStage>1.5){
  color=sampleBloom(uv)*4.;
  color+=(sampleBloom(uv+vec2(d.x,0.))+sampleBloom(uv-vec2(d.x,0.))+sampleBloom(uv+vec2(0.,d.y))+sampleBloom(uv-vec2(0.,d.y)))*2.;
  color+=sampleBloom(uv+d)+sampleBloom(uv-d)+sampleBloom(uv+vec2(d.x,-d.y))+sampleBloom(uv+vec2(-d.x,d.y));
  color=mix(texture(uBloomDetail,uv).rgb,color/16.,.58);
 }else{
  color=sampleBloom(uv)*.125;
  color+=(sampleBloom(uv+vec2(-2.,-2.)*d)+sampleBloom(uv+vec2(2.,-2.)*d)+sampleBloom(uv+vec2(-2.,2.)*d)+sampleBloom(uv+vec2(2.,2.)*d))*.03125;
  color+=(sampleBloom(uv+vec2(-2.,0.)*d)+sampleBloom(uv+vec2(2.,0.)*d)+sampleBloom(uv+vec2(0.,-2.)*d)+sampleBloom(uv+vec2(0.,2.)*d))*.0625;
  color+=(sampleBloom(uv+vec2(-1.,-1.)*d)+sampleBloom(uv+vec2(1.,-1.)*d)+sampleBloom(uv+vec2(-1.,1.)*d)+sampleBloom(uv+vec2(1.,1.)*d))*.125;
 }
 fragColor=vec4(min(color,vec3(60000.)),1.);
}`;
export const PRESENT_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uLitTerrain;
uniform float uTerrainEnabled;
uniform sampler2D uWater;
uniform sampler2D uLight;
uniform sampler2D uBloom;
uniform float uBloomOffset;
uniform sampler2D uMask;
uniform sampler2D uTerrain;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform vec3 uSunColor;
uniform float uHdr;
uniform float uTime;
out vec4 fragColor;
const float PI=3.141592653589793;
${optics}
// Select the defocused near leaves from the registered source, never a
// rectangular slice of the assembled landscape. Rocks are neutral; the sharp
// conifers and distant shore sit outside these branch-sized supports.
float leafCluster(vec2 uv,vec2 center,vec2 radius){
 return 1.-smoothstep(.72,1.,length((uv-center)/radius));
}
float nearLeaves(vec2 uv){
 if(uv.y<.405||(uv.x>.38&&uv.x<.89))return 0.;
 float region=0.;
 region=max(region,leafCluster(uv,vec2(.022,.428),vec2(.045,.025)));
 region=max(region,leafCluster(uv,vec2(.020,.490),vec2(.063,.025)));
 region=max(region,leafCluster(uv,vec2(.025,.563),vec2(.078,.040)));
 region=max(region,leafCluster(uv,vec2(.112,.613),vec2(.148,.032)));
 region=max(region,leafCluster(uv,vec2(.035,.665),vec2(.084,.039)));
 region=max(region,leafCluster(uv,vec2(.070,.717),vec2(.118,.039)));
 region=max(region,leafCluster(uv,vec2(.085,.768),vec2(.128,.033)));
 region=max(region,leafCluster(uv,vec2(.110,.813),vec2(.165,.042)));
 region=max(region,leafCluster(uv,vec2(.080,.866),vec2(.125,.045)));
 region=max(region,leafCluster(uv,vec2(.120,.921),vec2(.162,.048)));
 region=max(region,leafCluster(uv,vec2(.155,.977),vec2(.212,.063)));
 region=max(region,leafCluster(uv,vec2(.958,.919),vec2(.043,.048)));
 region=max(region,leafCluster(uv,vec2(.958,.975),vec2(.062,.046)));
 if(region<.001)return 0.;
 vec4 source=textureLod(uTerrain,uv,0.);
 float warm=smoothstep(.78,.96,source.r/max(source.g,.001));
 float chroma=smoothstep(.08,.16,source.g-source.b)*smoothstep(.05,.12,source.r-source.b);
 // Blurred leaves have little fine detail. Reject sharp needles and rock edges
 // even where the photographic layers overlap at a branch boundary.
 vec3 coarse=textureLod(uTerrain,uv,2.).rgb;
 float soft=1.-smoothstep(.012,.055,length(source.rgb-coarse));
 return smoothstep(.10,.45,region*warm*chroma*soft)*source.a;
}
vec2 foliageWind(vec2 uv){
 float edge=mix(.15,.40,smoothstep(.43,.99,uv.y));
 float left=(1.-smoothstep(edge-.065,edge,uv.x))*smoothstep(.405,.47,uv.y);
 float right=smoothstep(.87,.98,uv.x)*smoothstep(.79,.88,uv.y);
 float bottom=smoothstep(.94,.995,uv.y)*(1.-smoothstep(.38,.58,uv.x));
 float rooted=1.-.85*smoothstep(.965,1.,uv.y);
 float weight=max(left,max(right,bottom))*rooted;
 if(weight<.001)return vec2(0.);
 // A coherent branch bend, with small travelling flutter. The phase varies
 // slowly across a branch so individual leaves do not dissolve into ripples.
 float phase=uv.x*9.+uv.y*7.;
 float gust=.70+.20*sin(uTime*.37-uv.y*4.1)+.10*sin(uTime*.173+uv.x*6.);
 float bend=sin(uTime*1.13+phase*.24)+.30*sin(uTime*1.71-phase*.37);
 float flutter=sin(uTime*3.7+uv.y*47.+uv.x*33.)*.20
              +sin(uTime*5.13+uv.x*67.-uv.y*31.)*.09;
 return weight*gust*vec2(.014*bend+.002*flutter,
                         .0021*sin(uTime*1.31+phase)+.0008*flutter);
}
void main(){
 vec2 uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec2 texUV=gl_FragCoord.xy/uResolution;
 vec2 wind=foliageWind(uv);
 float originalLeaf=nearLeaves(uv),shiftedLeaf=nearLeaves(uv+wind);
 // A moving leaf may cover open river, but must never drag an already visible
 // rock or tree. Vacated leaf pixels can reveal the neighbouring background.
 float openPixel=1.-textureLod(uTerrain,uv,0.).a;
 float support=max(originalLeaf,shiftedLeaf*openPixel);
 vec2 movedUV=uv+wind*support;
 vec2 terrainUV=clamp(texUV+vec2(wind.x,-wind.y)*support*uFrame.xy/uResolution,
                      .5/uResolution,1.-.5/uResolution);
 // Water, bloom and rays keep their original screen coordinates. Only river
 // newly exposed behind a leaf borrows the adjacent river sample.
 vec2 waterUV=originalLeaf>.001?terrainUV:texUV;
 vec4 water=texture(uWater,waterUV),light=texture(uLight,texUV);
 vec3 bloom=texture(uBloom,texUV).rgb*pow(max(0.,1.+uBloomOffset),2.);
 float mask=texture(uMask,originalLeaf>.001?movedUV:uv).a,alpha=min(mask,water.a);
 vec3 color=uHdr>.5?waterDisplayColor(water.rgb+bloom*.48):clamp(water.rgb+bloom*.25,0.,1.);
 float shaftAlpha=light.a;
 color=mix(color,uSunColor,shaftAlpha*.25);
 vec4 terrain=texture(uLitTerrain,terrainUV);terrain.a*=uTerrainEnabled;
 if(support>.001)alpha=min(alpha,1.-terrain.a);
 float surface=min(1.,alpha+terrain.a);
 float haloAlpha=clamp(dot(bloom,vec3(.2126,.7152,.0722))*(uHdr>.5?.045:.075),0.,.14);
 vec3 halo=uHdr>.5?waterDisplayColor(bloom*.4):clamp(bloom,0.,1.);
 vec3 terrainColor=1.-(1.-terrain.rgb)*(1.-halo*haloAlpha*2.);
 float scatter=1.-(1.-shaftAlpha)*(1.-haloAlpha);
 float total=surface+scatter*(1.-surface);
 vec3 base=color*alpha+terrainColor*terrain.a;
 vec3 scatterColor=(clamp(uSunColor,0.,1.)*shaftAlpha+halo*haloAlpha)/max(shaftAlpha+haloAlpha,.00001);
 vec3 premult=base*(1.-scatter)+scatterColor*scatter;
 fragColor=total>.00001?vec4(premult/total,total):vec4(0.);

}`;

/** Closed terrain and instanced conifers, rendered twice with real depth tests. */
export const SCENE_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aInstance;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform float uMirror;
uniform float uTree;
uniform vec3 uCameraOffset;
out vec3 vWorld;
out vec3 vNormal;
${projection}
void main(){
 vWorld=uTree>.5?aPosition*aInstance.w+aInstance.xyz:aPosition;
 vNormal=aNormal;
 vec3 p=vWorld;p.y*=1.-2.*uMirror;p-=uCameraOffset;
 vec2 screen=projectWater(p)*uFrame.xy+uFrame.zw;
 float distanceToCamera=length(p-vec3(0.,CAMERA_HEIGHT,0.));
 gl_Position=vec4(screen.x/uResolution.x*2.-1.,1.-screen.y/uResolution.y*2.,distanceToCamera/(distanceToCamera+64.)*2.-1.,1.);
}`;
export const SCENE_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uTerrain;
uniform vec2 uResolution;
uniform vec4 uFrame;
uniform vec3 uCameraOffset;
uniform float uTree;
uniform float uDebug;
uniform float uMirror;
uniform float uSceneHdr;
uniform float uDay;
uniform float uWarm;
uniform float uQuality;
uniform vec2 uSunPosition;
uniform float uSunAltitude;
uniform float uSunIntensity;
uniform vec3 uSunColor;
uniform vec2 uMoonPosition;
uniform float uMoonAltitude;
uniform float uMoonIntensity;
uniform vec3 uMoonColor;
in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;
${projection}
${optics}
${solidScene}
void main(){
 if(uMirror>.5&&vWorld.y<.015)discard;
 vec2 uv=projectWater(vWorld);
 // Exact inverse image coordinates avoid triangulation seams in the fixed
 // main camera. The mirror keeps projective world-material coordinates.
 if(uMirror<.5&&dot(uCameraOffset,uCameraOffset)<.001)uv=(vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y)-uFrame.zw)/uFrame.xy;
 vec4 art=texture(uTerrain,uv);
 if(uDebug<.5&&uMirror<.5&&(art.a<.03||any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))))discard;
 vec3 albedo=pow(art.rgb,vec3(2.2));
 if(art.a<.03)albedo=vec3(.035,.068,.037);
 vec3 n=normalize(vNormal);if(uTree<.5&&n.y<0.)n=-n;
 if(uDebug>.5){fragColor=vec4(n*.5+.5,1.);return;}
 if(uTree>.5){n=normalize(vNormal);albedo=mix(albedo,vec3(.018,.055,.025),.55);}
 vec3 ambient=mix(vec3(.018,.028,.065),vec3(.55,.65,.82),uDay);
 ambient=mix(ambient,vec3(.40,.20,.30),uWarm*.15)*(.55+.45*max(n.y,0.));
 vec3 radiance=albedo*ambient;
 if(uSunAltitude>-.01454){vec3 l=lightDirection(uSunPosition,uSunAltitude);radiance+=albedo*uSunColor*uSunIntensity*max(dot(n,l),0.)*1.8*solidShadow(vWorld+n*.16,l,uQuality>.5?4:2);}
 if(uMoonAltitude>0.){vec3 l=lightDirection(uMoonPosition,uMoonAltitude);radiance+=albedo*uMoonColor*uMoonIntensity*max(dot(n,l),0.)*.2*solidShadow(vWorld+n*.16,l,2);}
 float haze=1.-exp(-length(vWorld.xz)*(.0015+.0032*uWarm));
 vec3 air=mix(vec3(.005,.013,.035),vec3(.36,.49,.62),uDay);air=mix(air,vec3(.65,.28,.18),uWarm*.7);
 radiance=mix(radiance,air,haze*.64);
 fragColor=vec4(uSceneHdr>.5?radiance:displayColor(radiance),uMirror>.5?1.:1.-smoothstep(.70,.82,uv.y));
}`;
