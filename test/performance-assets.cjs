const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PNG}=require('pngjs');
const baseline=path.resolve(process.argv[2]);
function bundle(root){const html=fs.readFileSync(path.join(root,'out/index.html'),'utf8');const scripts=[...html.matchAll(/<script\b([^>]*?)\bsrc="([^"]+)"([^>]*)>/g)].filter(m=>!/nomodule/i.test(m[1]+m[3])).map(m=>m[2]);return {scripts:scripts.length,rawBytes:scripts.reduce((sum,file)=>sum+fs.statSync(path.join(root,'out',file.replace(/^\//,''))).size,0)};}
const images=[];
for(const name of ['pks','mpk-rzeszow','marcel']){const file='public/dodaj/'+name+'.png',a=fs.readFileSync(path.join(baseline,file)),b=fs.readFileSync(file.replace('public/','out/')),left=PNG.sync.read(a),right=PNG.sync.read(b);assert.equal(right.width,left.width);assert.equal(right.height,left.height);assert.deepEqual(right.data,left.data);images.push({file,beforeBytes:a.length,afterBytes:b.length,identicalPixels:true});}
const result={before:bundle(baseline),after:bundle(process.cwd()),images};
fs.mkdirSync('test/performance-results',{recursive:true});fs.writeFileSync('test/performance-results/assets.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
