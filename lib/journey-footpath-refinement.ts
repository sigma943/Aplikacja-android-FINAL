import type {Journey} from './journey-planner';
import type {TimetableSearch} from './journey-schedules';
import {journeyWalkingRoute} from './journey-walking';
import {journeyFootpathKey,type JourneyFootpath} from './journey-footpath-network';
import {roadDistance,validRoadPoint} from './bus-road-geometry';
import {withRequestDeadline} from './request-deadline';

type Result={journeys:Journey[];warnings:string[];limited:boolean};
const storageKey='journey-footpaths:v1',ttl=7*86400000;
const paths=new Map<string,JourneyFootpath>();
let hydrated=false;
function valid(p:JourneyFootpath,now:number){
 if(!p||typeof p.key!=='string'||p.key.length>1024||!Number.isFinite(p.meters)||p.meters<0||p.meters>50000||!Number.isFinite(p.minutes)||p.minutes!==Math.max(1,Math.ceil(p.meters/70))||!Number.isFinite(p.checkedAt)||p.checkedAt>now+60000||now-p.checkedAt>ttl||!Array.isArray(p.points)||p.points.length<2||!p.points.every(validRoadPoint))return false;
 const length=p.points.slice(1).reduce((sum,point,i)=>sum+roadDistance(p.points[i],point),0);
 if(Math.abs(p.meters-length)>Math.max(30,length*.35))return false;
 try{const key=JSON.parse(p.key);return Array.isArray(key)&&key.length===6&&validRoadPoint([key[1],key[2]])&&validRoadPoint([key[4],key[5]])&&roadDistance(p.points[0],[key[1],key[2]])<=30&&roadDistance(p.points.at(-1)!,[key[4],key[5]])<=30;}catch{return false;}
}
export function storedJourneyFootpaths(now=Date.now()){
 if(!hydrated&&typeof window!=='undefined'){
  hydrated=true;
  try{const saved=JSON.parse(window.localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))for(const p of saved.slice(-200))if(valid(p,now))paths.set(p.key,p);}catch{/* Disabled storage must not prevent an offline timetable search. */}
 }
 for(const [key,p] of paths)if(now-p.checkedAt>ttl)paths.delete(key);
 return [...paths.values()];
}
function persist(){
 while(paths.size>200)paths.delete(paths.keys().next().value!);
 try{if(typeof window!=='undefined')window.localStorage.setItem(storageKey,JSON.stringify([...paths.values()]));}catch{/* In-memory verified paths remain available. */}
}

/** Discover with an admissible straight-line lower bound, route the actual
 * candidate walks, then search again with real distances and durations. A
 * rejected transfer can reveal the next bus instead of merely deleting a result.
 * Work is bounded; unverified offline paths are explicitly marked estimates. */
export async function refineJourneyFootpaths(input:TimetableSearch,scan:(input:TimetableSearch)=>Promise<Result>,signal:AbortSignal):Promise<Result>{
 const known=storedJourneyFootpaths(),graph={footpaths:known,discoverWalks:true};
 let current={...input,graph},result=await scan(current);signal.throwIfAborted();
 if(input.walkingRefinement===false)return {...result,warnings:[...result.warnings,...(result.journeys.some(j=>j.legs.some(l=>l.walking!==undefined&&l.walkingQuality!=='verified'))?['Wstępne wyniki: trwa sprawdzanie rzeczywistych dojść pieszych.']:[])]};
 const failed=new Set<string>();let requested=0;
 const deadline=Date.now()+12000;
 for(let round=0;round<3;round++){
  const candidates=new Map<string,Journey['legs'][number]>();
  for(const j of result.journeys)for(const l of j.legs){
   const key=journeyFootpathKey(l.from,l.to);
   if(l.walking!==undefined&&l.walkingQuality!=='verified'&&!failed.has(key)&&!graph.footpaths.some(p=>p.key===key)&&validRoadPoint([l.from.lat!,l.from.lon!])&&validRoadPoint([l.to.lat!,l.to.lon!]))candidates.set(key,l);
  }
  const queue=[...candidates].slice(0,Math.max(0,24-requested));
  if(!queue.length||Date.now()>=deadline)break;
  let cursor=0,changed=false;
  await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
   while(cursor<queue.length&&Date.now()<deadline){
    signal.throwIfAborted();const [key,leg]=queue[cursor++];requested++;
    try{
     const route=await withRequestDeadline(()=>journeyWalkingRoute(leg.from,leg.to),signal,Math.max(1,deadline-Date.now()));signal.throwIfAborted();
     const path={key,meters:route.meters,minutes:route.minutes,points:route.points,checkedAt:Date.now()};
     if(!valid(path,Date.now()))throw Error('Niepełne dojście piesze.');
     paths.set(key,path);graph.footpaths.push(path);changed=true;
    }catch{signal.throwIfAborted();failed.add(key);}
   }
  }));
  if(!changed)break;persist();
  current={...input,graph:{...graph,footpaths:[...graph.footpaths]}};
  result=await scan(current);signal.throwIfAborted();
 }
 const estimated=result.journeys.some(j=>j.legs.some(l=>l.walking!==undefined&&l.walkingQuality!=='verified'));
 return {...result,limited:result.limited||estimated,warnings:[...result.warnings,...(estimated?['Część dojść pieszych jest szacowana. Nie udało się potwierdzić wszystkich przejść; sprawdź je przed podróżą.']:[])]};
}
