import {readTimetableCache,writeTimetableCache} from '../timetable-cache';
import {limitTimetableRequest} from '../stop-timetable-store';
export type MarcelRoute={idTr:number;nazTr:string;nazMiOd?:string;nazMiDo?:string};
export type MarcelCourse={idKu:number;nazTr?:string;nazPr?:string;data?:string;godz?:string;godzPr?:string;idTr?:number};
export type MarcelCourseStopPublic={kol?:number;szGps?:number;dlGps?:number;nazTr?:string;nazMi?:string;nazPr?:string;godz?:string};
type Request=<T>(url:string,init?:RequestInit & {headers?:Record<string,string>})=>Promise<T>;
export function createMarcelTimetableApi(request:Request,base:string){
  const memory=new Map<string,{until:number;promise:Promise<unknown[]>}>();
  function cached<T>(key:string,path:string,ttl:number,valid:(row:unknown)=>boolean):Promise<T[]> {
    key=base+':'+key;
    const hit=memory.get(key);if(hit&&hit.until>Date.now())return hit.promise as Promise<T[]>;
    const promise=(async()=>{
      const saved=await readTimetableCache(key);
      if(saved&&saved.expiresAt>Date.now()&&Array.isArray(saved.data)&&saved.data.every(valid)){
        const entry=memory.get(key);if(entry)entry.until=saved.expiresAt;
        return saved.data as T[];
      }
      const data=await limitTimetableRequest(()=>request<unknown>(base+path,{headers:{Accept:'application/json'}}));
      if(!Array.isArray(data)||!data.every(valid))throw new Error('Marcel: nieprawidłowa odpowiedź rozkładu.');
      void writeTimetableCache(key,{savedAt:Date.now(),expiresAt:Date.now()+ttl,data});return data as T[];
    })().catch(error=>{if(memory.get(key)?.promise===promise)memory.delete(key);throw error;});
    memory.set(key,{until:Date.now()+ttl,promise});
    if(memory.size>700)memory.delete(memory.keys().next().value!);
    return promise;
  }
  const object=(row:unknown):row is Record<string,unknown>=>Boolean(row&&typeof row==='object'&&!Array.isArray(row));
  return {
    fetchMarcelRoutesClient:()=>cached<MarcelRoute>('marcel:v1:routes','/client/api/search/trasy?appVersion=v1.67',6*3600_000,row=>object(row)&&Number.isFinite(Number(row.idTr))&&typeof row.nazTr==='string'),
    fetchMarcelCoursesClient:(routeId:number|string,date:string)=>cached<MarcelCourse>(`marcel:v1:courses:${routeId}:${date}`,`/client/api/search/wariantTrasy/kusy?data=${encodeURIComponent(date)}&idTr=${encodeURIComponent(String(routeId))}&appVersion=v1.67`,15*60_000,row=>object(row)&&Number.isFinite(Number(row.idKu))),
    fetchMarcelPublicCourseStopsClient:(id:number|string)=>cached<MarcelCourseStopPublic>(`marcel:v1:stops:${id}`,`/client/api/trasy/kurs/${encodeURIComponent(String(id))}?appVersion=v1.67`,6*3600_000,row=>object(row)&&(typeof row.nazPr==='string'||typeof row.nazMi==='string')),
  };
}
