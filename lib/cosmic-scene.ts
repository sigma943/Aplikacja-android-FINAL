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
  const wisps = Array.from({length: 34}, (_, i) => {
    const x = random() * 640, y = band(x) + (random() - .5) * 58;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(22 + random() * 65).toFixed(1)}" ry="${(9 + random() * 23).toFixed(1)}" transform="rotate(${(-32 + random() * 35).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#${i % 3 ? 'nebula' : 'mist'})" opacity="${(.4 + random() * .6).toFixed(2)}"/>`;
  }).join('');
  const stars = Array.from({length: 125}, () => `<circle cx="${(random() * 640).toFixed(1)}" cy="${(random() * 400).toFixed(1)}" r="${(.2 + random() * .55).toFixed(2)}" opacity="${(.12 + random() * .4).toFixed(2)}"/>`).join('');
  const grains = Array.from({length: 230}, (_, i) => {
    const x = random() * 640, distance = (random() + random() + random() - 1.5) * 42;
    const y = band(x) + distance;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.18 + random() * .65).toFixed(2)}" fill="${i % 11 ? '#a69acb' : '#c2dfea'}" opacity="${(.15 + random() * .35).toFixed(2)}"/>`;
  }).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><radialGradient id="nebula"><stop stop-color="#9676b8" stop-opacity=".33"/><stop offset=".35" stop-color="#65517f" stop-opacity=".17"/><stop offset="1" stop-color="#15122c" stop-opacity="0"/></radialGradient><radialGradient id="mist"><stop stop-color="#6c9db2" stop-opacity=".29"/><stop offset=".4" stop-color="#3a547e" stop-opacity=".15"/><stop offset="1" stop-color="#0b172c" stop-opacity="0"/></radialGradient><radialGradient id="spark"><stop stop-color="#d7e9ff" stop-opacity=".5"/><stop offset=".15" stop-color="#89b5ed" stop-opacity=".18"/><stop offset="1" stop-color="#89b5ed" stop-opacity="0"/></radialGradient></defs>${wisps}<g fill="#c5d7f4">${stars}</g>${grains}<g fill="url(#spark)" opacity=".35"><circle cx="94" cy="256" r="4"/><circle cx="526" cy="136" r="3"/></g><circle cx="94" cy="256" r=".65" fill="#ecf4ff"/><circle cx="526" cy="136" r=".5" fill="#f4cfac"/></svg>`);
}
export const COSMIC_DUST = [dust(731), dust(1929), dust(4491), dust(8764)];

/** Seamless sky for long canvases; its stars never grow with content height. */
function sky(){
  const random=cosmicRandom(943731);
  const stars=Array.from({length:180},()=>`<circle cx="${(2+random()*636).toFixed(1)}" cy="${(2+random()*636).toFixed(1)}" r="${(.3+random()*.65).toFixed(2)}" opacity="${(.22+random()*.38).toFixed(2)}"/>`).join('');
  const clouds=Array.from({length:18},()=>{const x=random()*640,y=110+random()*420,rx=50+random()*95,ry=22+random()*35;return [-640,0,640].map(offset=>`<ellipse cx="${(x+offset).toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#sky-cloud)" opacity=".55"/>`).join('');}).join('');
  const wisps=Array.from({length:20},(_,i)=>{const x=random()*640,y=220+x*.15+Math.sin(x/100)*32,rx=30+random()*42,ry=9+random()*12;return [-640,0,640].map(offset=>`<ellipse cx="${(x+offset).toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#${i%3?'sky-cloud':'sky-mist'})" opacity=".72"/>`).join('');}).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><radialGradient id="sky-cloud"><stop stop-color="#9b87c6" stop-opacity=".33"/><stop offset=".5" stop-color="#536788" stop-opacity=".11"/><stop offset="1" stop-color="#080b17" stop-opacity="0"/></radialGradient><radialGradient id="sky-mist"><stop stop-color="#80b6cf" stop-opacity=".38"/><stop offset=".4" stop-color="#50788f" stop-opacity=".15"/><stop offset="1" stop-color="#080b17" stop-opacity="0"/></radialGradient></defs>${clouds}${wisps}<g fill="#becae7">${stars}</g></svg>`);
}
export const COSMIC_SKY=sky();
export const COSMIC_SUN=url('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><radialGradient id="corona"><stop stop-color="#ffbc56" stop-opacity=".22"/><stop offset=".6" stop-color="#f18a38" stop-opacity=".08"/><stop offset="1" stop-color="#f18a38" stop-opacity="0"/></radialGradient><radialGradient id="sun"><stop stop-color="#fff0b1"/><stop offset=".65" stop-color="#ffc35c"/><stop offset="1" stop-color="#e99039"/></radialGradient></defs><circle cx="48" cy="48" r="44" fill="url(#corona)"/><circle cx="48" cy="48" r="22" fill="url(#sun)"/><g fill="#cf7634" opacity=".17"><circle cx="38" cy="41" r="2"/><circle cx="53" cy="55" r="3"/><circle cx="57" cy="37" r="1.6"/><circle cx="41" cy="58" r="1.5"/></g></svg>');

