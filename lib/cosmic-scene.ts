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

export type CosmicPanelKind = 'stop-card' | 'content' | 'row' | 'controls' | 'admin' | 'ornament';

export type CosmicBody = {role:'planet'|'galaxy';x:number;y:number;radius:number};
export type CosmicZone = {left:number;top:number;right:number;bottom:number};
const WIDTH=480,HEIGHT=180;
const PALETTE=['#b7dcff','#7eafff','#ffd5a0','#eda3b3','#c7a4ff','#e4f2ff'];
const channel=(seed:number,name:string)=>cosmicRandom(cosmicKeySeed(seed,name));
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** A scene is planned in a fixed art coordinate system, never from DOM order,
 * refresh timestamps or neighbouring mounted cards. Named random streams make
 * asset selection, geometry and star detail independent of each other. */
export function cosmicComposition(seed:number,kind:CosmicPanelKind='content'){
  const identity=channel(seed,'identity:v2'),geometry=channel(seed,'geometry:v2');
  const dense=kind==='row'||kind==='admin'||kind==='controls';
  const planet=Math.floor(identity()*8),showPlanet=kind==='ornament'||kind==='stop-card'&&identity()<.78;
  const size=52+identity()*24,galaxySize=38+identity()*26;
  const focus={x:312+geometry()*60,y:36+geometry()*108};
  // Whole columns protect names/line badges and favourite buttons. The body
  // bounds, rather than just their centres, must fit between these zones.
  const protectedZones:CosmicZone[]=[{left:0,top:0,right:264,bottom:HEIGHT},{left:422,top:0,right:WIDTH,bottom:HEIGHT}];
  const bodies:CosmicBody[]=[];
  const clearance=(x:number,y:number,radius:number)=>{
    let distance=Math.min(x-radius-9,WIDTH-9-x-radius,y-radius-9,HEIGHT-9-y-radius);
    for(const zone of protectedZones){
      const dx=Math.max(zone.left-x,0,x-zone.right),dy=Math.max(zone.top-y,0,y-zone.bottom);
      distance=Math.min(distance,Math.hypot(dx,dy)-radius-6);
    }
    for(const body of bodies)distance=Math.min(distance,Math.hypot(x-body.x,y-body.y)-radius-body.radius-12);
    return distance;
  };
  // Bounded best-candidate search: evaluate a low-discrepancy sequence with a
  // seeded rotation, score negative space and visual balance, keep one winner.
  // No unbounded rejection loop and no state shared with other panels.
  const place=(role:CosmicBody['role'],radius:number)=>{
    let best:CosmicBody|undefined,score=-Infinity;
    const offsetX=geometry(),offsetY=geometry();
    for(let i=0;i<96;i++){
      const x=270+radius+((offsetX+i*.7548776662466927)%1)*(146-2*radius);
      const y=9+radius+((offsetY+i*.5698402909980532)%1)*(HEIGHT-18-2*radius);
      const space=clearance(x,y,radius);if(space<0)continue;
      const balance=bodies.length?Math.hypot(x-bodies[0].x,y-bodies[0].y):36-Math.hypot(x-focus.x,y-focus.y);
      const candidate=space*.7+balance*.22;
      if(candidate>score){score=candidate;best={role,x,y,radius};}
    }
    if(best)bodies.push(best);
    return best;
  };
  const primary=showPlanet?place('planet',size/2):undefined;
  // A galaxy can shrink when space is tight; a planet is never cut to make it fit.
  let galaxy:CosmicBody|undefined;
  for(const scale of [1,.82,.66]){galaxy=place('galaxy',galaxySize*scale/2);if(galaxy)break;}
  return {version:2 as const,kind,seed:seed>>>0,planet,showPlanet:Boolean(primary),bodies,protectedZones,
    density:dense?46:78,cluster:{x:280+geometry()*138,y:25+geometry()*130},
    nebula:Math.floor(identity()*4),nebulaX:18+identity()*64,nebulaY:12+identity()*76,
    galaxy:Math.floor(identity()*2),primary,galaxyBody:galaxy,
    // Every layer has a separate deterministic phase; no twelve-slot cycle.
    starX:Math.floor(geometry()*480),starY:Math.floor(geometry()*180),signature:cosmicKeySeed(seed,'composition:v2')};
}

