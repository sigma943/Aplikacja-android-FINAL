import type {Stop} from '@/Panel/src/types';
import {normalizeStopMergeName,distanceMeters,mergeStopsCluster,hasConflictingCityToken} from '@/components/stops-panel/stop-domain';

/** Compare the full landmark, preserving street numbers; only the platform suffix is removed. */
export function physicalStopName(name:string){
  const aliases:Record<string,string>={szk:'szkola',kosc:'kosciol',kos:'kosciol',przych:'przychodnia',cment:'cmentarz',cm:'cmentarz'};
  return normalizeStopMergeName(name).replace(/\s+(?:st\s+)?\d+[a-z]?$/,'')
    .replace(/\bdps\b/g,'dom pomocy spolecznej').replace(/^rzeszow\s+/,'')
    .split(' ').filter(t=>t&&!['ul','ulica','al','aleja','plk','gen'].includes(t)).map(t=>aliases[t]||t).sort().join(' ');
}

/** Different operators can number one platform differently. Match reciprocally, never greedily. */
export function mergePhysicalStopAliases(stops:Stop[]):Stop[]{
  const groups=new Map<string,Stop[]>();
  for(const stop of stops){const key=physicalStopName(stop.name);const bucket=groups.get(key)||[];bucket.push(stop);groups.set(key,bucket);}
  const parent=new Map(stops.map(s=>[s,s]));
  const root=(s:Stop):Stop=>{let current=s;while(parent.get(current)!==current)current=parent.get(current)!;return current;};
  const providers=(s:Stop)=>new Set(s.sourceProviderIds||[]);
  const componentProviders=new Map(stops.map(s=>[s,providers(s)]));
  const componentPoints=new Map(stops.map(s=>[s,[s]]));
  const disjoint=(a:Stop,b:Stop)=>![...componentProviders.get(root(a))!].some(p=>componentProviders.get(root(b))!.has(p));
  // The current PKS timetable also publishes platform 02 as its own GTFS
  // stop. Keep all technical IDs for departures, including multiple PKS IDs.
  const moniuszki=stops.filter(stop=>{
    const pksIds=stop.providerStopIds?.pks?.split(',').map(id=>id.trim())||[];
    const mpkIds=stop.providerStopIds?.mpk_rzeszow?.split(',').map(id=>id.trim())||[];
    return pksIds.includes('11462')||mpkIds.includes('186')||(
      pksIds.some(id=>id.startsWith('gtfs:')) &&
      /^(?:rzeszow )?lisa kuli moniuszki 0?2$/.test(normalizeStopMergeName(stop.name)) &&
      distanceMeters(stop.lat,stop.lon,50.036515,21.997529)<=25
    );
  });
  if(moniuszki.length>1){
    const [first,...aliases]=moniuszki;
    for(const alias of aliases)parent.set(alias,first);
    componentProviders.set(first,new Set(moniuszki.flatMap(stop=>[...providers(stop)])));
    componentPoints.set(first,moniuszki);
  }
  for(const [key,bucket] of groups){
    if(key.split(' ').length<2||bucket.length<2||bucket.some(s=>/\bd\s*\.?\s*a\b|\bdworzec\b|\bstanowisko\b/i.test(normalizeStopMergeName(s.name))))continue;
    const nearest=(origin:Stop,targetProvider:string)=>{
      // Already joined platforms still count as competitors, preventing assignment reuse.
      const candidates=bucket.filter(s=>s!==origin&&providers(s).has(targetProvider)&&!hasConflictingCityToken(origin.name,s.name))
        .map(stop=>({stop,distance:distanceMeters(origin.lat,origin.lon,stop.lat,stop.lon)}))
        .filter(s=>s.distance<=120).sort((a,b)=>a.distance-b.distance||a.stop.id.localeCompare(b.stop.id));
      if(!candidates.length||candidates[0].distance>25)return null;
      if(candidates[1]&&candidates[1].distance-candidates[0].distance<20)return null;
      return candidates[0].stop;
    };
    const edges:Array<{a:Stop;b:Stop;distance:number}>=[];
    for(const a of bucket)for(const b of bucket){
      if(a.id>=b.id||!disjoint(a,b))continue;
      const aProviders=[...providers(a)],bProviders=[...providers(b)];
      if(!aProviders.length||!bProviders.length)continue;
      if(!aProviders.some(p=>nearest(b,p)===a)||!bProviders.some(p=>nearest(a,p)===b))continue;
      edges.push({a,b,distance:distanceMeters(a.lat,a.lon,b.lat,b.lon)});
    }
    edges.sort((a,b)=>a.distance-b.distance||a.a.id.localeCompare(b.a.id)||a.b.id.localeCompare(b.b.id));
    for(const edge of edges){
      const a=root(edge.a),b=root(edge.b);
      if(a===b||!disjoint(a,b))continue;
      const aPoints=componentPoints.get(a)!,bPoints=componentPoints.get(b)!;
      if(aPoints.some(x=>bPoints.some(y=>distanceMeters(x.lat,x.lon,y.lat,y.lon)>25)))continue;
      parent.set(b,a);
      componentProviders.set(a,new Set([...componentProviders.get(a)!,...componentProviders.get(b)!]));
      componentPoints.set(a,[...aPoints,...bPoints]);
    }
  }
  const merged=new Map<Stop,Stop[]>();
  for(const s of stops){const r=root(s),bucket=merged.get(r)||[];bucket.push(s);merged.set(r,bucket);}
  return mergeNumberedRoadPlatforms([...merged.values()].map(group=>group.length===1?group[0]:mergeStopsCluster(group)));
}

