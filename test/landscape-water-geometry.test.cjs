const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const calibration=require('../lib/landscape-water-calibration.json');
const manifest=require('../public/themes/mountains/water-geometry.json');
const uv=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-uv.png'));
const perspective=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-perspective.png'));
const mask=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-mask.png'));
test('reconstruction belongs to the unchanged illustration and supplies explicit UV/depth/shore data',()=>{
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
  const px=((uv.data[a]*256+uv.data[a+1])/65535-.5)*2*calibration.worldExtent;
  const pz=((uv.data[b]*256+uv.data[b+1])/65535-.5)*2*calibration.worldExtent;
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
