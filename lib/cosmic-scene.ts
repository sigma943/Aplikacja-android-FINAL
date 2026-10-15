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
    seedFor(key:string){return cosmicKeySeed(seed,`${epoch}:${tab}:${key}`);},
    enter(next:string){if(next===tab)return false;tab=next;epoch++;scenes.clear();return true;},
    scene(key:string,create:(seed:number)=>ReturnType<typeof cosmicScene>){
      let scene=scenes.get(key);
      if(!scene){scene=create(cosmicKeySeed(seed,`${epoch}:${tab}:${key}`));scenes.set(key,scene);}
      return scene;
    },
  };
}


/** Poisson-style composition in screen coordinates, with visible diameter as depth. */
export function cosmicBackdrop(seed:number,previous?:{x:number;y:number;count?:number}){
  const random=cosmicRandom(seed);
  const counts=[2,3,4].filter(n=>n!==previous?.count),count=counts[Math.floor(random()*counts.length)];
  const families=Array.from({length:COSMIC_PLANETS.length},(_,i)=>i);
  for(let i=families.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[families[i],families[j]]=[families[j],families[i]];}
  // Approximate visible widths of the transparent NASA photo frames.
  const frameRatios=[.418,.443,.438,.506,.529,.59,.521,.504];
  const diameters=[90+random()*50,46+random()*18,24+random()*10,14+random()*6];
  const planets:{planet:number;x:number;y:number;size:number;diameter:number}[]=[];
  for(let i=0;i<count;i++){
    let chosen={x:50,y:50},best=-Infinity;
    for(let attempt=0;attempt<200;attempt++){
      const x=(i===0?20:10)+random()*(i===0?60:80),y=14+random()*70;
      const clearance=Math.min(...planets.map(p=>Math.min(Math.hypot(x-p.x,y-p.y)/27,Math.hypot((x-p.x)*3.93,(y-p.y)*8.51)/((diameters[i]+p.diameter)/2+24))),i===0&&previous?Math.hypot(x-previous.x,y-previous.y)/24:Infinity);
      if(clearance>best){best=clearance;chosen={x,y};}
      if(clearance>=1)break;
    }
    if(i===0&&previous&&best<1)chosen={x:previous.x<50?80:20,y:previous.y<50?84:14};
    planets.push({planet:families[i],...chosen,size:diameters[i]/frameRatios[families[i]],diameter:diameters[i]});
  }
  return {planets,focusX:15+random()*70,focusY:random()*100,zoom:145+random()*35,tint:Math.floor(random()*3)};
}

export function cosmicBackdropStyle(scene:ReturnType<typeof cosmicBackdrop>){
  const tones=['rgba(18,28,64,.24)','rgba(42,20,62,.24)','rgba(10,38,50,.24)'];
  return {
    '--cosmos-light-rgb':['111,162,255','191,128,232','97,191,207'][scene.tint],
    '--cosmos-nebula-image':`linear-gradient(180deg,rgba(3,6,17,.54),rgba(3,6,17,.34) 45%,rgba(3,6,17,.66)),linear-gradient(${tones[scene.tint]},${tones[scene.tint]}),url("/themes/kosmos/nebula.jpg")`,
    '--cosmos-nebula-size':`100% 100%,100% 100%,${scene.zoom.toFixed(1)}% auto`,
    '--cosmos-nebula-position':`center,center,${scene.focusX.toFixed(1)}% ${scene.focusY.toFixed(1)}%`,
    '--cosmos-scene-image':[
      'linear-gradient(180deg,rgba(3,6,17,.54),rgba(3,6,17,.34) 45%,rgba(3,6,17,.66))',
      ...scene.planets.map(p=>COSMIC_PLANETS[p.planet]),
      `linear-gradient(${tones[scene.tint]},${tones[scene.tint]})`,
      'url("/themes/kosmos/nebula.jpg")',
    ].join(','),
    '--cosmos-scene-size':['100% 100%',...scene.planets.map(p=>`${p.size.toFixed(1)}px auto`),'100% 100%',`${scene.zoom.toFixed(1)}% auto`].join(','),
    '--cosmos-scene-position':['center',...scene.planets.map(p=>`calc(${p.x.toFixed(1)}% + ${(p.size*(p.x/100-.5)).toFixed(1)}px) calc(${p.y.toFixed(1)}% + ${(p.size*(p.planet===5?170:288)/512*(p.y/100-.5)).toFixed(1)}px)`),'center',`${scene.focusX.toFixed(1)}% ${scene.focusY.toFixed(1)}%`].join(','),
  };
}


/** One immutable sky per main-menu visit. Options and detail panes are not tabs. */
export function cosmicScreenSession(seed:number){
  let tab:string|undefined,epoch=0;
  let scene=cosmicBackdrop(cosmicKeySeed(seed,'screen:0'));
  return {
    get tab(){return tab;},get epoch(){return epoch;},get scene(){return scene;},
    enterTab(next:string|undefined){
      if(!next||!['map','stops','admin'].includes(next)||next===tab)return false;
      if(tab===undefined){tab=next;return false;}
      tab=next;epoch++;
      scene=cosmicBackdrop(cosmicKeySeed(seed,`screen:${epoch}`),{...scene.planets[0],count:scene.planets.length});
      return true;
    },
  };
}
