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
/** Real NASA photographs, kept in their original aspect ratios and packaged offline. */
export const COSMIC_PLANET_NAMES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;

export type CosmicPanelKind = 'stop-card' | 'content' | 'row' | 'controls' | 'admin';

/** A seeded, stratified field. Rejection sampling spaces bright stars apart;
 * the left reading zone has dimmer stars and no galaxies or diffraction spikes.
 * All detail is static vector art: no filters, layout reads or animation loops. */
export function cosmicPanelSky(seed: number, kind: CosmicPanelKind = 'content') {
  const r=cosmicRandom(seed ^ 0x59ad3b17), dense=kind==='row'||kind==='admin'||kind==='controls';
  const palette=['#b7dcff','#7eafff','#ffd5a0','#eda3b3','#c7a4ff','#e4f2ff'];
  const points:{x:number;y:number;bright:boolean}[]=[];
  for(let attempt=0;attempt<220&&points.length<(dense?42:66);attempt++){
    const x=4+r()*472,y=4+r()*172,bright=x>245&&r()>.85;
    if(points.some(p=>Math.hypot(x-p.x,y-p.y)<(bright||p.bright?15:5)))continue;
    points.push({x,y,bright});
  }
  const stars=points.map(({x,y,bright})=>{
    const color=palette[Math.floor(r()*palette.length)],size=bright?.7+r()*.6:.2+r()**2*.65;
    const opacity=x<220?.18+r()*.2:.5+r()*.4;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${bright?`<circle r="${(3+r()*3).toFixed(1)}" fill="url(#halo)"/><path d="M-3 0H3M0 -3V3" stroke="${color}" stroke-width=".35" opacity=".6"/>`:''}<circle r="${size.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}"/></g>`;
  }).join('');
  // Twelve layout families, with independently varied inclination, scale,
  // colour and spiral pitch; a small satellite never overlaps the main galaxy.
  const family=Math.floor(r()*12),cx=285+r()*125,cy=32+r()*110;
  const galaxies=Array.from({length:dense?1:2},(_,index)=>{
    const x=index?245+r()*22:cx,y=index?(cy<90?140:28):cy;
    const radius=(index?7:12)+r()*(index?4:12),tilt=-65+r()*130,flat=.25+r()*.38;
    const color=palette[(family+index)%palette.length];
    const arms=Array.from({length:family%2+2},(_,arm)=>{
      const points=Array.from({length:24},(_,step)=>{
        const t=step/23,angle=t*(4+family*.12)+arm*Math.PI*2/(family%2+2),rad=2+t*radius;
        return `${(Math.cos(angle)*rad).toFixed(1)} ${(Math.sin(angle)*rad*flat).toFixed(1)}`;
      });
      return `<path d="M${points.join('L')}" fill="none" stroke="${color}" stroke-width=".65" opacity=".38"/>`;
    }).join('');
    return `<g data-galaxy="${family%3}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(1)})"><ellipse rx="${(radius*1.5).toFixed(1)}" ry="${(radius*flat).toFixed(1)}" fill="url(#halo)"/>${family%3===0?`<ellipse rx="${radius.toFixed(1)}" ry="${(radius*flat*.3).toFixed(1)}" fill="none" stroke="${color}" opacity=".3"/>`:arms}<ellipse rx="2.1" ry="1.1" fill="#ffe5c2" opacity=".65"/><circle r=".65" fill="#fff7df" opacity=".9"/></g>`;
  }).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 480 180"><defs><radialGradient id="sky-cloud"><stop stop-color="${palette[family%palette.length]}" stop-opacity=".065"/><stop offset="1" stop-opacity="0"/></radialGradient><radialGradient id="halo"><stop stop-color="#d8eaff" stop-opacity=".45"/><stop offset=".25" stop-color="#9bbcff" stop-opacity=".12"/><stop offset="1" stop-color="#9bbcff" stop-opacity="0"/></radialGradient></defs><ellipse cx="${cx.toFixed(1)}" cy="90" rx="140" ry="85" fill="url(#sky-cloud)"/>${stars}${galaxies}</svg>`);
}

/** Identity, visit and surface role choose independent channels. Changing the
 * amount of star detail cannot move a planet or change its photographic atlas. */
export function cosmicScene(seed: number, _previous?: {x: number; planet: number}, slot?:number, kind:CosmicPanelKind='content') {
  const geometry=cosmicRandom(seed ^ 0x2c71d9a3), art=cosmicRandom(seed ^ 0x7f4a7c15);
  const layout=slot===undefined?Math.floor(geometry()*12):Math.abs(slot)%12;
  return {
    x:64+geometry()*9,y:18+(layout%3)*25+geometry()*12,size:52+geometry()*24,
    planet:Math.floor(art()*8),showPlanet:layout%4!==3,
    dust:Math.floor(art()*4),dustX:25+Math.floor(art()*51),dustY:20+Math.floor(art()*61),sun:false,
    starX:Math.floor(geometry()*480),starY:Math.floor(geometry()*180),
    sky:cosmicPanelSky(seed,kind),layout,
  };
}

/** Planets belong only to the catalogue's decorative strip. Rows, map controls
 * and administrative cards get their own galaxies without competing with text. */
export function cosmicPanelScene(seed:number,kind:CosmicPanelKind){
  const scene=cosmicScene(seed,undefined,undefined,kind);
  return {...scene,showPlanet:kind==='stop-card'&&scene.showPlanet};
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-panel,.pks-personal-card,.pks-option-card,.widget-generator,.personal-group,[data-interface-panel],[data-interface-card],.widget-settings-card,.widget-personalization,[data-departure-row],[data-cosmic-surface]';
export function cosmicOrb(scene:ReturnType<typeof cosmicScene>){
  const name=COSMIC_PLANET_NAMES[scene.planet];
  return `url("/themes/kosmos/${[0,3,5].includes(scene.planet)?'reference-':''}${name}.svg")`;
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
        // Large virtual catalogues must not retain every visited SVG. Evicted
        // scenes reconstruct byte-for-byte from identity and the visit seed.
        if(scenes.size>384)scenes.delete(scenes.keys().next().value!);
      }
      return scene;
    },
  };
}
