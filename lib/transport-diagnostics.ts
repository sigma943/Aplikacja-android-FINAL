export type DiagnosticProvider='pks'|'mpk_rzeszow'|'marcel';
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
  const provider:DiagnosticProvider|null=/marcel/i.test(url)?'marcel':/mpk\/|type=mpk|przystanki|stop_schedule|stop_id=/i.test(url)?'mpk_rzeszow':/pks|einfo/i.test(url)?'pks':null;
  const kind:DiagnosticKind=/get_vehicles|vehicles|lokalizacjaBusow|type=mpk/.test(url)?'vehicles':/departures|timetable|schedule|wariantTrasy\/kusy/.test(url)?'departures':'catalog';
  return provider?{provider,kind}:null;
}
export async function measuredTransport<T>(provider:DiagnosticProvider,kind:DiagnosticKind,run:()=>Promise<T>,count?:(value:T)=>number,age?:(value:T)=>number|undefined){
  const start=Date.now();
  try{const value=await run();recordTransportDiagnostic(provider,kind,Date.now()-start,count?.(value),undefined,age?.(value));return value;}
  catch(error){if((error as {name?:string})?.name!=='AbortError')recordTransportDiagnostic(provider,kind,Date.now()-start,undefined,error);throw error;}
}
