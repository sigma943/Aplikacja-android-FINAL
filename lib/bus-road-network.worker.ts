/// <reference lib="webworker" />
import {routeOnBusRoadNetwork,type BusRoadNetwork} from './bus-road-network';
let network:Promise<BusRoadNetwork>|undefined;
self.onmessage=async event=>{
 const {id,stops}=event.data;
 try{
  network??=fetch('/data/bus-road-network.json',{cache:'force-cache',signal:AbortSignal.timeout(6000)}).then(r=>{if(!r.ok)throw Error('Road network unavailable');return r.json();}).catch(error=>{network=undefined;throw error;});
  const points=routeOnBusRoadNetwork(await network,stops);self.postMessage({id,points});
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Road network unavailable'});}
};
