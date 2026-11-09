import {unzipSync,strFromU8} from 'fflate';
import type {TimetableFeed} from './journey-timetable';
import {normalizeJourneyFeed} from './journey-feed-validation';
import {sameRouteStopName} from './reconcile-route-stops';
import {warsawTimeMs} from './transit-time';
import type {StopsMap} from './transport/types';
import {correctPksStop} from './pks-stop-corrections';
import {readBusCoordinates} from './bus-coordinates';
import {rzeszowTerminalPlatform,displayStopCatalogLabel} from './stop-label';

export type PksGtfsFeed=TimetableFeed&{updatedAt?:string;revision?:string;headsigns?:Record<string,string>;managedLines?:string[]};
export const PKS_GTFS_URL='https://kmrzeszow.live/gtfs-pks/latest.zip';
export const MPK_GTFS_URL='https://kmrzeszow.live/gtfs/latest.zip';
export function gtfsCsv(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('Niepełny plik CSV rozkładu.');
 if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
 const header=rows.shift()?.map(s=>s.replace(/^\uFEFF/,''));
 if(!header?.length)throw Error('Pusty plik CSV rozkładu.');
 return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||''])));
}
export function parsePksGtfs(bytes:Uint8Array,provider='pks',source=PKS_GTFS_URL):PksGtfsFeed {
 if(bytes.length>25*1024*1024)throw Error('Zbyt duży plik rozkładu.');
 let size=0;
 const files=unzipSync(bytes,{filter:e=>{
  if(!/(^|\/)(stops|trips|stop_times|routes|calendar|calendar_dates)\.txt$/.test(e.name))return false;
  size+=e.originalSize;if(size>60*1024*1024)throw Error('Zbyt duży rozpakowany rozkład.');return true;
 }});
 const read=(name:string,required=true)=>{
  const entry=Object.entries(files).find(([key])=>key===name||key.endsWith('/'+name));
  if(!entry){if(required)throw Error('Brak pliku '+name);return [];}
  return gtfsCsv(strFromU8(entry[1]));
 };
 const clock=(s:string)=>{if(!/^\d{1,3}:\d{2}:\d{2}$/.test(s))return NaN;const [h,m,z]=s.split(':').map(Number);return m<60&&z<60?h*3600+m*60+z:NaN;};
 const stops=Object.fromEntries(read('stops.txt').map(s=>[s.stop_id,{name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon)}]));
 const routes=Object.fromEntries(read('routes.txt').filter(r=>['3','700','704'].includes(r.route_type)).map(r=>[r.route_id,r.route_short_name]));
 const calendars=Object.fromEntries(read('calendar.txt',false).map(c=>[c.service_id,{start:c.start_date,end:c.end_date,days:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>c[d]).join('')}]));
 const exceptions:TimetableFeed['exceptions']={};for(const c of read('calendar_dates.txt',false))(exceptions[c.date]??={})[c.service_id]=Number(c.exception_type);
 const times=new Map<string,Array<[number,string,number,number,number,number]>>();
 for(const s of read('stop_times.txt')){const a=clock(s.arrival_time||s.departure_time),d=clock(s.departure_time||s.arrival_time);if(!Number.isFinite(a)||!Number.isFinite(d))throw Error('Nieprawidłowa godzina GTFS');const list=times.get(s.trip_id)||[];list.push([Number(s.stop_sequence),s.stop_id,a,d,Number(s.pickup_type||0),Number(s.drop_off_type||0)]);times.set(s.trip_id,list);}
 const patterns:TimetableFeed['patterns']=[],patternIds=new Map<string,number>(),trips:TimetableFeed['trips']=[],headsigns:Record<string,string>={};
 for(const t of read('trips.txt')){
  const list=times.get(t.trip_id);if(!routes[t.route_id]||!list||list.length<2)continue;
  list.sort((a,b)=>a[0]-b[0]);const start=list[0][3];
  const pattern:TimetableFeed['patterns'][number]=list.map(([sequence,id,a,d,pick,drop])=>[id,a-start,d-start,pick,drop,sequence]);
  const key=JSON.stringify(pattern);if(!patternIds.has(key)){patternIds.set(key,patterns.length);patterns.push(pattern);}
  trips.push([t.trip_id,routes[t.route_id],t.service_id,start,patternIds.get(key)!]);headsigns[t.trip_id]=t.trip_headsign||stops[list.at(-1)![1]]?.name||'';
 }
 const dates=[...Object.values(calendars).flatMap(c=>[c.start,c.end]),...Object.keys(exceptions)].sort();
 let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
 const feed={version:1,provider,source,updatedAt:new Date().toISOString(),revision:(hash>>>0).toString(16),validFrom:dates[0],validUntil:dates.at(-1)!,stops,calendars,exceptions,patterns,trips,headsigns,managedLines:[...new Set(Object.values(routes))]};
 const normalized=normalizeJourneyFeed(feed,provider);
 if(normalized.diagnostics?.length)throw Error('Niepełny lub niespójny rozkład PKS.');
 return {...feed,...normalized};
}
export function pksGtfsCovers(feed:PksGtfsFeed,date:string){const day=date.replaceAll('-','');return feed.validFrom<=day&&day<=feed.validUntil;}
export function pksGtfsTerminalStopIds(feed:PksGtfsFeed,areaId?:string,code?:string):string[]|null {
 if(areaId!=='1937'||!code)return null;
 return Object.entries(feed.stops).filter(([,point])=>rzeszowTerminalPlatform(point.name)===String(Number(code))).map(([id])=>id);
}
export function pksGtfsServiceRuns(feed:PksGtfsFeed,id:string,date:string){
 const day=date.replaceAll('-',''),exception=feed.exceptions[day]?.[id];if(exception)return exception===1;
 const c=feed.calendars[id],weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return Boolean(c&&c.start<=day&&day<=c.end&&c.days[weekday]==='1');
}
const code=(name:string)=>/(?:\s|^)(\d+[A-Za-z]?)\s*(?:nż\.?)?$/i.exec(name.trim())?.[1]||'';
const codeKey=(value:string)=>value.replace(/^0+(?=\d)/,'').toLowerCase();
const stopName=(point:StopsMap[string])=>point.code&&codeKey(code(point.n))!==codeKey(point.code)?point.n.trim()+' '+point.code:point.n;
const comparableName=(name:string)=>name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l')
 .replace(/[()]/g,' ').replace(/^rzeszow[, ]+/,'').replace(/\bpodkar(?:p)?\./g,'podkarpacka ').replace(/\btowarn\.*\b/g,'towarnickiego').replace(/\bmochn\./g,'mochnackiego ');
