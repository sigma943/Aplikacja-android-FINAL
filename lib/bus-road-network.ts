import {roadDistance,routedRoadRouteMatchesStops} from './bus-road-geometry';
type Point=[number,number];
export type BusRoadNetwork={version:1;points:Point[];links:Array<[number,number]>};
/** Directed roads observed in operator shapes, used only after the exact course fails. */
export function routeOnBusRoadNetwork(data:BusRoadNetwork,stops:Point[]):Point[]{
 if(data.version!==1||stops.length<2)return [];
 const points=data.points.map(p=>[p[0]/1e6,p[1]/1e6] as Point),edges:Array<Array<[number,number]>>=Array.from({length:points.length},()=>[]);
 for(const [a,b] of data.links)if(points[a]&&points[b])edges[a].push([b,roadDistance(points[a],points[b])]);
 const candidates=stops.map(stop=>points.map((p,id)=>({id,distance:roadDistance(stop,p)})).filter(p=>p.distance<=55).sort((a,b)=>a.distance-b.distance).slice(0,6));
 if(candidates.some(c=>!c.length))return [];
 const route:number[]=[];
 let current=candidates[0][0].id;
 for(let leg=1;leg<stops.length;leg++){
  const targets=new Set(candidates[leg].map(c=>c.id)),cost=new Map<number,number>([[current,0]]),parent=new Map<number,number>();
  const heap:Array<[number,number]>=[];
  const push=(entry:[number,number])=>{heap.push(entry);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=entry[0])break;heap[i]=heap[p];i=p;}heap[i]=entry;};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  const heuristic=(id:number)=>Math.max(0,roadDistance(points[id],stops[leg])-55);
  push([heuristic(current),current]);let found:number|undefined,visited=0;
  const settled=new Set<number>();
  while(heap.length&&visited++<points.length*2){
   const [,id]=pop();if(settled.has(id))continue;settled.add(id);
   if(targets.has(id)){found=id;break;}
   for(const [next,length] of edges[id]){const value=cost.get(id)!+length;if(value<(cost.get(next)??Infinity)){cost.set(next,value);parent.set(next,id);push([value+heuristic(next),next]);}}
  }
  if(found===undefined)return [];
  const path=[found];while(path.at(-1)!==current){const previous=parent.get(path.at(-1)!);if(previous===undefined)return [];path.push(previous);}path.reverse();
  if(!route.length)route.push(path[0]);route.push(...path.slice(1));current=found;
 }
 const result=route.map(id=>points[id]);
 return routedRoadRouteMatchesStops(result,stops)?result:[];
}