/** Reconcile separately named road platforms after the full-name pass. PKS
 * timetable IDs are a different source from PKS API IDs, even if both are
 * already represented on the same MPK marker. */
function mergeNumberedRoadPlatforms(stops:Stop[]):Stop[]{
  const rows=stops.flatMap(stop=>{
    const name=normalizeStopMergeName(stop.name);
    if(/\bd a\b|\bdworzec\b|\bstanowisko\b/.test(name))return [];
    const pks=(stop.pksStopPoints||[]).map(point=>point.id);
    const source=pks.some(id=>!id.startsWith('gtfs:'))?'api':pks.length?'gtfs':null;
    const code=String(stop.code||/\s(\d+[a-z]?)$/.exec(name)?.[1]||'').toLowerCase().replace(/^0+(?=\d)/,'');
    const key=physicalStopName(stop.name).replace(/\bcegielna\b/g,'cegielnia').replace(/\bmlecz\b/g,'mleczarnia');
    const tokens=key.split(' ').filter(token=>/^[a-z]{3,}$/.test(token));
    return [{stop,source,code,key,tokens,mpk:!!stop.providerStopIds?.mpk_rzeszow}];
  });
  type Row=typeof rows[number];
  const consumed=new Set<Stop>();
  const replacements=new Map<Stop,Stop>();
  const landmarkOverlap=(a:Row,b:Row)=>a.tokens.some(left=>b.tokens.some(right=>
    left===right||left.length>=4&&right.length>=4&&(left.startsWith(right)||right.startsWith(left))));
  for(const source of ['gtfs','api']){
    const left=rows.filter(row=>row.source===source&&!row.mpk);
    const right=rows.filter(row=>row.mpk&&row.source!=='api'&&(source==='api'||!row.source));
    const neighbours=new Map<Row,Array<{row:Row;distance:number;eligible:boolean}>>();
    for(const a of left)for(const b of right){
      if(Math.abs(a.stop.lat!-b.stop.lat!)>.0003||Math.abs(a.stop.lon!-b.stop.lon!)>.0005)continue;
      if(hasConflictingCityToken(a.stop.name,b.stop.name))continue;
      const distance=distanceMeters(a.stop.lat,a.stop.lon,b.stop.lat,b.stop.lon);
      if(distance>30)continue;
      const sameCode=!!a.code&&a.code===b.code;
      const sameName=a.key===b.key&&a.tokens.length>=2;
      // Opposite platforms can be metres apart. A different number needs
      // the same landmark and essentially coincident surveyed positions.
      const eligible=sameCode&&landmarkOverlap(a,b)||sameName&&distance<=10;
      for(const [from,to] of [[a,b],[b,a]] as const){
        const candidates=neighbours.get(from)||[];
        candidates.push({row:to,distance,eligible});
        neighbours.set(from,candidates);
      }
    }
    const nearest=(row:Row)=>{
      const candidates=neighbours.get(row)?.sort((a,b)=>a.distance-b.distance)||[];
      const unique=(ranked:typeof candidates)=>ranked[0]?.eligible&&
        (!ranked[1]||ranked[1].distance-ranked[0].distance>=7)?ranked[0].row:undefined;
      // If coordinates alone are ambiguous, only equal platform numbers
      // can break the tie. Multiple candidates with the same number stay separate.
      return unique(candidates)||unique(candidates.filter(candidate=>row.code&&candidate.row.code===row.code));
    };
    for(const a of left){
      const b=nearest(a);
      if(!b||nearest(b)!==a)continue;
      consumed.add(a.stop);
      const joined=mergeStopsCluster([a.stop,replacements.get(b.stop)||b.stop]);
      replacements.set(b.stop,joined);
    }
  }
  return stops.filter(stop=>!consumed.has(stop)).map(stop=>replacements.get(stop)||stop);
}
