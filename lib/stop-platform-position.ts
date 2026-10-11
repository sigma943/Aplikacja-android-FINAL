import {readBusCoordinates} from './bus-coordinates';

export type PlatformPoint={id:string;name:string;code?:string;lat:number;lon:number};
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
export function createPlatformResolver(points:PlatformPoint[]){
  const index=new Map<string,Array<PlatformPoint & {number:string}>>();
  for(const point of points){
    if(!point||typeof point.name!=='string'||!readBusCoordinates(point.lat,point.lon))continue;
    const {base,number}=identity(point.name,point.code);
    if(!base)continue;
    const bucket=index.get(base)||[];bucket.push({...point,number});index.set(base,bucket);
  }
  return (stop:StopPoint):{lat:number;lon:number}|null=>{
    const origin=readBusCoordinates(stop.lat,stop.lon);if(!origin)return null;
    const {base,number}=identity(stop.name||stop.n||'',stop.code);
    const nearby=(index.get(base)||[]).filter(p=>distance(origin,p)<=120);
    // Missing platform codes must not guess between the two sides of a road.
    const candidates=nearby.filter(p=>number?p.number===number:distance(origin,p)<=40);
    if(!number&&nearby.length!==1)return null;
    if(candidates.length!==1)return null;
    return {lat:candidates[0].lat,lon:candidates[0].lon};
  };
}
let resolve=createPlatformResolver([]);
let loading:Promise<void>|null=null;
let revision=0;
export function stopPlatformRevision(){return revision;}
/** A confirmed map platform wins; otherwise retain the original provider API position. */
export function positionWithPlatforms(stop:StopPoint,resolver:ReturnType<typeof createPlatformResolver>){
  const platform=resolver(stop);
  if(platform)return platform;
  if(stop.apiLat===null||stop.apiLon===null)return null;
  return readBusCoordinates(stop.apiLat,stop.apiLon)||readBusCoordinates(stop.lat,stop.lon);
}
export function platformPosition(stop:StopPoint){return positionWithPlatforms(stop,resolve);}
export function loadStopPlatforms(){
  if(!loading)loading=fetch('/data/stop-platforms.json',{cache:'force-cache'})
    .then(r=>{if(!r.ok)throw Error('Platform catalog unavailable');return r.json();})
    .then(data=>{if(!Array.isArray(data.points))throw Error('Invalid platform catalog');resolve=createPlatformResolver(data.points);revision++;})
    .catch(()=>{loading=null;});
  return loading;
}
