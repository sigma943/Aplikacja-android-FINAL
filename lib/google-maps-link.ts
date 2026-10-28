import {parseJourneyCoordinates} from './journey-coordinates';
import type {Stop} from '@/Panel/src/types';

type Reply={status:number;headers:Record<string,string>;text:string};
export type MapsLinkReader=(url:string,signal:AbortSignal)=>Promise<Reply>;
const hosts=new Set(['maps.app.goo.gl','goo.gl','google.com','www.google.com','maps.google.com','google.pl','www.google.pl','maps.google.pl']);
export function googleMapsLink(value:string):URL|null{
 try{
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.has(url.hostname))return null;
  if(url.hostname==='maps.app.goo.gl')return /^\/[\w-]+\/?$/.test(url.pathname)?url:null;
  if(url.hostname==='goo.gl')return /^\/maps\/[\w-]+\/?$/.test(url.pathname)?url:null;
  if(url.hostname.startsWith('maps.')||/^\/maps(?:\/|$)/.test(url.pathname))return url;
 }catch{}
 return null;
}
function decoded(value:string){try{return decodeURIComponent(value);}catch{return value;}}
function identity(url:URL){
 const text=decoded(url.href);
 return text.match(/0x[\da-f]+:0x[\da-f]+/i)?.[0]||url.searchParams.get('query_place_id')||url.searchParams.get('cid')||'';
}
/** The actual place coordinates win over Google's @camera-centre coordinates. */
export function coordinatesFromGoogleMapsLink(value:string):Stop|null{
 const url=googleMapsLink(value);if(!url)return null;
 for(const key of ['destination','query','q']){
  if(key!=='destination'&&identity(url))continue;
  const text=url.searchParams.get(key);const point=text&&parseJourneyCoordinates(text.replace(/^loc:/i,''));if(point)return point;
 }
 const text=decoded(url.href),matches=[...text.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
 if(matches.length){
  const pairs=[...new Set(matches.map(m=>m[1]+', '+m[2]))];
  return pairs.length===1?parseJourneyCoordinates(pairs[0]):null;
 }
 // A map camera is not a reliable location for a named place with a place ID.
 if(identity(url)||url.pathname.includes('/dir/'))return null;
 for(const key of ['ll','center']){const text=url.searchParams.get(key),point=text&&parseJourneyCoordinates(text);if(point)return point;}
 const path=decoded(url.pathname),pair=path.match(/(?:@|\/(?:search|place)\/)(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
 return pair?parseJourneyCoordinates(pair[1]+', '+pair[2]):null;
}
function unescapeHtml(value:string){return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
/** Read only the selected place record, never a viewport or nearby/recommended POI. */
export function pointFromMapsPreview(text:string,expected:string):Stop|null{
 try{
  const raw=text.replace(/^\)\]\}'\s*/,''),data=JSON.parse(raw),place=data?.[6],pin=place?.[9];
  if(!expected||!Array.isArray(place)||!Array.isArray(pin)||typeof pin[2]!=='number'||typeof pin[3]!=='number')return null;
  const fid=typeof place[10]==='string'?place[10]:'';
  let matches=fid.toLowerCase()===expected.toLowerCase()||place[78]===expected;
  if(/^\d+$/.test(expected)&&/^0x[\da-f]+:0x[\da-f]+$/i.test(fid))matches=BigInt(fid.split(':')[1]).toString()===expected;
  return matches?parseJourneyCoordinates(pin[2]+', '+pin[3]):null;
 }catch{return null;}
}
export async function resolveGoogleMapsLink(value:string,read:MapsLinkReader,signal:AbortSignal):Promise<Stop>{
 let url=googleMapsLink(value);if(!url)throw Error('Wklej współrzędne lub poprawny link Google Maps.');
 const readFinal=async(start:URL):Promise<{url:URL;text:string}>=>{
  let current=start;
  for(let hop=0;hop<6;hop++){
   signal.throwIfAborted();const reply=await read(current.href,signal);signal.throwIfAborted();
   if(reply.status>=300&&reply.status<400){
    const location=Object.entries(reply.headers).find(([key])=>key.toLowerCase()==='location')?.[1];
    const target=location&&googleMapsLink(new URL(location,current).href);
    if(!target)throw Error('Nieprawidłowe przekierowanie linku Google Maps.');current=target;continue;
   }
   if(reply.status!==200||reply.text.length>2000000)throw Error('Nie udało się odczytać linku Google Maps.');
   return {url:current,text:reply.text};
  }
  throw Error('Zbyt wiele przekierowań linku Google Maps.');
 };
 const direct=coordinatesFromGoogleMapsLink(url.href);if(direct)return direct;
 const page=await readFinal(url);url=page.url;
 const redirected=coordinatesFromGoogleMapsLink(url.href);if(redirected)return redirected;
 // Google's public place page exposes the selected place preview. Its data
 // layout is not an API contract; fail explicitly if identity/structure changes.
 const candidates:URL[]=[];
 for(const match of page.text.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)){
  try{const candidate=googleMapsLink(new URL(unescapeHtml(match[1]),url).href);if(candidate)candidates.push(candidate);}catch{}
 }
 const href=candidates.find(u=>u.pathname==='/maps/preview/place');
 const expected=identity(url);
 if(href&&expected){const preview=await readFinal(href);const point=pointFromMapsPreview(preview.text,expected);if(point)return point;}
 throw Error('Link nie udostępnił jednoznacznych współrzędnych. Wklej współrzędne punktu z Google Maps.');
}
