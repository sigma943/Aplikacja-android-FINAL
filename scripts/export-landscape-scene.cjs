// Developer/CI asset export. The live scene uses these same generated vertices.
const fs=require('node:fs'),path=require('node:path'),{PNG}=require('pngjs'),load=require('../test/load-ts.cjs');
const mask=PNG.sync.read(fs.readFileSync('public/themes/mountains/water-mask.png')),alpha=new Uint8Array(mask.width*mask.height);
for(let i=0;i<alpha.length;i++)alpha[i]=mask.data[i*4+3];
const scene=load('lib/landscape-scene-geometry.ts').buildLandscapeScene(alpha,mask.width,mask.height),parts=[],views=[],accessors=[];
let bytes=0;
function attribute(array,type,componentType,target){
 const buffer=Buffer.from(array.buffer,array.byteOffset,array.byteLength),offset=bytes;parts.push(buffer);bytes+=buffer.length;
 const padding=(4-bytes%4)%4;if(padding){parts.push(Buffer.alloc(padding));bytes+=padding;}
 const view=views.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})})-1,components={SCALAR:1,VEC3:3}[type];
 const min=Array(components).fill(Infinity),max=Array(components).fill(-Infinity);for(let i=0;i<array.length;i++){min[i%components]=Math.min(min[i%components],array[i]);max[i%components]=Math.max(max[i%components],array[i]);}
 return accessors.push({bufferView:view,componentType,count:array.length/components,type,min,max})-1;
}
const positions=attribute(scene.positions,'VEC3',5126,34962),indices=attribute(scene.indices,'SCALAR',5125,34963),normals=new Float32Array(scene.positions.length);
for(let i=0;i<scene.indices.length;i+=3){const a=scene.indices[i]*3,b=scene.indices[i+1]*3,c=scene.indices[i+2]*3,p=scene.positions,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];for(const j of [a,b,c]){normals[j]+=uy*vz-uz*vy;normals[j+1]+=uz*vx-ux*vz;normals[j+2]+=ux*vy-uy*vx;}}
for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;for(let j=0;j<3;j++)normals[i+j]/=n;}
const normal=attribute(normals,'VEC3',5126,34962),treePositions=attribute(scene.treePositions,'VEC3',5126,34962),treeNormals=attribute(scene.treeNormals,'VEC3',5126,34962);
const waterPositions=scene.positions.slice(0,scene.positions.length/2),waterIndices=[];
for(let i=0;i<waterPositions.length;i+=3)waterPositions[i+1]=0;
const topCount=scene.heights.length;
for(let i=0;i<scene.indices.length;i+=3){const a=scene.indices[i],b=scene.indices[i+1],c=scene.indices[i+2];if(a<topCount&&b<topCount&&c<topCount&&scene.heights[a]<0&&scene.heights[b]<0&&scene.heights[c]<0)waterIndices.push(a,b,c);}
const water=attribute(waterPositions,'VEC3',5126,34962),waterIndex=attribute(new Uint32Array(waterIndices),'SCALAR',5125,34963);
const nodes=[{name:'Solid valley and mountain back slopes',mesh:0},{name:'River surface (live Gerstner shader is in the application)',mesh:2}];
for(let i=0;i<scene.trees.length;i+=4)nodes.push({name:'Conifer '+i/4,mesh:1,translation:Array.from(scene.trees.slice(i,i+3)),scale:[scene.trees[i+3],scene.trees[i+3],scene.trees[i+3]]});
const gltf={asset:{version:'2.0',generator:'PKS Live controlled 3D landscape authoring'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:[{primitives:[{attributes:{POSITION:positions,NORMAL:normal},indices,material:0}]},{primitives:[{attributes:{POSITION:treePositions,NORMAL:treeNormals},material:1}]},{primitives:[{attributes:{POSITION:water},indices:waterIndex,material:2}]}],materials:[{name:'Terrain inspection material (app uses projected photographic albedo)',pbrMetallicRoughness:{baseColorFactor:[.20,.28,.19,1],metallicFactor:0,roughnessFactor:1},doubleSided:true},{name:'Conifers',pbrMetallicRoughness:{baseColorFactor:[.035,.12,.055,1],metallicFactor:0,roughnessFactor:1},doubleSided:true},{name:'River inspection material',pbrMetallicRoughness:{baseColorFactor:[.035,.15,.22,.8],metallicFactor:0,roughnessFactor:.13},alphaMode:'BLEND',doubleSided:true}],buffers:[{byteLength:bytes}],bufferViews:views,accessors};
let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat(parts),header=Buffer.alloc(12),jheader=Buffer.alloc(8),bheader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jheader.writeUInt32LE(json.length);jheader.writeUInt32LE(0x4e4f534a,4);bheader.writeUInt32LE(bin.length);bheader.writeUInt32LE(0x004e4942,4);
const output=process.argv[2]||'test/ui-previews/landscape-scene.glb';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jheader,json,bheader,bin]));console.log(`Exported ${scene.positions.length/3} terrain vertices, ${scene.trees.length/4} conifers and ${waterIndices.length/3} water triangles to ${output}`);
