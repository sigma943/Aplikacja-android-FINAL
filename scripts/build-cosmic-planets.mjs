import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Self-contained SVGs are decoded once as images. Removing black in the image
// avoids per-panel background-blend-mode compositing in Android WebView.
for(const name of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune']){
  const file=resolve(root,'public/themes/kosmos',name);
  const photo=readFileSync(file+'.jpg').toString('base64');
  const height=name==='saturn'?170:288;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="${height}" viewBox="0 0 512 ${height}"><defs><filter id="remove-black" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 4 4 4 0 0"/></filter></defs><image width="512" height="${height}" href="data:image/jpeg;base64,${photo}" filter="url(#remove-black)"/></svg>`;
  writeFileSync(file+'.svg',svg+'\n');
}
