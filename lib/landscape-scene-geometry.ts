import camera from './landscape-water-calibration.json';
import skyline from './landscape-horizon.json';

/** Authored solid terrain, not a depth image stretched into a camera-facing sheet.
 * The river footprint registers the sculpture to the existing photographic art.
 * Hidden slopes are deliberately authored, not claimed to be recovered from a photo. */
export const SCENE_GRID={columns:96,rows:128,near:2.2,far:1100,span:1.65};
export type SceneGeometry={positions:Float32Array;normals:Float32Array;indices:Uint32Array;heights:Float32Array;trees:Float32Array;treePositions:Float32Array;treeNormals:Float32Array};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const random=(i:number)=>{const n=Math.sin(i*127.1+78.233)*43758.5453;return n-Math.floor(n);};
export function sceneUV(x:number,y:number,z:number){return {x:.5+Math.atan2(x,z)/(camera.azimuthSpanDegrees*Math.PI/180),y:camera.horizon-Math.atan2(y-camera.cameraHeight,Math.hypot(x,z))/(Math.PI/2)*camera.altitudeSpan};}
export function sceneHeightUV(x:number,z:number){return {x:.5+Math.atan2(x,z)/SCENE_GRID.span,y:Math.log(Math.hypot(x,z)/SCENE_GRID.near)/Math.log(SCENE_GRID.far/SCENE_GRID.near)};}
export function buildLandscapeScene(mask:Uint8Array|Uint8ClampedArray,width:number,height:number):SceneGeometry{
 const {columns,rows,near,far,span}=SCENE_GRID,n=(columns+1)*(rows+1),positions=new Float32Array(n*6),heights=new Float32Array(n),triangles:number[]=[];
 const coverage=(u:number,v:number)=>{
  if(u<0||u>1||v<camera.waterMaskTop||v>1)return 0;
  const px=Math.max(0,Math.min(width-1,u*(width-1))),py=Math.max(0,Math.min(height-1,v*(height-1))),x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y;
  return mix(mix(mask[y*width+x],mask[y*width+Math.min(width-1,x+1)],fx),mix(mask[Math.min(height-1,y+1)*width+x],mask[Math.min(height-1,y+1)*width+Math.min(width-1,x+1)],fx),fy)/255;
 };
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
  const az=(col/columns-.5)*span,r=near*Math.pow(far/near,row/rows),x=r*Math.sin(az),z=r*Math.cos(az),uv=sceneUV(x,0,z),water=coverage(uv.x,uv.y);
  const index=Math.max(0,Math.min(255,uv.x*255)),si=Math.floor(index),horizon=mix(skyline[si],skyline[Math.min(255,si+1)],index-si),angle=(camera.horizon-horizon)/camera.altitudeSpan*Math.PI/2;
  // Foreground banks rise out of the same river plane. The principal massif
  // has an authored ridge at 150 units and a real descending back slope.
  const bank=(.18+1.2*(.55+.45*Math.sin(x*.47+Math.sin(z*.23))))*(1-smooth(.08,.85,water));
  const ridge=(camera.cameraHeight+150*Math.tan(Math.max(.01,angle)))*Math.exp(-Math.pow(Math.log(r/150)/.72,2));
  const foothills=(1-water)*Math.min(5,r*.055)*(.55+.45*Math.sin(x*.10+z*.065)**2)*smooth(8,35,r)*(1-smooth(70,140,r));
  const y=water>.90?-.65:Math.max(bank+foothills,ridge*smooth(38,110,r))*(1-smooth(.35,.98,water));
  const i=row*(columns+1)+col;heights[i]=y;positions.set([x,y,z],i*3);positions.set([x,-8,z],(i+n)*3);
 }
 const face=(a:number,b:number,c:number)=>triangles.push(a,b,c);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;
  face(a,c,b);face(b,c,d);face(a+n,b+n,c+n);face(b+n,d+n,c+n);
 }
 const wall=(a:number,b:number)=>{face(b,a,a+n);face(b,a+n,b+n);};
 for(let c=0;c<columns;c++){wall(c+1,c);wall(rows*(columns+1)+c,rows*(columns+1)+c+1);}
 for(let r=0;r<rows;r++){wall(r*(columns+1),(r+1)*(columns+1));wall((r+1)*(columns+1)+columns,r*(columns+1)+columns);}
 const normals=new Float32Array(positions.length);
 for(let i=0;i<triangles.length;i+=3){const a=triangles[i]*3,b=triangles[i+1]*3,c=triangles[i+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const j of [a,b,c]){normals[j]+=nx;normals[j+1]+=ny;normals[j+2]+=nz;}}
 for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=n;normals[i+1]/=n;normals[i+2]/=n;}
 const trees:number[]=[];
 for(let i=0;i<2000;i++){
  const col=2+Math.floor(random(i+1)*(columns-4)),row=5+Math.floor(random(i+5000)*Math.floor(rows*.68)),j=row*(columns+1)+col;
  const x=positions[j*3],y=positions[j*3+1],z=positions[j*3+2],uv=sceneUV(x,y,z),r=Math.hypot(x,z);
  if(y<.12||y>9||uv.x<.01||uv.x>.99||coverage(uv.x,uv.y)>.15||r<5)continue;
  trees.push(x,y,z,.18+random(i+8000)*.55);
 }
 // Four irregular whorls, six faces per whorl: actual volume and depth,
 // not a camera-facing billboard. One instanced draw covers the forest.
 const treePositions:number[]=[],treeNormals:number[]=[];
 for(let layer=0;layer<4;layer++)for(let side=0;side<6;side++){
  const top=1-layer*.21,bottom=top-.41,radius=.12+layer*.058,a=side/6*Math.PI*2,b=(side+1)/6*Math.PI*2;
  const p=[0,top,0,Math.cos(b)*radius,bottom,Math.sin(b)*radius,Math.cos(a)*radius,bottom,Math.sin(a)*radius];
  const ux=p[3]-p[0],uy=p[4]-p[1],uz=p[5]-p[2],vx=p[6]-p[0],vy=p[7]-p[1],vz=p[8]-p[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);
  treePositions.push(...p);for(let k=0;k<3;k++)treeNormals.push(nx/len,ny/len,nz/len);
  treePositions.push(0,bottom,0,Math.cos(a)*radius,bottom,Math.sin(a)*radius,Math.cos(b)*radius,bottom,Math.sin(b)*radius);
  for(let k=0;k<3;k++)treeNormals.push(0,-1,0);
 }
 return {positions,normals,indices:new Uint32Array(triangles),heights,trees:new Float32Array(trees),treePositions:new Float32Array(treePositions),treeNormals:new Float32Array(treeNormals)};
}
