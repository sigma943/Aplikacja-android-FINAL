import {requestJson} from './transport/http';
import {journeyMapPoint} from './journey-places';
import type {Stop} from '@/Panel/src/types';

export type PlaceResult={stop:Stop;address:string};
/** Decimal WGS84, latitude first. Accept Google-style pairs and Polish decimal commas. */
export function parsePlaceCoordinates(input:string):Stop|null{
 const value=input.trim().replace(/\u2212/g,'-');
 const dot=/^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/.exec(value);
 const comma=/^([+-]?\d+,\d+)\s*[;\s]\s*([+-]?\d+,\d+)$/.exec(value);
 const pair=dot||comma;if(!pair)return null;
 const lat=Number(pair[1].replace(',','.')),lon=Number(pair[2].replace(',','.'));
 try{return journeyMapPoint(lat,lon);}catch{return null;}
}
export const looksLikePlaceCoordinates=(input:string)=>/\d/.test(input)&&/^[\d+\-\u2212\s.,;]+$/.test(input);

export function photonPlaces(data:unknown):PlaceResult[]{
 const features=(data as {features?:unknown[]})?.features;
 if(!Array.isArray(features))throw Error('Nieprawidłowa odpowiedź wyszukiwarki.');
 const results:PlaceResult[]=[],seen=new Set<string>();
 for(const feature of features){
  const f=feature as {geometry?:{type?:string;coordinates?:unknown[]};properties?:Record<string,unknown>};
  const p=f?.properties,coordinates=f?.geometry?.coordinates;
  if(!p||f.geometry?.type!=='Point'||!Array.isArray(coordinates)||coordinates.length<2||typeof coordinates[0]!=='number'||typeof coordinates[1]!=='number')continue;
  let stop:Stop;try{stop=journeyMapPoint(coordinates[1],coordinates[0]);}catch{continue;}
  const text=(key:string)=>typeof p[key]==='string'?String(p[key]).trim():'';
  const street=[text('street'),text('housenumber')].filter(Boolean).join(' ');
  const name=text('name')||street||text('city')||text('locality');if(!name)continue;
  const address=[street,text('postcode'),text('city')||text('town')||text('village')||text('locality'),text('state'),text('country')].filter((s,i,a)=>s&&a.indexOf(s)===i&&s!==name).join(', ');
  const key=stop.id+':'+name.toLocaleLowerCase();if(seen.has(key))continue;seen.add(key);
  results.push({stop:{...stop,name},address});if(results.length===6)break;
 }
 return results;
}
const cache=new Map<string,{at:number;results:PlaceResult[]}>();
let nextRequestAt=0;
export async function searchPlaces(query:string,bias:[number,number],signal:AbortSignal):Promise<PlaceResult[]>{
 signal.throwIfAborted();
 const q=query.trim().slice(0,160);if(q.length<3)return [];
 const key=q.toLocaleLowerCase()+':'+bias.map(n=>n.toFixed(2)).join(',');
 const hit=cache.get(key);if(hit&&Date.now()-hit.at<300000)return hit.results;
 // Limit one app instance to one request per second, including Enter retries.
 while(nextRequestAt>Date.now())await new Promise<void>((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(new DOMException('Search cancelled','AbortError'));};
  const timer=setTimeout(()=>{cleanup();resolve();},nextRequestAt-Date.now());
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 signal.throwIfAborted();nextRequestAt=Date.now()+1000;
 const params=new URLSearchParams({q,limit:'6',lat:String(bias[0]),lon:String(bias[1])});
 const data=await requestJson<unknown>('https://photon.komoot.io/api/?'+params,{signal});
 signal.throwIfAborted();
 const results=photonPlaces(data);cache.set(key,{at:Date.now(),results});
 if(cache.size>40)cache.delete(cache.keys().next().value!);
 return results;
}
