import type {Stop} from '@/Panel/src/types';
import {stopDistance} from './journey-planner';
export type JourneyFootpath={key:string;meters:number;minutes:number;points:Array<[number,number]>;checkedAt:number};
export type JourneySearchGraph={footpaths:JourneyFootpath[];discoverWalks?:boolean};
const indexes=new WeakMap<JourneySearchGraph,Map<string,JourneyFootpath>>();
export function journeyFootpathKey(from:Stop,to:Stop){
 return JSON.stringify([from.id,from.lat,from.lon,to.id,to.lat,to.lon]);
}
export function journeyWalkMetric(from:Stop,to:Stop,budget:number,graph?:JourneySearchGraph){
 if(from.id===to.id)return {meters:0,minutes:0,quality:'verified' as const};
 let known:JourneyFootpath|undefined;
 if(graph){let index=indexes.get(graph);if(!index){index=new Map(graph.footpaths.map(p=>[p.key,p]));indexes.set(graph,index);}known=index.get(journeyFootpathKey(from,to));}
 const meters=known?.meters??Math.ceil(stopDistance(from,to)*(graph?.discoverWalks?1:1.35));
 if(!Number.isFinite(meters)||meters>budget||budget<=0)return null;
 return {meters,minutes:known?.minutes??Math.max(1,Math.ceil(meters/70)),quality:known?'verified' as const:'estimated' as const,points:known?.points,checkedAt:known?.checkedAt};
}
