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

/** Local Hubble photographs in softly masked, restrained panel compositions. */
export const COSMIC_DUST = [0, 1, 2, 3].map(index => `url("/themes/kosmos/deep-space-${index}.svg")`);

/** A single sparse sky layer, shared by first paint and mounted screens. */
export function cosmicSky(seed = 943731) {
  const random = cosmicRandom(seed);
  const stars = Array.from({length: 96}, () => `<circle cx="${(2 + random() * 636).toFixed(1)}" cy="${(2 + random() * 636).toFixed(1)}" r="${(.25 + random() ** 3 * 1.25).toFixed(2)}" fill="${['#cce6ff','#8fc8ff','#ffe0ac','#f3b2a2','#cab6ff'][Math.floor(random()*5)]}" opacity="${(.3 + random() * .60).toFixed(2)}"/>`).join('');
  const sparks = [[116, 193], [511, 461]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="4" fill="url(#star-halo)"/><path d="M-3 0H3M0 -3V3" stroke="#b6d5f5" stroke-width=".3" opacity=".4"/><circle r=".55" fill="#d7e7ff"/></g>`).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><radialGradient id="sky-cloud"><stop stop-color="#373052" stop-opacity=".13"/><stop offset="1" stop-color="#080b17" stop-opacity="0"/></radialGradient><radialGradient id="star-halo"><stop stop-color="#dfedff" stop-opacity=".4"/><stop offset=".25" stop-color="#88b8ed" stop-opacity=".12"/><stop offset="1" stop-color="#88b8ed" stop-opacity="0"/></radialGradient></defs><ellipse cx="460" cy="360" rx="160" ry="95" fill="url(#sky-cloud)"/><g fill="#becae7">${stars}</g>${sparks}</svg>`);
}
export const COSMIC_SKY = cosmicSky();
export const COSMIC_SUN=url('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><radialGradient id="corona"><stop stop-color="#ffbc56" stop-opacity=".22"/><stop offset=".6" stop-color="#f18a38" stop-opacity=".08"/><stop offset="1" stop-color="#f18a38" stop-opacity="0"/></radialGradient><radialGradient id="sun"><stop stop-color="#fff0b1"/><stop offset=".65" stop-color="#ffc35c"/><stop offset="1" stop-color="#e99039"/></radialGradient></defs><circle cx="48" cy="48" r="44" fill="url(#corona)"/><circle cx="48" cy="48" r="22" fill="url(#sun)"/><g fill="#cf7634" opacity=".17"><circle cx="38" cy="41" r="2"/><circle cx="53" cy="55" r="3"/><circle cx="57" cy="37" r="1.6"/><circle cx="41" cy="58" r="1.5"/></g></svg>');

/** Real NASA photographs, kept in their original aspect ratios and packaged offline. */
export const COSMIC_PLANET_NAMES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export const COSMIC_PLANETS = COSMIC_PLANET_NAMES.map(name => `url("/themes/kosmos/${name}.svg")`);

/** Four authored compositions matching the reference; randomness chooses a
 * composition and planet family, never arbitrary coordinates or DOM order. */
export function cosmicScene(seed: number, _previous?: {x: number; planet: number}, slot?:number) {
  const r = cosmicRandom(seed), layout = slot===undefined?Math.floor(r()*4):Math.abs(slot)%4;
  const positions = [{x:74,y:5,size:66},{x:71,y:56,size:90},{x:73,y:95,size:70},{x:76,y:68,size:64}];
  return {
    ...positions[layout], planet: slot===undefined?Math.floor(r()*8):[3,5,0,2][layout], showPlanet: layout !== 3,
    dust: layout, dustX:50, dustY:50, sun:false,
    starX:Math.floor(r()*480), starY:Math.floor(r()*480),
  };
}

/** Identity-based scenes are unaffected by filtering or asynchronous row order. */
export function cosmicListScene(seed: number, _previous?: ReturnType<typeof cosmicScene>, _gap = 2) {
  return cosmicScene(seed);
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-panel,.pks-personal-card,.pks-option-card,.widget-generator,.personal-group,[data-interface-panel],[data-interface-card],.widget-settings-card,.widget-personalization';
export function cosmicOrb(scene:ReturnType<typeof cosmicScene>){
  const name=COSMIC_PLANET_NAMES[scene.planet];
  return `url("/themes/kosmos/${[0,3,5].includes(scene.planet)?'reference-':''}${name}.svg")`;
}

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
    '--cosmos-secondary-orb':cosmicOrb(cosmicScene(seed+701)),
  };
}

export function cosmicKeySeed(seed:number,key:string){
  let hash=seed>>>0;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
  return hash;
}

/** A visit belongs to an actual navigation tab, never to a DOM node or refresh. */
export function cosmicVisitSession(seed:number){
  let tab:string|null=null,epoch=1;
  const scenes=new Map<string,ReturnType<typeof cosmicScene>>();
  return {
    get tab(){return tab;},get epoch(){return epoch;},
    bind(next:string){if(tab===null||tab==='root:tab')tab=next;},
    sync(next:string|undefined,overlay=false){
      if(!next||overlay||next==='options')return false;
      const key=next.includes(':')?next:`${next}:tab`;
      if(tab===null||tab==='root:tab'){tab=key;return false;}
      if(key===tab)return false;
      tab=key;epoch++;scenes.clear();return true;
    },
    enter(next:string,overlay=false){if(overlay||next===tab)return false;tab=next;epoch++;scenes.clear();return true;},
    scene(key:string,create:(seed:number)=>ReturnType<typeof cosmicScene>){
      let scene=scenes.get(key);
      if(!scene){
        // Map decorations are an authored, repeatable layout even across app restarts.
        const map = tab === 'map' || tab?.startsWith('map:');
        scene=create(map ? cosmicKeySeed(943731, `map:${key}`) : cosmicKeySeed(seed,`${epoch}:${tab}:${key}`));
        scenes.set(key,scene);
      }
      return scene;
    },
  };
}
