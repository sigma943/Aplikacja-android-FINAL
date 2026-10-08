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
  return [...merged.values()].map(group=>group.length===1?group[0]:mergeStopsCluster(group));
}
