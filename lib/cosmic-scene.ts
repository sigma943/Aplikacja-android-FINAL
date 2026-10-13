const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export function cosmicRandom(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6d2b79f5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Static, irregular nebula filaments: soft clouds with fine dust instead of broad stripes. */
function dust(seed: number) {
  const random = cosmicRandom(seed);
  const band = (x: number) => 306 - x * .14 + Math.sin(x / 105) * 21;
  const wisps = Array.from({length: 10}, (_, i) => {
    const x = random() * 640, y = band(x) + (random() - .5) * 58;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(22 + random() * 65).toFixed(1)}" ry="${(9 + random() * 23).toFixed(1)}" transform="rotate(${(-32 + random() * 35).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#${i % 3 ? 'nebula' : 'mist'})" opacity="${(.18 + random() * .28).toFixed(2)}"/>`;
  }).join('');
  const stars = Array.from({length: 180}, () => `<circle cx="${(random() * 640).toFixed(1)}" cy="${(random() * 400).toFixed(1)}" r="${(.3 + random() * .7).toFixed(2)}" opacity="${(.12 + random() * .4).toFixed(2)}"/>`).join('');
  const grains = Array.from({length: 200}, (_, i) => {
    const x = random() * 640, distance = (random() + random() + random() - 1.5) * 42;
    const y = band(x) + distance;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.18 + random() * .65).toFixed(2)}" fill="${i % 11 ? '#a69acb' : '#c2dfea'}" opacity="${(.15 + random() * .35).toFixed(2)}"/>`;
  }).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><radialGradient id="nebula"><stop stop-color="#9676b8" stop-opacity=".33"/><stop offset=".35" stop-color="#65517f" stop-opacity=".17"/><stop offset="1" stop-color="#15122c" stop-opacity="0"/></radialGradient><radialGradient id="mist"><stop stop-color="#6c9db2" stop-opacity=".29"/><stop offset=".4" stop-color="#3a547e" stop-opacity=".15"/><stop offset="1" stop-color="#0b172c" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#d7e9ff" stop-opacity=".5"/><stop offset=".15" stop-color="#89b5ed" stop-opacity=".18"/><stop offset="1" stop-color="#89b5ed" stop-opacity="0"/></radialGradient></defs>${wisps}<g fill="#c5d7f4">${stars}</g>${grains}<g fill="url(#spark)" opacity=".35"><circle cx="94" cy="256" r="4"/><circle cx="526" cy="136" r="3"/></g><circle cx="94" cy="256" r=".65" fill="#ecf4ff"/><circle cx="526" cy="136" r=".5" fill="#f4cfac"/></svg>`);
}
export const COSMIC_DUST = [dust(731), dust(1929), dust(4491), dust(8764)];