/** Blue-noise stars with a denser distant cluster. Best-candidate sampling
 * avoids accidental clumps; bright foreground stars reserve a wider halo and
 * never sit on top of the planetary disc, galaxy core or reading columns. */
export function cosmicPanelSky(seed:number,kind:CosmicPanelKind='content',plan=cosmicComposition(seed,kind)){
  const r=channel(seed,'stars:v2');
  const points:{x:number;y:number;bright:boolean;radius:number;color:string;opacity:number}[]=[];
  for(let index=0;index<plan.density;index++){
    const bright=index%11===0;
    let winner:{x:number;y:number}|undefined,best=-Infinity;
    for(let candidate=0;candidate<12;candidate++){
      const clustered=index%3===0;
      const x=clustered?clamp(plan.cluster.x+(r()+r()-1)*108,5,475):5+r()*470;
      const y=clustered?clamp(plan.cluster.y+(r()+r()-1)*75,5,175):5+r()*170;
      if(bright&&(x<272||x>414||y<9||y>171||plan.bodies.some(b=>Math.hypot(x-b.x,y-b.y)<b.radius+9)))continue;
      let distance=40;
      for(const p of points)distance=Math.min(distance,Math.hypot(x-p.x,y-p.y)-(bright||p.bright?11:0));
      if(distance>best){best=distance;winner={x,y};}
    }
    if(!winner||best<5)continue;
    points.push({...winner,bright,radius:bright?.65+r()*.6:.18+r()**2*.72,
      color:PALETTE[Math.floor(r()*PALETTE.length)],opacity:winner.x<264?.15+r()*.16:.42+r()*.5});
  }
  const stars=points.map(p=>`<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">${p.bright?`<circle r="4.5" fill="url(#halo)"/><path d="M-3 0H3M0 -3V3" stroke="${p.color}" stroke-width=".3" opacity=".55"/>`:''}<circle r="${p.radius.toFixed(2)}" fill="${p.color}" opacity="${p.opacity.toFixed(2)}"/></g>`).join('');
  return url(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180" viewBox="0 0 480 180"><defs><radialGradient id="sky-cloud"><stop stop-color="${PALETTE[plan.nebula]}" stop-opacity=".055"/><stop offset="1" stop-opacity="0"/></radialGradient><radialGradient id="halo"><stop stop-color="#d8eaff" stop-opacity=".45"/><stop offset=".25" stop-color="#9bbcff" stop-opacity=".12"/><stop offset="1" stop-color="#9bbcff" stop-opacity="0"/></radialGradient></defs><ellipse cx="${plan.cluster.x.toFixed(1)}" cy="${plan.cluster.y.toFixed(1)}" rx="130" ry="85" fill="url(#sky-cloud)"/>${stars}</svg>`);
}

/** CSS percentages align the full image inside its panel. Keep this projection
 * separate from the immutable plan: resizing fits the same scene, never rerolls. */
export function cosmicScene(seed:number,kind:CosmicPanelKind='content'){
  const plan=cosmicComposition(seed,kind),body=plan.primary,galaxy=plan.galaxyBody;
  const size=body?body.radius*2:52+channel(seed,'absent-size:v2')()*24;
  const align=(centre:number,diameter:number,extent:number)=>(centre-diameter/2)/(extent-diameter)*100;
  return {x:body?align(body.x,size,WIDTH):65+channel(seed,'absent-position:v2')()*12,
    y:body?align(body.y,size,HEIGHT):50,size,planet:plan.planet,showPlanet:plan.showPlanet,
    dust:plan.nebula,dustX:Math.round(plan.nebulaX),dustY:Math.round(plan.nebulaY),sun:false,
    galaxy:plan.galaxy,galaxySize:galaxy?galaxy.radius*2:0,
    galaxyX:galaxy?align(galaxy.x,galaxy.radius*2,WIDTH):75,galaxyY:galaxy?align(galaxy.y,galaxy.radius*2,HEIGHT):50,
    starX:plan.starX,starY:plan.starY,sky:cosmicPanelSky(seed,kind,plan),layout:plan.signature,
    orbitReverse:channel(seed,'orbit:v2')()>.5,version:plan.version};
}
export function cosmicPanelScene(seed:number,kind:CosmicPanelKind){return cosmicScene(seed,kind);}

/** Fit the immutable scene into actual CSS pixels. Only a real size change
 * triggers projection. Data updates, list order and scrolling are irrelevant.
 * All sprite bounds include their transparent margins and remain uncut. */
export function cosmicProject(scene:ReturnType<typeof cosmicScene>,width:number,height:number){
  const w=Math.max(1,width),h=Math.max(1,height),padding=Math.min(7,w*.04,h*.04);
  const size=Math.max(0,Math.min(scene.size,w*.28,h-padding*2,w*.32-padding*2));
  const radius=size/2;
  const x=clamp((w-size)*scene.x/100+radius,w*.55+radius+padding,w*.87-radius-padding);
  const y=clamp((h-size)*scene.y/100+radius,radius+padding,h-radius-padding);
  let galaxy:{x:number;y:number;size:number}|null=null;
  const r=cosmicRandom(scene.layout);
  const phaseX=r(),phaseY=r();
  for(const scale of [1,.8,.64,.48]){
    const diameter=Math.min(scene.galaxySize*scale,h-2*padding,w*.25),rad=diameter/2;
    if(diameter<14)break;
    let score=-Infinity;
    const targetX=(w-diameter)*scene.galaxyX/100+rad,targetY=(h-diameter)*scene.galaxyY/100+rad;
    for(let i=-1;i<64;i++){
      const gx=i===-1?targetX:w*.56+rad+padding+((phaseX+i*.7548776662466927)%1)*(w*.44-2*rad-2*padding);
      const gy=i===-1?targetY:rad+padding+((phaseY+i*.5698402909980532)%1)*(h-2*rad-2*padding);
      if(gx-rad<w*.55||gx+rad>w-padding||gy-rad<padding||gy+rad>h-padding)continue;
      // The favourite is central on the right; the corners remain usable.
      const dx=Math.max(w*.88-gx,0,gx-w),dy=Math.max(h*.32-gy,0,gy-h*.68);
      if(Math.hypot(dx,dy)<rad+5)continue;
      const separation=Math.hypot(gx-x,gy-y)-radius-rad;
      if(scene.showPlanet&&separation<9)continue;
      const value=-Math.hypot(gx-targetX,gy-targetY);
      if(value>score){score=value;galaxy={x:gx,y:gy,size:diameter};}
    }
    if(galaxy)break;
  }
  const align=(centre:number,diameter:number,extent:number)=>extent===diameter?50:(centre-diameter/2)/(extent-diameter)*100;
  return {size,left:x-radius,top:y-radius,x:align(x,size,w),y:align(y,size,h),
    galaxySize:galaxy?galaxy.size:0,galaxyX:galaxy?align(galaxy.x,galaxy.size,w):50,galaxyY:galaxy?align(galaxy.y,galaxy.size,h):50,
    galaxy,planet:{x,y,radius}};
}

export const COSMIC_PANEL_SELECTOR = '.pks-map-search-panel,.map-detail-shell,.pks-options-sheet,[data-carrier-sheet],.transit-surface,.transit-card,.admin-topbar,.pks-personal-panel,.pks-personal-card,.pks-option-card,.widget-generator,.personal-group,[data-interface-panel],[data-interface-card],.widget-settings-card,.widget-personalization,[data-departure-row],[data-cosmic-surface],[data-cosmic-orbit]';
export function cosmicOrbSrc(scene:ReturnType<typeof cosmicScene>){
  const name=COSMIC_PLANET_NAMES[scene.planet];
  return `/themes/kosmos/${[0,3,5].includes(scene.planet)?'reference-':''}${name}.svg`;
}
export function cosmicOrb(scene:ReturnType<typeof cosmicScene>){return `url("${cosmicOrbSrc(scene)}")`;}


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
