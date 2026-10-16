
const ROUTE_GEOMETRY_LOCAL_PREFIX = 'routeGeometry:';

const ROUTE_GEOMETRY_DB_NAME = 'pks-live-route-geometry';

const ROUTE_GEOMETRY_DB_VERSION = 1;

const ROUTE_GEOMETRY_DB_STORE = 'routes';

type GeometryEntry={version:string;points:[number,number][];expiresAt:number};
const memory=new Map<string,GeometryEntry>();

let routeGeometryDbPromise: Promise<IDBDatabase | null> | null = null;

function readLocalRouteGeometry(cacheKey: string, version: string) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${ROUTE_GEOMETRY_LOCAL_PREFIX}${cacheKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: string; points?: [number, number][]; expiresAt?: number };
    if (parsed.version !== version) return [];
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) return [];
    const points = Array.isArray(parsed.points) ? parsed.points : [];
    return points.filter((point): point is [number, number] =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
    );
  } catch {
    return [];
  }
}

function openRouteGeometryDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (!routeGeometryDbPromise) {
    routeGeometryDbPromise = new Promise((resolve) => {
      let finished=false;
      const finish=(db:IDBDatabase|null)=>{
        if(finished){db?.close();return;}
        finished=true;clearTimeout(timeout);resolve(db);
      };
      const timeout=setTimeout(()=>finish(null),1000);
      try {
        const request=window.indexedDB.open(ROUTE_GEOMETRY_DB_NAME,ROUTE_GEOMETRY_DB_VERSION);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains(ROUTE_GEOMETRY_DB_STORE))db.createObjectStore(ROUTE_GEOMETRY_DB_STORE,{keyPath:'key'});
        };
        request.onsuccess=()=>{
          request.result.onversionchange=()=>{request.result.close();routeGeometryDbPromise=null;};
          finish(request.result);
        };
        request.onerror=request.onblocked=()=>finish(null);
      }catch{finish(null);}
    });
  }
  return routeGeometryDbPromise;
}

async function readIndexedRouteGeometry(cacheKey: string, version: string) {
  const db = await openRouteGeometryDb();
  if (!db) return [];
  return new Promise<[number, number][]>((resolve) => {
    const finish=(points:[number,number][])=>{clearTimeout(timeout);resolve(points);};
    const timeout=setTimeout(()=>resolve([]),1000);
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readonly');
    transaction.onabort=transaction.onerror=()=>finish([]);
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const parsed = request.result as { version?: string; points?: [number, number][]; expiresAt?: number } | undefined;
      if (!parsed || parsed.version !== version || (parsed.expiresAt && parsed.expiresAt <= Date.now())) {
        finish([]);
        return;
      }
      const points = Array.isArray(parsed.points) ? parsed.points : [];
      finish(points.filter((point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
      ));
    };
    request.onerror = () => finish([]);
  });
}

async function readPersistentRouteGeometry(cacheKey: string, version: string) {
  const cached=memory.get(cacheKey);
  if(cached?.version===version&&cached.expiresAt>Date.now())return cached.points;
  const indexed=await readIndexedRouteGeometry(cacheKey,version).catch(()=>[]);
  if(indexed.length>1)return indexed;
  // Old installations and browsers with disabled IndexedDB retain their fallback.
  return readLocalRouteGeometry(cacheKey, version);
}

function writeLocalRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  if (typeof window === 'undefined' || points.length <= 1) return;
  try {
    window.localStorage.setItem(
      `${ROUTE_GEOMETRY_LOCAL_PREFIX}${cacheKey}`,
      JSON.stringify({
        version,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        points,
      }),
    );
  } catch {
    // localStorage may be full; memory cache still keeps the current session fast.
  }
}

async function writeIndexedRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  if (points.length <= 1) return false;
  const db = await openRouteGeometryDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const finish=(saved:boolean)=>{clearTimeout(timeout);resolve(saved);};
    const timeout=setTimeout(()=>resolve(false),1000);
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readwrite');
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    store.put({
      key: cacheKey,
      version,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      points,
    });
    transaction.oncomplete = () => finish(true);
    transaction.onerror = () => finish(false);
    transaction.onabort = () => finish(false);
  });
}

async function writePersistentRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  if(points.length<=1)return;
  memory.set(cacheKey,{version,points,expiresAt:Date.now()+30*24*60*60*1000});
  if(memory.size>200)memory.delete(memory.keys().next().value!);
  const saved=await writeIndexedRouteGeometry(cacheKey,points,version).catch(()=>false);
  if(!saved)writeLocalRouteGeometry(cacheKey,points,version);
  else try {window.localStorage.removeItem(`${ROUTE_GEOMETRY_LOCAL_PREFIX}${cacheKey}`);} catch {/* Storage may be disabled. */}
}

export {ROUTE_GEOMETRY_LOCAL_PREFIX};
export {ROUTE_GEOMETRY_DB_NAME};
export {ROUTE_GEOMETRY_DB_VERSION};
export {ROUTE_GEOMETRY_DB_STORE};
export {routeGeometryDbPromise};
export {readLocalRouteGeometry};
export {openRouteGeometryDb};
export {readIndexedRouteGeometry};
export {readPersistentRouteGeometry};
export {writeLocalRouteGeometry};
export {writeIndexedRouteGeometry};
export {writePersistentRouteGeometry};
