import {runTimetableSearch} from '../lib/journey-worker-client';
import {warsawTimeMs} from '../lib/transit-time';
import type {Stop} from '../Panel/src/types';
import type {TimetableFeed} from '../lib/journey-timetable';

const date='2026-10-20',at=warsawTimeMs(date,'12:00');
const stop=(id:string,lat:number):Stop=>({id,name:id,type:'bus',lat,lon:22,carriers:[],lines:[],isFavorite:false});
const a=stop('journey:pks:a',50),b=stop('journey:pks:b',50.02),d=stop('journey:pks:d',50.04);
const NativeWorker=window.Worker;
Object.assign(window,{__workerCount:0,__engineResult:null,__engineError:'',__engineProgress:0});
window.Worker=class extends NativeWorker{constructor(url:URL|string,options?:WorkerOptions){super(url,options);(window as any).__workerCount++;}};
let controller:AbortController;
const feed:TimetableFeed={version:1,provider:'pks',validFrom:'20261001',validUntil:'20261231',stops:{a:{name:'a',lat:50,lon:22},b:{name:'b',lat:50.02,lon:22},d:{name:'d',lat:50.04,lon:22}},calendars:{s:{start:'20261001',end:'20261231',days:'1111111'}},exceptions:{},patterns:[[['a',0,0,0,0],['b',600,600,0,0]],[['b',0,0,0,0],['d',600,600,0,0]]],trips:[['first','108','s',12*3600+600,0],['safe','108','s',12*3600+2400,1]]};
Object.assign(window,{
 async runEngine(cancel=false){
  controller=new AbortController();(window as any).__engineError='';(window as any).__engineResult=null;
  const c=stop('mpk:c',cancel?50.02025:50.0202);
  try{
   const result=await runTimetableSearch({from:a,to:d,date,catalog:[],options:{at,arriveBy:false,maxTransfers:1,walkMeters:100,transferMinutes:1,providers:['pks','mpk'],sort:'fastest'},feedData:{pks:feed,mpk:null},extra:[{from:c,to:d,departure:at+22*60000,arrival:at+30*60000,course:'mpk:fast',provider:'mpk',line:'1'}]},controller.signal,()=>{(window as any).__engineProgress++;});
   (window as any).__engineResult=result;document.body.textContent='complete';return result;
  }catch(error){(window as any).__engineError=(error as Error).name;document.body.textContent='error';return null;}
 },cancelEngine(){controller.abort();}
});
document.body.textContent='ready';
