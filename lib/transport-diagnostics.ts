export type DiagnosticProvider='pks'|'mpk_rzeszow'|'marcel';
export type TransportMeasurement={provider:DiagnosticProvider;kind:DiagnosticKind;latencyMs:number;failed:boolean;scope:'request'|'operation'};
const measurementListeners=new Set<(measurement:TransportMeasurement)=>void>();
export const subscribeTransportMeasurements=(listener:(measurement:TransportMeasurement)=>void)=>{measurementListeners.add(listener);return()=>{measurementListeners.delete(listener);};};
function publishMeasurement(measurement:TransportMeasurement){
  for(const listener of measurementListeners){try{listener(measurement);}catch{ /* Statistics must never change a transport result. */ }}
}
export type DiagnosticKind='vehicles'|'departures'|'geometry'|'catalog';
export type TransportDiagnostic={provider:DiagnosticProvider;kind:DiagnosticKind;lastSuccess?:number;lastError?:number;latencyMs:number;count?:number;dataAgeSec?:number;error?:string};
const records=new Map<string,TransportDiagnostic>(),listeners=new Set<()=>void>();
let snapshot:TransportDiagnostic[]=[];
export const getTransportDiagnostics=()=>snapshot;
export const subscribeTransportDiagnostics=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function recordTransportDiagnostic(provider:DiagnosticProvider,kind:DiagnosticKind,latencyMs:number,count?:number,error?:unknown,dataAgeSec?:number){
  const key=provider+':'+kind,previous=records.get(key);
  const next:TransportDiagnostic={...previous,provider,kind,latencyMs};
  if(error){next.lastError=Date.now();next.error=(error instanceof Error?error.message:String(error)).slice(0,160);}
  else{next.lastSuccess=Date.now();next.count=count;next.error=undefined;next.dataAgeSec=dataAgeSec;}
  records.set(key,next);snapshot=[...records.values()];listeners.forEach(listener=>listener());
}
export function diagnosticRequest(url:string){
  const provider:DiagnosticProvider|null=/marcel/i.test(url)?'marcel':/pks|einfo/i.test(url)?'pks':/mpk\/|mpk_rzeszow|mpkrzeszow\.pl|type=mpk|przystanki|stop_schedule|stop_id=/i.test(url)?'mpk_rzeszow':null;
  const kind:DiagnosticKind=/get_vehicles|vehicles|lokalizacjaBusow|type=mpk/.test(url)?'vehicles':/departures|timetable|schedule|wariantTrasy\/kusy/.test(url)?'departures':'catalog';
  return provider?{provider,kind}:null;
}
export async function measuredTransport<T>(provider:DiagnosticProvider,kind:DiagnosticKind,run:()=>Promise<T>,count?:(value:T)=>number,age?:(value:T)=>number|undefined,scope:TransportMeasurement['scope']='operation'){
  const start=Date.now();
  try{const value=await run();recordTransportDiagnostic(provider,kind,Date.now()-start,count?.(value),undefined,age?.(value));publishMeasurement({provider,kind,latencyMs:Date.now()-start,failed:false,scope});return value;}
  catch(error){if((error as {name?:string})?.name!=='AbortError'){recordTransportDiagnostic(provider,kind,Date.now()-start,undefined,error);publishMeasurement({provider,kind,latencyMs:Date.now()-start,failed:true,scope});}throw error;}
}
