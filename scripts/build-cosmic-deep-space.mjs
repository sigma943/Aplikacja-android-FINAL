import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = new URL('../public/themes/kosmos/', import.meta.url);
import sharp from 'sharp';
// Resize the photographic masters to the maximum panel sampling size once.
// Inline WebP remains self-contained and works offline inside CSS SVG images.
const photo = async name => `data:image/webp;base64,${(await sharp(fileURLToPath(new URL('../assets/cosmos-source/'+name,import.meta.url))).resize({width:512,withoutEnlargement:true}).webp({quality:85,effort:6}).toBuffer()).toString('base64')}`;
const nebula = await photo('orion.png'), galaxy = await photo('sombrero.png');
const whirlpool=`data:image/webp;base64,${(await sharp(fileURLToPath(new URL('../assets/cosmos-source/whirlpool.jpg',import.meta.url))).extract({left:45,top:12,width:850,height:850}).resize(384,384).webp({quality:84,effort:6}).toBuffer()).toString('base64')}`;
// Reference compositions: all bright detail stays to the right of the text.
for (let i = 0; i < 4; i++) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128" viewBox="0 0 480 128"><defs><linearGradient id="panel-edge" x2="0" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".12" stop-color="white"/><stop offset=".85" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="panel-fade"><rect width="480" height="128" fill="url(#panel-edge)"/></mask><radialGradient id="fade"><stop stop-color="white"/><stop offset=".4" stop-color="white" stop-opacity=".6"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#cfeaff" stop-opacity=".6"/><stop offset=".25" stop-color="#75baff" stop-opacity=".15"/><stop offset="1" stop-color="#75baff" stop-opacity="0"/></radialGradient><mask id="cloud-edge"><ellipse cx="${[335,360,320,340][i]}" cy="70" rx="140" ry="90" fill="url(#fade)"/></mask></defs><g mask="url(#panel-fade)"><image x="190" y="-32" width="280" height="200" preserveAspectRatio="xMidYMid slice" href="${nebula}" mask="url(#cloud-edge)" opacity="${[.26,.12,.16,.33][i]}"/></g></svg>`;
  writeFileSync(fileURLToPath(new URL(`deep-space-${i}.svg`,root)),svg+'\n');
}
// Independent galaxy sprites let the scene solver place complete photographs
// in free space instead of moving a fixed atlas containing several objects.
for(const [name,source] of [['whirlpool',whirlpool],['sombrero',galaxy]]){
  const height=name==='whirlpool'?128:64;
  writeFileSync(fileURLToPath(new URL(`galaxy-${name}.svg`,root)),`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><radialGradient id="fade"><stop stop-color="white"/><stop offset=".68" stop-color="white" stop-opacity=".95"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient><mask id="edge"><ellipse cx="64" cy="64" rx="64" ry="${height/2}" fill="url(#fade)"/></mask></defs><image data-galaxy="photograph" x="0" y="${64-height/2}" width="128" height="${height}" href="${source}" mask="url(#edge)" opacity=".88"/></svg>\n`);
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

// A bounded, filled solar disc with granulation and a soft corona, offline.
let solarState=943731;
const solarRandom=()=>{solarState=(Math.imul(solarState,1664525)+1013904223)>>>0;return solarState/4294967296;};
const granules=Array.from({length:240},()=>{const angle=solarRandom()*Math.PI*2,r=Math.sqrt(solarRandom())*29;return `<circle cx="${(48+Math.cos(angle)*r).toFixed(2)}" cy="${(48+Math.sin(angle)*r).toFixed(2)}" r="${(.3+solarRandom()*.9).toFixed(2)}" fill="${solarRandom()>.5?'#fff3af':'#a94e19'}" opacity=".22"/>`;}).join('');
writeFileSync(fileURLToPath(new URL('sun.svg',root)),`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><radialGradient id="corona"><stop stop-color="#ffd36e" stop-opacity=".45"/><stop offset=".7" stop-color="#ed9d37" stop-opacity=".16"/><stop offset="1" stop-color="#ed9d37" stop-opacity="0"/></radialGradient><radialGradient id="disc"><stop stop-color="#fff4bd"/><stop offset=".5" stop-color="#ffd574"/><stop offset=".9" stop-color="#f3ac46"/><stop offset="1" stop-color="#cc702b"/></radialGradient></defs><circle cx="48" cy="48" r="46" fill="url(#corona)"/><circle cx="48" cy="48" r="30" fill="url(#disc)"/>${granules}</svg>`);
