const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PNG}=require('pngjs'),load=require('./load-ts.cjs');
const {buildLandscapeScene,sceneHeightUV,SCENE_GRID}=load('lib/landscape-scene-geometry.ts');
const png=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-mask.png')),alpha=new Uint8Array(png.width*png.height);
for(let i=0;i<alpha.length;i++)alpha[i]=png.data[i*4+3];
const scene=buildLandscapeScene(alpha,png.width,png.height);
test('terrain is a closed volumetric mesh with a river bed, ridges and hidden back slopes',()=>{
 const p=scene.positions,edges=new Map();let volume=0;
 assert.ok(p.length/3>20000);assert.ok(Math.min(...scene.heights)<0);assert.ok(Math.max(...scene.heights)>15);
 for(let i=0;i<scene.indices.length;i+=3){
  const [a,b,c]=scene.indices.slice(i,i+3);
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const k=Math.min(x,y)+':'+Math.max(x,y);edges.set(k,(edges.get(k)||0)+1);}
  const ax=p[a*3],ay=p[a*3+1],az=p[a*3+2],bx=p[b*3],by=p[b*3+1],bz=p[b*3+2],cx=p[c*3],cy=p[c*3+1],cz=p[c*3+2];
  volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
 }
 assert.ok([...edges.values()].every(n=>n===2),'every edge belongs to exactly two faces');assert.ok(volume>10000,'consistent winding encloses positive volume');
 assert.ok([...p].every(Number.isFinite));assert.equal(scene.normals.length,p.length);
 for(let i=0;i<scene.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...scene.normals.slice(i,i+3))-1)<.0001);
 const middle=Math.floor(SCENE_GRID.columns/2),stride=SCENE_GRID.columns+1;
 assert.ok(scene.heights[115*stride+middle]<scene.heights[88*stride+middle],'the far side descends behind the ridge');
});
test('forest consists of three-dimensional instanced conifers with finite unit normals',()=>{
 assert.ok(scene.trees.length/4>100);assert.equal(scene.treePositions.length,scene.treeNormals.length);
 assert.ok(new Set([...scene.treePositions].filter((_,i)=>i%3===2)).size>6,'trees have actual depth');
 for(let i=0;i<scene.treeNormals.length;i+=3)assert.ok(Math.abs(Math.hypot(...scene.treeNormals.slice(i,i+3))-1)<.0001);
 for(let i=0;i<scene.treePositions.length;i+=9){const p=scene.treePositions,n=scene.treeNormals,ux=p[i+3]-p[i],uy=p[i+4]-p[i+1],uz=p[i+5]-p[i+2],vx=p[i+6]-p[i],vy=p[i+7]-p[i+1],vz=p[i+8]-p[i+2];const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;assert.ok((x*n[i]+y*n[i+1]+z*n[i+2])/Math.hypot(x,y,z)>.999,'foliage winding agrees with its outward normal');}
 for(let i=0;i<scene.trees.length;i+=4){assert.ok(scene.trees[i+1]>0);assert.ok(scene.trees[i+3]>0);}
});
test('heightfield coordinates agree with geometry used for lighting and shadow queries',()=>{
 const stride=SCENE_GRID.columns+1;
 for(const row of [0,24,88,128])for(const col of [0,30,96]){
  const i=(row*stride+col)*3,uv=sceneHeightUV(scene.positions[i],scene.positions[i+2]);
  assert.ok(Math.abs(uv.x-col/SCENE_GRID.columns)<1e-6);assert.ok(Math.abs(uv.y-row/SCENE_GRID.rows)<1e-6);
 }
});
