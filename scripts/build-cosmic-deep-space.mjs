import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = new URL('../public/themes/kosmos/', import.meta.url);
const photo = name => `data:image/png;base64,${readFileSync(new URL(name, root)).toString('base64')}`;
const nebula = photo('orion.png'), galaxy = photo('sombrero.png');
// Reference compositions: all bright detail stays to the right of the text.
for (let i = 0; i < 4; i++) {
  let state=731+i*943;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const colors=['#d6eaff','#8ac8ff','#ffe0ab','#ffa898','#cfb5ff'];
  const stars=Array.from({length:120},()=>{
    const x=(218+random()*246).toFixed(1),y=(8+random()*110).toFixed(1);
    const color=colors[Math.floor(random()*colors.length)],bright=random()>.89;
    const radius=(bright?.65+random()*.6:.18+random()*.44).toFixed(2);
    return `<g transform="translate(${x} ${y})">${bright?`<circle r="${3+random()*4}" fill="url(#spark)"/><path d="M-3 0H3M0 -3V3" stroke="${color}" stroke-width=".3" opacity=".65"/>`:''}<circle r="${radius}" fill="${color}" opacity="${(.3+random()*.65).toFixed(2)}"/></g>`;
  }).join('');
  const spark='';
  const galaxyArt=[0,1].map(j=>{
    const x=[405,410,345,425][i]-j*42,y=[97,99,28,42][i]+j*22;
    const w=j?26:42+random()*14,h=w/2;
    if((i+j)%2===0){
      const arms=Array.from({length:3},(_,arm)=>{
        const points=Array.from({length:40},(_,step)=>{const t=step/39,angle=t*5+arm*Math.PI*2/3,r=t*w*.45;return `${(Math.cos(angle)*r).toFixed(2)} ${(Math.sin(angle)*r*.45).toFixed(2)}`;});
        return `<path d="M${points.join('L')}" fill="none" stroke="${i===2?'#e3aa9d':'#a4c9ee'}" stroke-width="1.2" opacity=".28"/>`;
      }).join('');
      return `<g transform="translate(${x} ${y}) rotate(${-30+i*18})"><ellipse rx="${w/2}" ry="${h/2}" fill="url(#spark)" opacity=".6"/>${arms}<ellipse rx="3.5" ry="1.8" fill="#ffe8c8" opacity=".7"/><ellipse rx="1.3" ry=".7" fill="#fff6e7" opacity=".9"/></g>`;
    }
    return `<g transform="translate(${x} ${y}) rotate(${-38+i*21+j*35})"><image x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" href="${galaxy}" mask="url(#galaxy-edge)" opacity="${j?.4:.78}"/></g>`;
  }).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128" viewBox="0 0 480 128"><defs><linearGradient id="panel-edge" x2="0" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".12" stop-color="white"/><stop offset=".85" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="panel-fade"><rect width="480" height="128" fill="url(#panel-edge)"/></mask><radialGradient id="fade"><stop stop-color="white"/><stop offset=".4" stop-color="white" stop-opacity=".6"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#cfeaff" stop-opacity=".6"/><stop offset=".25" stop-color="#75baff" stop-opacity=".15"/><stop offset="1" stop-color="#75baff" stop-opacity="0"/></radialGradient><mask id="cloud-edge"><ellipse cx="${[335,360,320,340][i]}" cy="70" rx="140" ry="90" fill="url(#fade)"/></mask><mask id="galaxy-edge"><ellipse rx="24" ry="12" fill="url(#fade)"/></mask></defs><g mask="url(#panel-fade)"><image x="190" y="-32" width="280" height="200" preserveAspectRatio="xMidYMid slice" href="${nebula}" mask="url(#cloud-edge)" opacity="${[.26,.12,.16,.33][i]}"/>${stars}${spark}${galaxyArt}</g></svg>`;
  writeFileSync(fileURLToPath(new URL(`deep-space-${i}.svg`,root)),svg+'\n');
}
// Shade the existing NASA planet sprites with vector overlays. The source
// photographs remain intact; each sprite is a plain, offline SVG image.
for(const name of ['mars','mercury','saturn']){
  let svg=readFileSync(new URL(name+'.svg',root),'utf8');
  const [,width,height]=svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const cx=name==='saturn'?278:256,cy=name==='saturn'?70:height/2,r=name==='saturn'?62:130;
  const shade=`<defs><clipPath id="disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><linearGradient id="night"><stop stop-color="#02050b" stop-opacity=".10"/><stop offset=".2" stop-color="#010207" stop-opacity=".8"/><stop offset=".45" stop-color="#000104" stop-opacity=".99"/></linearGradient></defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="#000104" opacity=".08"/><circle cx="${cx-27}" cy="${cy-4}" r="${r-2}" fill="#000104" opacity=".88" clip-path="url(#disc)"/>`;
  svg=svg.replace('<image ',`<image opacity="${name==='saturn'?'.82':'.94'}" `).replace('</svg>',shade+'</svg>');
  if(name==='saturn'){
    const contents=svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'));
    svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="300" viewBox="0 0 512 300"><g transform="translate(0 60) rotate(-24 256 85)">${contents}</g></svg>`;
  }
  writeFileSync(fileURLToPath(new URL(`reference-${name}.svg`,root)),svg);
}
