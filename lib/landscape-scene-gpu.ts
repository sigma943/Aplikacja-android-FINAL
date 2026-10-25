import {buildLandscapeScene,SCENE_GRID} from './landscape-scene-geometry';

/** GPU ownership for the solid terrain and instanced forest. Shares the water GL. */
export class LandscapeSolidScene{
 private vaos:WebGLVertexArrayObject[]=[];
 private buffers:WebGLBuffer[]=[];
 private heightTexture:WebGLTexture|null=null;
 readonly indexCount:number;
 readonly treeCount:number;
 readonly vertexCount:number;
 private readonly treeVertices:number;
 constructor(private gl:WebGL2RenderingContext,mask:CanvasImageSource){
  const source=mask as {width?:number;height?:number},c=document.createElement('canvas');c.width=source.width||850;c.height=source.height||1850;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(mask,0,0,c.width,c.height);
  const rgba=ctx.getImageData(0,0,c.width,c.height).data,alpha=new Uint8Array(c.width*c.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
  const scene=buildLandscapeScene(alpha,c.width,c.height);c.width=c.height=1;
  this.indexCount=scene.indices.length;this.treeCount=scene.trees.length/4;this.vertexCount=scene.positions.length/3;this.treeVertices=scene.treePositions.length/3;
  try{
   for(let i=0;i<2;i++){const vao=gl.createVertexArray();if(!vao)throw Error('scene VAO allocation');this.vaos.push(vao);}
   gl.bindVertexArray(this.vaos[0]);this.buffer(gl.ARRAY_BUFFER,scene.positions);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);this.buffer(gl.ARRAY_BUFFER,scene.normals);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);this.buffer(gl.ELEMENT_ARRAY_BUFFER,scene.indices);
   gl.bindVertexArray(this.vaos[1]);this.buffer(gl.ARRAY_BUFFER,scene.treePositions);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
   this.buffer(gl.ARRAY_BUFFER,scene.treeNormals);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
   this.buffer(gl.ARRAY_BUFFER,scene.trees);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,0,0);gl.vertexAttribDivisor(2,1);gl.bindVertexArray(null);
   this.heightTexture=gl.createTexture();if(!this.heightTexture)throw Error('scene height allocation');this.bind();
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,SCENE_GRID.columns+1,SCENE_GRID.rows+1,0,gl.RED,gl.FLOAT,scene.heights);
  }catch(e){this.dispose();throw e;}
 }
 private buffer(target:number,data:Float32Array|Uint32Array){const gl=this.gl,b=gl.createBuffer();if(!b)throw Error('scene buffer allocation');this.buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);}
 bind(){this.gl.activeTexture(this.gl.TEXTURE11);this.gl.bindTexture(this.gl.TEXTURE_2D,this.heightTexture);}
 draw(treeUniform:WebGLUniformLocation|null,blend=false){
  const gl=this.gl;if(blend){gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}else gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  gl.uniform1f(treeUniform,0);gl.bindVertexArray(this.vaos[0]);gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_INT,0);
  gl.uniform1f(treeUniform,1);gl.bindVertexArray(this.vaos[1]);gl.drawArraysInstanced(gl.TRIANGLES,0,this.treeVertices,this.treeCount);
  gl.bindVertexArray(null);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
 }
 dispose(){const gl=this.gl;for(const b of this.buffers)gl.deleteBuffer(b);for(const v of this.vaos)gl.deleteVertexArray(v);gl.deleteTexture(this.heightTexture);this.buffers=[];this.vaos=[];this.heightTexture=null;}
}