/** Real NASA photographs, kept in their original aspect ratios and packaged offline. */
export const COSMIC_PLANET_NAMES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export const COSMIC_PLANETS = COSMIC_PLANET_NAMES.map(name => `url("/themes/kosmos/${name}.svg")`);

export function cosmicScene(seed: number, previous?: {x: number; planet: number}) {
  const r = cosmicRandom(seed);
  const scene = {
    planet: Math.floor(r() * COSMIC_PLANETS.length), showPlanet: r() > .68,
    x: (r() < .5 ? 48 : 80) + r() * 10, y: 64 + r() * 24, size: 50 + r() * 26,
    dust: Math.floor(r() * COSMIC_DUST.length), dustX: 50, dustY: 65, sun:r()<.08,
  };
  if (previous) {
    // Alternate the lower middle and outer edge, away from titles and favourite icons.
    if (Math.abs(scene.x - previous.x) < 22) scene.x = previous.x > 69 ? 48 + r() * 10 : 80 + r() * 10;
    if (scene.planet === previous.planet) scene.planet = (scene.planet + 1 + Math.floor(r() * (COSMIC_PLANETS.length - 1))) % COSMIC_PLANETS.length;
  }
  return scene;
}

/** At least two quiet cards between planets; no long empty run in a stop list. */
export function cosmicListScene(seed: number, previous?: ReturnType<typeof cosmicScene>, gap = 2) {
  const scene = cosmicScene(seed, previous);
  scene.showPlanet = gap >= 2 && (scene.showPlanet || gap >= 4);
  return scene;
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-card,.pks-option-card,.widget-generator';
export function cosmicOrb(scene:ReturnType<typeof cosmicScene>){return scene.sun?COSMIC_SUN:COSMIC_PLANETS[scene.planet];}

/** React-owned panels keep these exact styles throughout one mounted visit. */
export function cosmicPanelStyle(seed:number,departures=false){
  const scene=cosmicScene(seed);
  return {
    '--cosmos-planet':departures||scene.showPlanet?cosmicOrb(scene):'none',
    '--cosmos-planet-position':departures?'76% 96px':`${scene.x.toFixed(1)}% ${scene.y.toFixed(1)}%`,
    '--cosmos-planet-size':departures?'56px':`${scene.size.toFixed(1)}px`,
    '--cosmos-dust':COSMIC_DUST[scene.dust],
    '--cosmos-dust-position':`${scene.dustX}% ${scene.dustY}%`,
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
    enter(next:string){if(next===tab)return false;tab=next;epoch++;scenes.clear();return true;},
    scene(key:string,create:(seed:number)=>ReturnType<typeof cosmicScene>){
      let scene=scenes.get(key);
      if(!scene){scene=create(cosmicKeySeed(seed,`${epoch}:${tab}:${key}`));scenes.set(key,scene);}
      return scene;
    },
  };
}
