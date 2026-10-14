import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Bake transparency once; Android paints ordinary images without filter bounds.
for(const name of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']){
  const file=resolve(root,'public/themes/kosmos',name);
  const image=jpeg.decode(readFileSync(resolve(root,'assets/cosmos-source',name+'.jpg')),{useTArray:true});
  for(let offset=0;offset<image.data.length;offset+=4)image.data[offset+3]=Math.min(255,4*(image.data[offset]+image.data[offset+1]+image.data[offset+2]));
  const png=PNG.sync.write({width:image.width,height:image.height,data:Buffer.from(image.data)}).toString('base64');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}"><image width="${image.width}" height="${image.height}" href="data:image/png;base64,${png}"/></svg>`;
  writeFileSync(file+'.svg',svg+'\n');
}
