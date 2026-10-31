type Point=[number,number];
let worker:Worker|undefined,sequence=0;
const requests=new Map<number,{resolve:(points:Point[])=>void;reject:(error:Error)=>void}>();
const cache=new Map<string,Promise<Point[]>>();
export function bundledRoadNetworkRoute(stops:Point[]):Promise<Point[]>{
 if(typeof Worker==='undefined')return Promise.resolve([]);
 const key=JSON.stringify(stops);const existing=cache.get(key);if(existing)return existing;
 if(!worker){
  worker=new Worker(new URL('./bus-road-network.worker.ts',import.meta.url));
  worker.onmessage=event=>{const request=requests.get(event.data.id);requests.delete(event.data.id);if(event.data.error)request?.reject(new Error(event.data.error));else request?.resolve(event.data.points);};
  worker.onerror=()=>{worker?.terminate();worker=undefined;for(const request of requests.values())request.reject(new Error('Road network worker unavailable'));requests.clear();cache.clear();};
 }
 const id=++sequence;
 const request=new Promise<Point[]>((resolve,reject)=>{requests.set(id,{resolve,reject});worker!.postMessage({id,stops});});
 const result=request.catch(error=>{cache.delete(key);throw error;});cache.set(key,result);
 if(cache.size>50)cache.delete(cache.keys().next().value!);
 return result;
}
