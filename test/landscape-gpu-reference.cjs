// Pre-optimization uniform dispatch, retained for pixel-equivalence/call-count proof.
module.exports=function(p,light,frame,quality,w,h,width,height,linear){
  const gl=this.gl,sx=w/frame.width,sy=h/frame.height;
    gl.uniform2f(this.uniform(p,'uResolution'),w,h);gl.uniform4f(this.uniform(p,'uFrame'),1000*frame.scale*sx,(1000*1850/850)*frame.scale*sy,frame.x*sx,frame.y*sy);
    gl.uniform1f(this.uniform(p,'uTime'),light.time);gl.uniform1f(this.uniform(p,'uQuality'),quality==='high'?2:quality==='medium'?1:0);gl.uniform1f(this.uniform(p,'uFrameInterval'),1/({high:30,medium:24,low:15}[quality]));gl.uniform1f(this.uniform(p,'uHdr'),this.hdr?1:0);
    gl.uniform1f(this.uniform(p,'uSceneEnabled'),this.assets?.sceneDepth?1:0);
    gl.uniform1f(this.uniform(p,'uTerrainEnabled'),this.targets[2]?1:0);
    gl.uniform1f(this.uniform(p,'uDay'),light.sky.day);gl.uniform1f(this.uniform(p,'uWarm'),light.sky.twilight);gl.uniform1f(this.uniform(p,'uMoonIllumination'),light.moon.illumination);gl.uniform2f(this.uniform(p,'uWaterResolution'),width,height);
    gl.uniform2f(this.uniform(p,'uSunPosition'),light.sun.x,light.sun.y);gl.uniform1f(this.uniform(p,'uSunAltitude'),light.sun.altitude);gl.uniform3fv(this.uniform(p,'uSunColor'),linear?this.sunLinear:light.sun.color);gl.uniform1f(this.uniform(p,'uSunIntensity'),light.sun.intensity);
    gl.uniform2f(this.uniform(p,'uMoonPosition'),light.moon.x,light.moon.y);gl.uniform1f(this.uniform(p,'uMoonAltitude'),light.moon.altitude);gl.uniform3fv(this.uniform(p,'uMoonColor'),linear?this.moonLinear:light.moon.color);gl.uniform1f(this.uniform(p,'uMoonIntensity'),light.moon.intensity);
  gl.uniform1f(this.uniform(p,'uScene3D'),this.solid?1:0);
 };
