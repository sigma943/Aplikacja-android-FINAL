import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = new URL('../public/themes/kosmos/', import.meta.url);
const photo = name => `data:image/png;base64,${readFileSync(new URL(name, root)).toString('base64')}`;
const nebula = photo('orion.png'), galaxy = photo('sombrero.png');
// Reference compositions: all bright detail stays to the right of the text.
for (let i = 0; i < 4; i++) {
  let state=731+i*943;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const stars=Array.from({length:70},()=>`<circle cx="${(225+random()*245).toFixed(1)}" cy="${(5+random()*118).toFixed(1)}" r="${(.18+random()*.38).toFixed(2)}" fill="${random()>.7?'#e9c3ab':'#bfd6f7'}" opacity="${(.18+random()*.38).toFixed(2)}"/>`).join('');
  const spark=i===1?'<g transform="translate(367 35)"><circle r="6" fill="url(#spark)"/><path d="M-4 0H4M0 -4V4" stroke="#a5d8ff" stroke-width=".35" opacity=".65"/><circle r=".65" fill="#d9efff"/></g>':i===2?'<g transform="translate(385 55)"><circle r="5" fill="url(#spark)"/><circle r=".7" fill="#e6f3ff"/></g>':'';
  const galaxyArt=i===1?`<g transform="translate(409 100) rotate(-28)"><image x="-24" y="-12" width="48" height="24" href="${galaxy}" mask="url(#galaxy-edge)" opacity=".7"/></g>`:'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128" viewBox="0 0 480 128"><defs><radialGradient id="fade"><stop stop-color="white"/><stop offset=".4" stop-color="white" stop-opacity=".6"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#cfeaff" stop-opacity=".6"/><stop offset=".25" stop-color="#75baff" stop-opacity=".15"/><stop offset="1" stop-color="#75baff" stop-opacity="0"/></radialGradient><mask id="cloud-edge"><ellipse cx="${[335,360,320,340][i]}" cy="70" rx="140" ry="90" fill="url(#fade)"/></mask><mask id="galaxy-edge"><ellipse rx="24" ry="12" fill="url(#fade)"/></mask></defs><image x="190" y="-32" width="280" height="200" preserveAspectRatio="xMidYMid slice" href="${nebula}" mask="url(#cloud-edge)" opacity="${[.26,.12,.16,.33][i]}"/>${stars}${spark}${galaxyArt}</svg>`;
  writeFileSync(fileURLToPath(new URL(`deep-space-${i}.svg`,root)),svg+'\n');
}
// Shade the existing NASA planet sprites with vector overlays. The source
// photographs remain intact; each sprite is a plain, offline SVG image.
for(const name of ['mars','mercury','saturn']){
  let svg=readFileSync(new URL(name+'.svg',root),'utf8');
  const [,width,height]=svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const cx=name==='saturn'?278:256,cy=name==='saturn'?70:height/2,r=name==='saturn'?62:130;
  const shade=`<defs><clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><linearGradient id="night"><stop stop-color="#02050b" stop-opacity=".10"/><stop offset=".2" stop-color="#010207" stop-opacity=".8"/><stop offset=".45" stop-color="#000104" stop-opacity=".99"/></linearGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#night)"/><circle cx="${cx+22}" cy="${cy-4}" r="${r-2}" fill="#000104" opacity=".98" clip-path="url(#disc)"/>`;
  svg=svg.replace('<image ',`<image opacity="${name==='saturn'?'.52':'.78'}" `).replace('</svg>',shade+'</svg>');
  writeFileSync(fileURLToPath(new URL(`reference-${name}.svg`,root)),svg);
}
