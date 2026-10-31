import {readBusCoordinates} from './bus-coordinates';
import {roadDistance} from './bus-road-geometry';
type NamedPoint={name:string;lat?:number;lon?:number};
const identities=new Map<string,{code:string|null;words:Set<string>}>();
function identity(name:string){
 const cached=identities.get(name);if(cached)return cached;
 const normalized=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l')
  .replace(/\bd\.?\s*a\.?\b/g,'dworzec autobusowy').replace(/\bmalopolski\b/g,'mlp').replace(/\b(?:al|aleja|aleje|ul|ulica)\.?\s/g,' ')
  .replace(/\bug\b/g,'urzad gminy').replace(/\bszk\b/g,'szkola').replace(/\bskrz\b/g,'skrzyzowanie').replace(/\bosr\b/g,'osrodek').replace(/\bzdr\b/g,'zdrowia')
  .replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\bnz\b/g,' ').replace(/\s+/g,' ').trim();
 const code=/\s(\d{1,3})$/.exec(normalized)?.[1];
 const words=normalized.replace(/\s\d{1,3}$/,'').split(' ').filter(Boolean);
 const result={code:code?String(Number(code)):null,words:new Set(words)};
 identities.set(name,result);if(identities.size>16000)identities.delete(identities.keys().next().value!);
 return result;
}
export function sameRouteStopName(a:string,b:string){
 const x=identity(a),y=identity(b);
 if(x.code&&y.code&&x.code!==y.code)return false;
 const shared=[...x.words].filter(w=>y.words.has(w)).length;
 // Locality alone is insufficient. All differing names still need a strong overlap.
 return (shared>=2||(shared===1&&x.code!==null&&x.code===y.code))&&(shared/Math.max(x.words.size,y.words.size)>=.7||(x.code!==null&&x.code===y.code&&shared>=2&&shared===Math.min(x.words.size,y.words.size)));
}
/** Only reconcile the full, ordered pattern of an exact known trip. No nearest-stop guesses. */
export function reconcileRouteStopCoordinates<T extends NamedPoint>(live:T[],official:NamedPoint[]):T[]{
 if(live.length<2||live.length!==official.length)return live;
 let anchors=0;
 for(let i=0;i<live.length;i++){
  const source=live[i],target=official[i],point=readBusCoordinates(target.lat,target.lon);
  if(!point)return live;
  const origin=readBusCoordinates(source.lat,source.lon);
  if(origin){const distance=roadDistance([origin.lat,origin.lon],[point.lat,point.lon]);if(distance<=100)anchors++;}
 }
 // Independent good positions disambiguate old/reused trip IDs and stale GTFS patterns.
 if(anchors<Math.max(2,Math.ceil(live.length*.7)))return live;
 let changed=false;
 const corrected=live.map((source,i)=>{
  const target=official[i],origin=readBusCoordinates(source.lat,source.lon);
  if(origin){const distance=roadDistance([origin.lat,origin.lon],[target.lat!,target.lon!]);if(distance<=100||distance>1200)return source;}
  if(!sameRouteStopName(source.name,target.name)) {
   // EINFO and GTFS sometimes number a single turning loop differently.
   // Only an interior, uniquely named loop in the anchored full course may
   // cross that namespace boundary; ordinary opposite-side platforms may not.
   const key=(name:string)=>[...identity(name).words].sort().join(' ');
   const sourceKey=key(source.name),targetKey=key(target.name);
   const uniqueLoop=i>0&&i<live.length-1&&identity(source.name).words.has('petla')&&
    sourceKey===targetKey&&live.filter(s=>key(s.name)===sourceKey).length===1&&
    official.filter(s=>key(s.name)===targetKey).length===1&&!!origin&&
    roadDistance([origin.lat,origin.lon],[target.lat!,target.lon!])<=600;
   const a=identity(source.name),b=identity(target.name);
   const anchoredPlatform=a.code!==null&&a.code===b.code&&[...a.words][0]===[...b.words][0]&&!!origin&&roadDistance([origin.lat,origin.lon],[target.lat!,target.lon!])<=1200;
   if(!uniqueLoop&&!anchoredPlatform)return source;
  }
  changed=true;return {...source,lat:target.lat!,lon:target.lon!};
 });
 return changed?corrected:live;
}
