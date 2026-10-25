const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const calibration=require('../lib/landscape-water-calibration.json');
const manifest=require('../public/themes/mountains/water-geometry.json');
const uv=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-uv.png'));
const perspective=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-perspective.png'));
const mask=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-mask.png'));
test('reconstruction belongs to the registered illustration and supplies explicit UV/depth/shore data',()=>{
 assert.equal(manifest.maskSha256,crypto.createHash('sha256').update(fs.readFileSync('public/themes/mountains/water-mask.png')).digest('hex'));
 assert.equal(uv.width,calibration.mapWidth*2);assert.equal(uv.height,calibration.mapHeight);
 assert.equal(perspective.width,calibration.mapWidth);assert.equal(perspective.height,calibration.mapHeight);
 let shore=0,interior=0,land=0;
 for(let i=0;i<perspective.data.length;i+=4){const bank=perspective.data[i+1];if(bank>0&&bank<255)shore++;if(bank===255)interior++;if(bank===0)land++;}
 assert.ok(shore>100&&interior>100&&land>100,'bank fade is a shaped field, not a water rectangle');
});
test('visible water UVs reproject to their authored pixels within a subpixel tolerance',()=>{
 const w=calibration.mapWidth,h=calibration.mapHeight,span=calibration.azimuthSpanDegrees*Math.PI/180;
 let checked=0;
 for(let y=Math.ceil(h*.59);y<h*.89;y+=5)for(let x=0;x<w;x+=3){
  const mi=((y*2)*mask.width+x*2)*4+3;if(mask.data[mi]<200)continue;
  const a=(y*uv.width+x)*4,b=a+w*4;
  const px=((uv.data[a]*65536+uv.data[a+1]*256+uv.data[a+2])/16777215-.5)*2*calibration.worldExtent;
  const pz=((uv.data[b]*65536+uv.data[b+1]*256+uv.data[b+2])/16777215-.5)*2*calibration.worldExtent;
  const rx=.5+Math.atan2(px,pz)/span;
  const ry=calibration.horizon+Math.atan2(calibration.cameraHeight,Math.hypot(px,pz))/(Math.PI/2)*calibration.altitudeSpan;
  assert.ok(Math.abs(rx-(x+.5)/w)<.0007,'horizontal registration');assert.ok(Math.abs(ry-(y+.5)/h)<.0007,'vertical registration');checked++;
 }
 assert.ok(checked>100);
});
test('relative observer distance decreases towards the foreground',()=>{
 const w=perspective.width,at=y=>perspective.data[(Math.floor(y*perspective.height)*w+Math.floor(w*.7))*4];
 assert.ok(at(.60)>at(.70)&&at(.70)>at(.83));
});
test('terrain material normals are opaque unit vectors with both slopes and upward banks',()=>{
 const normals=PNG.sync.read(fs.readFileSync('public/themes/mountains/terrain-normal.png'));
 const depth=PNG.sync.read(fs.readFileSync('public/themes/mountains/scene-depth.png'));
 assert.equal(normals.width,depth.width);assert.equal(normals.height,depth.height);
 let banks=0,walls=0;
 for(let i=0;i<normals.data.length;i+=4){
  assert.equal(normals.data[i+3],255,'normal data cannot suffer alpha premultiplication');
  if(depth.data[i+2]<220)continue;
  const n=[0,1,2].map(j=>normals.data[i+j]/255*2-1);
  assert.ok(Math.abs(Math.hypot(...n)-1)<.02,'valid world normal');
  if(n[1]>.8)banks++;if(n[2]<-.5)walls++;
 }
 assert.ok(banks>100&&walls>100,'the material is not a flat painted tint');
 const profile=[];
 for(let y=Math.floor(normals.height*(calibration.horizon-.04));y<normals.height*(calibration.horizon+.10);y++){
  let sum=0,count=0;for(let x=Math.floor(normals.width*.235);x<normals.width*.765;x++){sum+=normals.data[(y*normals.width+x)*4+1]/255*2-1;count++;}profile.push(sum/count);
 }
 for(let i=1;i<profile.length;i++)assert.ok(Math.abs(profile[i]-profile[i-1])<.30,'no horizontal shell/plane normal seam');
});
test('ray-tracing proxy has finite positive depth and places near banks above the water plane',()=>{
 const depth=PNG.sync.read(fs.readFileSync('public/themes/mountains/scene-depth.png'));
 assert.equal(depth.width,calibration.mapWidth);assert.equal(depth.height,calibration.mapHeight);
 let terrain=0,empty=0;
 for(let y=0;y<depth.height;y+=3)for(let x=0;x<depth.width;x+=3){
  const i=(y*depth.width+x)*4,coverage=depth.data[i+2];if(coverage===0){empty++;continue;}
  const radius=(depth.data[i]*256+depth.data[i+1])/65535*calibration.sceneDepthExtent;
  assert.ok(radius>0&&radius<110.01);
  const elevation=(calibration.horizon-(y+.5)/depth.height)/calibration.altitudeSpan*Math.PI/2;
  const height=calibration.cameraHeight+radius*Math.tan(elevation);
  assert.ok(height>.9,'opaque bank proxy cannot fall below the water');terrain++;
 }
 assert.ok(terrain>100&&empty>100);
});
