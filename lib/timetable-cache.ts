export type TimetableCacheEntry = { savedAt: number; expiresAt: number; data: unknown };
/** Bounded asynchronous storage; unavailable/full storage never blocks network data. */
function storage<T>(action:(store:IDBObjectStore)=>IDBRequest<T>,write=false):Promise<T|null> {
  if(typeof indexedDB==='undefined')return Promise.resolve(null);
  return new Promise(resolve=>{
    let finished=false,db:IDBDatabase|undefined;
    const finish=(value:T|null)=>{if(finished)return;finished=true;clearTimeout(timer);db?.close();resolve(value);};
    const timer=setTimeout(()=>finish(null),600);
    try{
      const open=indexedDB.open('pks-live-timetables',1);
      open.onupgradeneeded=()=>{const store=open.result.createObjectStore('entries');store.createIndex('savedAt','savedAt');};
      open.onerror=open.onblocked=()=>finish(null);
      open.onsuccess=()=>{
        db=open.result;if(finished){db.close();return;}
        db.onversionchange=()=>db?.close();
        try {
          const tx=db.transaction('entries',write?'readwrite':'readonly');const request=action(tx.objectStore('entries'));
          const previous=request.onsuccess;
          request.onsuccess=event=>{previous?.call(request,event);finish(request.result);};request.onerror=()=>finish(null);tx.onabort=()=>finish(null);
        }catch{finish(null);}
      };
    }catch{finish(null);}
  });
}
export function readTimetableCache(key:string){return storage<TimetableCacheEntry>(store=>store.get(key));}
export async function writeTimetableCache(key:string,entry:TimetableCacheEntry){
  await storage(store=>store.put(entry,key),true);
  // Keep the most recently written schedules; geometry has its separate cache.
  await storage(store=>{
    const count=store.count();
    count.onsuccess=()=>{
      let excess=count.result-700;
      if(excess<=0)return;
      const cursor=store.index('savedAt').openCursor();
      cursor.onsuccess=()=>{if(cursor.result&&excess-->0){cursor.result.delete();cursor.result.continue();}};
    };
    return count;
  },true);
}