const platformAbbreviations:Record<string,string>={
 przyst:'przystanek',szk:'szkola',przedszk:'przedszkole',skrz:'skrzyzowanie',skrzyz:'skrzyzowanie',
 kosc:'kosciol',osr:'osrodek',os:'osiedle',przych:'przychodnia',cment:'cmentarz',szp:'szpital',
 mlecz:'mleczarnia',leczn:'lecznica',zlewn:'zlewnia',spoldz:'spoldzielnia',
 glog:'glogowsk',zad:'zadwor',petl:'petla',rafal:'rafalowska',lach:'lachowka',jarz:'jarzabki',
};
// Exact numbered identities can correct a displaced EINFO point. Keep this
// stricter than the nearby name matcher and require uniqueness in both feeds.
function numberedIdentity(name:string){
 const suffix=code(name);if(!suffix)return '';
 return comparableName(name).replace(/\b([a-z]+)\./g,(word,stem)=>Object.hasOwn(platformAbbreviations,stem)?platformAbbreviations[stem]+' ':word)
  .replace(/\bglogowsk(?:a|ie|i|e)\b/g,'glogowsk').replace(/[^a-z0-9]+/g,' ').replace(/\bnz\b/g,' ')
  .trim().replace(/\s+/g,' ').replace(/\s\d+[a-z]?$/, ' '+codeKey(suffix));
}
const areaPosition=(point:StopsMap[string])=>point.areaId&&readBusCoordinates(point.lat,point.lon)?`${point.areaId}:${point.lat}:${point.lon}`:'';
export function indexPksGtfs(feed:PksGtfsFeed,base:StopsMap){
 const stops:StopsMap=Object.fromEntries(Object.entries(base).filter(([id])=>!id.startsWith('gtfs:')).map(([id,stop])=>[id,correctPksStop(stop,id)])),byStop:Record<string,string[]>={},lines:Record<string,string[]>={};
 const known=Object.entries(stops);
 const used=[...new Set(feed.patterns.flatMap(p=>p.map(c=>c[0])))].sort();
 const colocatedCodes=new Map<string,Set<string>>();
 for(const [,stop] of known){
  const position=areaPosition(stop);if(!position||!stop.code)continue;
  const codes=colocatedCodes.get(position)||new Set<string>();codes.add(codeKey(stop.code));colocatedCodes.set(position,codes);
 }
 // Repeated GTFS records can serve different trips at one numbered platform.
 const groups=new Map<string,string[]>();
 for(const id of used){
  const point=feed.stops[id];if(!point)continue;
  const identity=numberedIdentity(point.name);
  const key=identity&&readBusCoordinates(point.lat,point.lon)?`platform:${identity}:${point.lat}:${point.lon}`:`id:${id}`;
  const ids=groups.get(key)||[];ids.push(id);groups.set(key,ids);
 }
 const apiByIdentity=new Map<string,string[]>(),gtfsByIdentity=new Map<string,string[]>();
 for(const [index,points] of [[apiByIdentity,known.map(([id,s])=>[id,stopName(s)] as const)],
   [gtfsByIdentity,[...groups.values()].map(([id])=>[id,feed.stops[id].name] as const)]] as const){
  for(const [id,name] of points){const identity=numberedIdentity(name);if(identity)index.set(identity,[...(index.get(identity)||[]),id]);}
 }
 for(const ids of groups.values()){
  const id=ids[0],point=feed.stops[id];
  const suffix=code(point.name);
  const candidates=known.filter(([key,s])=>{
   if(key.startsWith('gtfs:')||s.lat===undefined||s.lon===undefined||Math.abs(s.lat-point.lat)>=.002||Math.abs(s.lon-point.lon)>=.003||suffix&&s.code&&codeKey(suffix)!==codeKey(s.code))return false;
   const a=comparableName(point.name),b=comparableName(stopName(s));
   const surveyed=Boolean(suffix&&s.code&&codeKey(suffix)===codeKey(s.code)&&Math.hypot(s.lat-point.lat,(s.lon-point.lon)*.64)<.00001&&a.split(/[^a-z]+/)[0]===b.split(/[^a-z]+/)[0]);
   return surveyed||sameRouteStopName(a,b);
  })
   .map(([key,s])=>({key,distance:(s.lat!-point.lat)**2+((s.lon!-point.lon)*.64)**2})).sort((a,b)=>a.distance-b.distance);
  // Require an unambiguous same-platform identity; GTFS IDs are never EINFO IDs.
  const matched=candidates[0]&&(!candidates[1]||candidates[1].distance>candidates[0].distance+1e-9)?candidates[0].key:undefined;
  const platform=rzeszowTerminalPlatform(point.name);
  const terminal=platform===null?undefined:known.find(([,s])=>s.areaId==='1937'&&codeKey(s.code||'')===codeKey(platform))?.[0]||
   (platform==='4'?'3720':'terminal:rzeszow-da:'+platform);
  const identity=numberedIdentity(point.name),samePlatform=apiByIdentity.get(identity);
  const exactId=gtfsByIdentity.get(identity)?.length===1&&samePlatform?.length===1?samePlatform[0]:undefined;
  const origin=exactId?readBusCoordinates(stops[exactId].lat,stops[exactId].lon):null;
  const surveyed=readBusCoordinates(point.lat,point.lon);
  const distance=origin&&surveyed?Math.hypot(origin.lat-surveyed.lat,(origin.lon-surveyed.lon)*.64)*111195:Infinity;
  const exact=distance<=1200?exactId:undefined;
  const key=terminal||exact||matched||'gtfs:'+id;
  if(!terminal&&exact&&surveyed&&(distance>120||(colocatedCodes.get(areaPosition(stops[key]))?.size||0)>1)){
   stops[key]={...stops[key],...surveyed};
  }
  if(!stops[key])stops[key]={n:platform===null?point.name:displayStopCatalogLabel(point.name,platform),lat:point.lat,lon:point.lon,areaId:platform===null?'gtfs:'+id:'1937',code:platform??(suffix||'1')};
  (byStop[key]??=[]).push(...ids);lines[key]=[];
 }
 const lineSets:Record<string,Set<string>>={};for(const key of Object.keys(byStop))lineSets[key]=new Set();
 const reverse=new Map(Object.entries(byStop).flatMap(([key,ids])=>ids.map(id=>[id,key] as const)));
 for(const trip of feed.trips){const pattern=feed.patterns[trip[4]];for(const call of pattern){const key=reverse.get(call[0]);if(key&&call[3]!==1&&call!==pattern.at(-1))lineSets[key].add(trip[1]);}}
 for(const [key,set] of Object.entries(lineSets))lines[key]=[...set].sort((a,b)=>a.localeCompare(b,'pl',{numeric:true}));
 for(const [key,ids] of Object.entries(byStop)){
  const gtfsAliases=ids.map(id=>'gtfs:'+id).filter(id=>id!==key);
  if(gtfsAliases.length)stops[key]={...stops[key],gtfsAliases};
 }
 return {stops,byStop,lines,canonicalByGtfsId:reverse};
}
export function pksGtfsDepartures(feed:PksGtfsFeed,ids:string[],date:string){
 const selected=new Set(ids),rows:Array<Record<string,any>>=[];
 if(!pksGtfsCovers(feed,date))return rows;
 for(const [trip,line,service,start,patternId] of feed.trips){
  if(!pksGtfsServiceRuns(feed,service,date))continue;
  const pattern=feed.patterns[patternId];
  for(const call of pattern){
   if(!selected.has(call[0])||call[3]===1||call===pattern.at(-1))continue;
   const seconds=start+call[2],clock=`${Math.floor(seconds/3600)}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
   rows.push({journey_id:'gtfs:'+trip,trip_id:trip,provider_id:'pks',line_name:line,route_description:feed.headsigns?.[trip]||feed.stops[pattern.at(-1)![0]]?.name||'',timetable_time:new Date(warsawTimeMs(date,clock)).toISOString(),deviation:null,legends:[],past:false});
  }
 }
 return rows.sort((a,b)=>Date.parse(a.timetable_time)-Date.parse(b.timetable_time));
}
