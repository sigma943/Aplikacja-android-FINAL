// Preserve dimensions, every RGBA pixel and all original ancillary chunks.
const fs=require('node:fs'),crypto=require('node:crypto');const {PNG}=require('pngjs');
function chunks(buffer){let offset=8,result=[];while(offset<buffer.length){const end=offset+12+buffer.readUInt32BE(offset);result.push({type:buffer.toString('ascii',offset+4,offset+8),bytes:buffer.subarray(offset,end)});offset=end;}return result;}
const report=[];
for(const name of ['pks','mpk-rzeszow','marcel']){
 const path='public/dodaj/'+name+'.png',original=fs.readFileSync(path),image=PNG.sync.read(original);
 let best=original;
 for(const strategy of [0,3]){
  const encoded=PNG.sync.write(image,{deflateLevel:9,deflateStrategy:strategy,filterType:-1,colorType:image.colorType});
  const idat=chunks(encoded).filter(c=>c.type==='IDAT');let inserted=false;
  const output=[original.subarray(0,8)];for(const chunk of chunks(original)){if(chunk.type!=='IDAT')output.push(chunk.bytes);else if(!inserted){output.push(...idat.map(c=>c.bytes));inserted=true;}}
  const candidate=Buffer.concat(output),decoded=PNG.sync.read(candidate);
  if(decoded.width!==image.width||decoded.height!==image.height||!decoded.data.equals(image.data))throw Error('Pixel mismatch: '+name);
  if(candidate.length<best.length)best=candidate;
 }
 fs.mkdirSync('out/dodaj',{recursive:true});fs.writeFileSync('out/dodaj/'+name+'.png',best);
 report.push({path,width:image.width,height:image.height,beforeBytes:original.length,afterBytes:best.length,rgbaSha256:crypto.createHash('sha256').update(image.data).digest('hex')});
}
fs.writeFileSync('out/provider-image-optimization.json',JSON.stringify(report,null,2)+'\n');console.log(report);