/** Seamless sky for long canvases; its stars never grow with content height. */
export function cosmicSky(seed=943731){
  const random=cosmicRandom(seed);
  const stars=Array.from({length:520},()=>`<circle cx="${(2+random()*636).toFixed(1)}" cy="${(2+random()*636).toFixed(1)}" r="${(.35+random()*.9).toFixed(2)}" opacity="${(.35+random()*.5).toFixed(2)}"/>`).join('');
  const clouds=Array.from({length:8},()=>{const x=random()*640,y=110+random()*420,rx=50+random()*95,ry=22+random()*35;return [-640,0,640].map(offset=>`<ellipse cx="${(x+offset).toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#sky-cloud)" opacity=".55"/>`).join('');}).join('');
  const wisps=Array.from({length:6},(_,i)=>{const x=random()*640,y=220+x*.15+Math.sin(x/100)*32,rx=30+random()*42,ry=9+random()*12;return [-640,0,640].map(offset=>`<ellipse cx="${(x+offset).toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#${i%3?'sky-cloud':'sky-mist'})" opacity=".34"/>`).join('');}).join('');
  const gx=80+random()*480,gy=75+random()*490,angle=-45+random()*90;
  const spiral=`<g data-galaxy="spiral" transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(1 .48)"><ellipse rx="23" ry="14" fill="url(#galaxy-halo)"/><g fill="none" stroke="#94a4c0" stroke-width=".65" opacity=".6"><path d="M0 0C5 -8 17 -8 18 0S6 15 -8 8S-16 -7 -4 -10"/><path d="M0 0C-5 8 -17 8 -18 0S-6 -15 8 -8S16 7 4 10"/></g><ellipse rx="5" ry="3" fill="url(#galaxy-core)"/><ellipse rx="1.2" ry=".9" fill="#ffe3bb" opacity=".85"/></g>`;
  const edge=`<g data-galaxy="edge-on" transform="translate(${(80+(gx+190)%480).toFixed(1)} ${(75+(gy+260)%490).toFixed(1)}) rotate(${(-angle-15).toFixed(1)})"><ellipse rx="19" ry="5" fill="url(#galaxy-halo)"/><ellipse rx="12" ry="1.5" fill="url(#galaxy-core)" opacity=".5"/><path d="M-14 1Q0 -1 14 1" fill="none" stroke="#667a9f" stroke-width=".7"/><ellipse rx="2" ry="1" fill="#ffebd1" opacity=".8"/></g>`;
  const galaxy=spiral+edge;
  const sparks=Array.from({length:5},()=>{const x=12+random()*616,y=12+random()*616;return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="5" fill="url(#star-halo)"/><path d="M-4 0H4M0 -4V4" stroke="#cce4ff" stroke-width=".45" opacity=".6"/><circle r=".85" fill="#e7f4ff"/></g>`;}).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><radialGradient id="sky-cloud"><stop stop-color="#9b87c6" stop-opacity=".13"/><stop offset=".5" stop-color="#536788" stop-opacity=".08"/><stop offset="1" stop-color="#080b17" stop-opacity="0"/></radialGradient><radialGradient id="sky-mist"><stop stop-color="#80b6cf" stop-opacity=".12"/><stop offset=".4" stop-color="#50788f" stop-opacity=".08"/><stop offset="1" stop-color="#080b17" stop-opacity="0"/></radialGradient><radialGradient id="galaxy-halo"><stop stop-color="#8c8dab" stop-opacity=".45"/><stop offset="1" stop-color="#8292b8" stop-opacity="0"/></radialGradient><radialGradient id="galaxy-core"><stop stop-color="#ffe6c3" stop-opacity=".95"/><stop offset="1" stop-color="#eec79d" stop-opacity="0"/></radialGradient><radialGradient id="star-halo"><stop stop-color="#dfedff" stop-opacity=".65"/><stop offset=".25" stop-color="#88b8ed" stop-opacity=".25"/><stop offset="1" stop-color="#88b8ed" stop-opacity="0"/></radialGradient></defs>${clouds}${wisps}<g fill="#becae7">${stars}</g>${galaxy}${sparks}</svg>`);
}
export const COSMIC_SKY=cosmicSky();
export const COSMIC_SUN=url('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><radialGradient id="corona"><stop stop-color="#ffbc56" stop-opacity=".22"/><stop offset=".6" stop-color="#f18a38" stop-opacity=".08"/><stop offset="1" stop-color="#f18a38" stop-opacity="0"/></radialGradient><radialGradient id="sun"><stop stop-color="#fff0b1"/><stop offset=".65" stop-color="#ffc35c"/><stop offset="1" stop-color="#e99039"/></radialGradient></defs><circle cx="48" cy="48" r="44" fill="url(#corona)"/><circle cx="48" cy="48" r="22" fill="url(#sun)"/><g fill="#cf7634" opacity=".17"><circle cx="38" cy="41" r="2"/><circle cx="53" cy="55" r="3"/><circle cx="57" cy="37" r="1.6"/><circle cx="41" cy="58" r="1.5"/></g></svg>');

/** Real NASA photographs, kept in their original aspect ratios and packaged offline. */
export const COSMIC_PLANET_NAMES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export const COSMIC_PLANETS = COSMIC_PLANET_NAMES.map(name => `url("/themes/kosmos/${name}.svg")`);

export function cosmicScene(seed: number, previous?: {x: number; planet: number}) {
  const r = cosmicRandom(seed);
  const scene = {
    planet: Math.floor(r() * COSMIC_PLANETS.length), showPlanet: r() > .35,
    x: (r() < .5 ? 48 : 80) + r() * 10, y: 64 + r() * 24, size: 50 + r() * 26,
    dust: Math.floor(r() * COSMIC_DUST.length), dustX: 50, dustY: 65, sun:r()<.08, starX:Math.floor(r()*480), starY:Math.floor(r()*480),
  };
  if (previous) {
    // Alternate the lower middle and outer edge, away from titles and favourite icons.
    if (Math.abs(scene.x - previous.x) < 22) scene.x = previous.x > 69 ? 48 + r() * 10 : 80 + r() * 10;
    if (scene.planet === previous.planet) scene.planet = (scene.planet + 1 + Math.floor(r() * (COSMIC_PLANETS.length - 1))) % COSMIC_PLANETS.length;
  }
  return scene;
}

/** Small planets on alternating cards, with at most two quiet cards in a row. */
export function cosmicListScene(seed: number, previous?: ReturnType<typeof cosmicScene>, gap = 2) {
  const scene = cosmicScene(seed, previous);
  scene.showPlanet = gap >= 1 && (scene.showPlanet || gap >= 2);
  return scene;
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-panel,.pks-personal-card,.pks-option-card,.widget-generator';
export function cosmicOrb(scene:ReturnType<typeof cosmicScene>){return scene.sun?COSMIC_SUN:COSMIC_PLANETS[scene.planet];}

/** React-owned panels keep these exact styles throughout one mounted visit. */
export function cosmicPanelStyle(seed:number,departures=false){
  const scene=cosmicScene(seed);
  return {
    '--cosmos-planet':departures||scene.showPlanet?cosmicOrb(scene):'none',
    '--cosmos-planet-position':departures?'68% 50%':`${scene.x.toFixed(1)}% ${scene.y.toFixed(1)}%`,
    '--cosmos-planet-size':departures?'48px':`${scene.size.toFixed(1)}px`,
    '--cosmos-dust':COSMIC_DUST[scene.dust],
    '--cosmos-dust-position':`${scene.dustX}% ${scene.dustY}%`,
    '--cosmos-star-position':`${scene.starX}px ${scene.starY}px`,
    '--cosmos-secondary-orb':seed%7===0?COSMIC_SUN:COSMIC_PLANETS[(scene.planet+3)%COSMIC_PLANETS.length],
  };
}

export function cosmicKeySeed(seed:number,key:string){
  let hash=seed>>>0;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
  return hash;
}

/** A visit belongs to an actual navigation tab, never to a DOM node or refresh. */
export function cosmicVisitSession(seed:number){
  let tab:string|null=null,epoch=0;
  const scenes=new Map<string,ReturnType<typeof cosmicScene>>();
  return {
    get tab(){return tab;},get epoch(){return epoch;},
    enter(next:string,overlay=false){if(overlay||next===tab)return false;tab=next;epoch++;scenes.clear();return true;},
    scene(key:string,create:(seed:number)=>ReturnType<typeof cosmicScene>){
      let scene=scenes.get(key);
      if(!scene){scene=create(cosmicKeySeed(seed,`${epoch}:${tab}:${key}`));scenes.set(key,scene);}
      return scene;
    },
  };
}
