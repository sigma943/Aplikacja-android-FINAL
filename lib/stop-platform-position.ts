import {readBusCoordinates} from './bus-coordinates';
import reviewedPlatforms from './reviewed-map-platforms.json';

export type PlatformPoint={id:string;name:string;code?:string;lat:number;lon:number;roadBoundary?:number[][]};
type StopPoint={name?:string;n?:string;code?:string;lat?:number;lon?:number;apiLat?:number|null;apiLon?:number|null};
const aliases:Record<string,string>={szk:'szkola',szkole:'szkola',kosc:'kosciol',kos:'kosciol',skrz:'skrzyzowanie',skr:'skrzyzowanie',przych:'przychodnia',cment:'cmentarz',cm:'cmentarz',osr:'osrodek',dw:'dworzec',szp:'szpital',mochn:'mochnackiego'};
function identity(name:string,code?:string){
  const clean=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/\s+nz\.?$/,'').trim();
  const suffix=/\s(\d+[a-z]?)$/.exec(clean);
  const number=String(code||suffix?.[1]||'').trim().toLowerCase().replace(/^0+(?=\d)/,'');
  const base=(suffix?clean.slice(0,suffix.index):clean).replace(/[^a-z0-9]+/g,' ').trim().replace(/^rzeszow\s+/,'').split(/\s+/).map(t=>aliases[t]||t).join(' ');
  return {base,number};
}
function distance(a:{lat:number;lon:number},b:{lat:number;lon:number}){
  const r=Math.PI/180,x=(a.lon-b.lon)*Math.cos((a.lat+b.lat)*r/2),y=a.lat-b.lat;
  return Math.hypot(x,y)*111195;
}
/** Only named passenger platforms, never road stop positions or arbitrary offsets. */
export function hasSameRoadside(origin:{lat:number;lon:number},point:PlatformPoint){
  const boundary=point.roadBoundary;
  if(!boundary||boundary.length!==2)return false;
  const a=readBusCoordinates(boundary[0]?.[0],boundary[0]?.[1]);
  const b=readBusCoordinates(boundary[1]?.[0],boundary[1]?.[1]);
  if(!a||!b||(a.lat===b.lat&&a.lon===b.lon))return false;
  const side=(p:{lat:number;lon:number})=>(b.lon-a.lon)*(p.lat-a.lat)-(b.lat-a.lat)*(p.lon-a.lon);
  // A point on the centreline does not prove which passenger platform it serves.
  const from=side(origin),to=side(point);
  return Math.abs(from)>1e-12&&Math.abs(to)>1e-12&&from*to>0;
}
export function createPlatformIndex(points:PlatformPoint[]){
  const index=new Map<string,Array<PlatformPoint & {number:string}>>();
  for(const point of points){
    if(!point||typeof point.name!=='string'||!readBusCoordinates(point.lat,point.lon))continue;
    const {base,number}=identity(point.name,point.code);
    if(!base)continue;
    const bucket=index.get(base)||[];bucket.push({...point,number});index.set(base,bucket);
  }
  return [...index.entries()];
}
export function createPlatformResolver(points:PlatformPoint[],requireRoadside=false,prepared?:ReturnType<typeof createPlatformIndex>){
  const index=new Map(prepared||createPlatformIndex(points));
  return (stop:StopPoint):{lat:number;lon:number}|null=>{
    const origin=readBusCoordinates(stop.lat,stop.lon);if(!origin)return null;
    const {base,number}=identity(stop.name||stop.n||'',stop.code);
    const nearby=(index.get(base)||[]).filter(p=>distance(origin,p)<=120);
    // Missing platform codes must not guess between the two sides of a road.
    const candidates=nearby.filter(p=>(number?p.number===number:distance(origin,p)<=40)
      &&(!requireRoadside||hasSameRoadside(origin,p)));
    if(!number&&nearby.length!==1)return null;
    if(candidates.length!==1)return null;
    return {lat:candidates[0].lat,lon:candidates[0].lon};
  };
}
// Reviewed points from the displayed basemap take precedence over the OSM catalog.
// Match the full platform name/code and proximity on every surface, including routes.
const resolveReviewed=createPlatformResolver(reviewedPlatforms.points,true);
let resolve=createPlatformResolver([]);
let loading:Promise<void>|null=null;
let revision=0;
export function stopPlatformRevision(){return revision;}
/** A confirmed platform wins; retain the established catalog geometry otherwise. */
export function positionWithPlatforms(stop:StopPoint,resolver:ReturnType<typeof createPlatformResolver>){
  const platform=resolveReviewed(stop)||resolver(stop);
  if(platform)return platform;
  // lat/lon already includes verified GTFS and precise MPK platform coordinates.
  // Replacing it with raw apiLat/apiLon undoes those corrections (e.g. Lisa-Kuli 03).
  return readBusCoordinates(stop.lat,stop.lon);
}
type CachedPosition={name:string;code?:string;lat?:number;lon?:number;revision:number;point:{lat:number;lon:number}|null};
// Weak keys release discarded catalogs/routes. Compare every resolver input so
// in-place edits and a newly loaded platform catalog cannot retain old positions.
const positions=new WeakMap<StopPoint,CachedPosition>();
export function platformPosition(stop:StopPoint){
  const name=stop.name||stop.n||'',cached=positions.get(stop);
  if(cached&&cached.revision===revision&&cached.name===name&&cached.code===stop.code
    &&Object.is(cached.lat,stop.lat)&&Object.is(cached.lon,stop.lon))return cached.point?{...cached.point}:null;
  const point=positionWithPlatforms(stop,resolve);
  positions.set(stop,{name,code:stop.code,lat:stop.lat,lon:stop.lon,revision,point:point?{...point}:null});
  return point;
}
export function loadStopPlatforms(){
  if(!loading)loading=fetch('/data/stop-platform-index.json',{cache:'force-cache'})
    .then(async r=>{if(!r.ok)throw Error('Platform index unavailable');const data=await r.json();if(data.version!==1||!Array.isArray(data.index))throw Error('Invalid platform index');return data;})
    .then(data=>{resolve=createPlatformResolver([],false,data.index);revision++;})
    .catch(()=>fetch('/data/stop-platforms.json',{cache:'force-cache'})
    .then(r=>{if(!r.ok)throw Error('Platform catalog unavailable');return r.json();})
    .then(data=>{if(!Array.isArray(data.points))throw Error('Invalid platform catalog');resolve=createPlatformResolver(data.points);revision++;}))
    .catch(()=>{loading=null;});
  return loading;
}
