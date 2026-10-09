import {mybusStopCatalogue as catalogue} from './mpk-mybus-stop-catalogue';
import type {MybusStop} from './mpk-mybus-timetable';
type Point = [number, number];
type PositionedStop = MybusStop & {lat?:number; lon?:number; isPast?:boolean};
const attrs = (text:string):Record<string,string> => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const valid = (p:Point) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0]>=48 && p[0]<=56 && p[1]>=14 && p[1]<=25;
const distance = (a:Point,b:Point) => Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
const routes = new Map<string,{expires:number; promise:Promise<string>}>();
export function parseMybusRoute(xml:string,line:string,variant:string) {
 const root=/<R\b([^>]*)>/.exec(xml), header=root?attrs(root[1]):{};
 if(header.r?.trim()!==line.trim() || header.t?.trim()!==variant.trim()) throw Error('myBus route variant mismatch');
 const ids:number[]=[], points:Point[]=[];
 for(const match of xml.matchAll(/<T\b([^>]*?)(?:\/>|>([\s\S]*?)<\/T>)/g)) {
  const t=attrs(match[1]),from=Number(t.i1),to=Number(t.i2);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<=0||to<=0)throw Error('Invalid myBus stop IDs');
  if(ids.length && ids.at(-1)!==from)throw Error('Disconnected myBus route');
  if(!ids.length)ids.push(from);
  if(from===to)continue;
  ids.push(to);
  const segment:Point[]=[... (match[2]||'').matchAll(/<Pkt\b([^>]*?)\/>/g)].map(m=>{const a=attrs(m[1]);return [Number(a.y),Number(a.x)];});
  if(!segment.length || segment.some(p=>!valid(p)))throw Error('Missing or invalid myBus route points');
  for(const p of segment){if(points.length && distance(points.at(-1)!,p)>2000)throw Error('Discontinuous myBus geometry');if(!points.length || distance(points.at(-1)!,p)>.1)points.push(p);}
 }
 if(ids.length<2 || points.length<2)throw Error('Empty myBus route');
 return {ids,points};
}
function position(stop:MybusStop):PositionedStop {
 const entry=catalogue[String(stop.id)];
 return entry?{...stop,id:entry[0],lat:entry[2],lon:entry[3]}:{...stop,id:2000000+stop.id};
}
/** Preserve SIP identity until resolved against its own catalogue; never guess a GTFS ID. */
export async function enrichMybusRoute(board:string,schedule:MybusStop[],request:(url:string)=>Promise<string>) {
 const scheduleWithCoordinates=schedule.map(position);
 const fallback={schedule:scheduleWithCoordinates,routeStops:scheduleWithCoordinates,routePath:scheduleWithCoordinates.map(s=>s.id),routeGeometry:[] as Point[]};
 const header=attrs(/<Schedules\b([^>]*)>/.exec(board)?.[1]||'');
 if(!header.nr || header.type===undefined)return fallback;
 header.nr=header.nr.trim(); header.type=header.type.trim();
 const key=header.nr+':'+header.type;
 try {
  let cached=routes.get(key);
  if(!cached || cached.expires<Date.now()){
   const promise=request('http://84.38.160.220/myBusServices/SchedulesService.svc/GetRouteVariantWithTransitPoints?'+new URLSearchParams({cRoute:header.nr,cRouteVariant:header.type})).then(xml=>{parseMybusRoute(xml,header.nr,header.type);return xml;});
   cached={expires:Date.now()+30*60_000,promise};routes.set(key,cached);
   promise.catch(()=>{if(routes.get(key)?.promise===promise)routes.delete(key);});
  }
  const route=parseMybusRoute(await cached.promise,header.nr,header.type);
  const first=attrs(/<Stop\b([^>]*)>/.exec(board)?.[1]||''), sequence=Number(first.lp)-1;
  // Align occurrences, including the repeated terminus on circular lines.
  const start=Number.isInteger(sequence)&&sequence>=0&&route.ids[sequence]===schedule[0]?.id?sequence:route.ids.findIndex((_,i)=>schedule.every((s,j)=>route.ids[i+j]===s.id));
  if(start<0 || !schedule.every((s,i)=>route.ids[start+i]===s.id))return fallback;
  const routeStops:PositionedStop[]=route.ids.map((id,i)=>{
   const active=schedule[i-start],entry=catalogue[String(id)];
   return {...position(active || {id,name:entry?.[1]||String(id),planned:null,real:null}),isPast:i<start};
  });
  // Reject geometry that belongs to a different catalogue/version instead of painting a wrong route.
  if(routeStops.some(s=>s.lat!==undefined&&s.lon!==undefined&&!route.points.some(p=>distance(p,[s.lat!,s.lon!])<=180)))return fallback;
  return {schedule:scheduleWithCoordinates,routeStops,routePath:routeStops.map(s=>s.id),routeGeometry:route.points};
 }catch{return fallback;}
}
