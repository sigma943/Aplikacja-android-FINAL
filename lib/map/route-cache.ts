
const ROUTE_GEOMETRY_LOCAL_PREFIX = 'routeGeometry:';

const ROUTE_GEOMETRY_DB_NAME = 'pks-live-route-geometry';

const ROUTE_GEOMETRY_DB_VERSION = 1;

const ROUTE_GEOMETRY_DB_STORE = 'routes';

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
      const request = window.indexedDB.open(ROUTE_GEOMETRY_DB_NAME, ROUTE_GEOMETRY_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ROUTE_GEOMETRY_DB_STORE)) {
          db.createObjectStore(ROUTE_GEOMETRY_DB_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return routeGeometryDbPromise;
}

async function readIndexedRouteGeometry(cacheKey: string, version: string) {
  const db = await openRouteGeometryDb();
  if (!db) return [];
  return new Promise<[number, number][]>((resolve) => {
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readonly');
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    const request = store.get(cacheKey);
    request.onsuccess = () => {
      const parsed = request.result as { version?: string; points?: [number, number][]; expiresAt?: number } | undefined;
      if (!parsed || parsed.version !== version || (parsed.expiresAt && parsed.expiresAt <= Date.now())) {
        resolve([]);
        return;
      }
      const points = Array.isArray(parsed.points) ? parsed.points : [];
      resolve(points.filter((point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
      ));
    };
    request.onerror = () => resolve([]);
  });
}

async function readPersistentRouteGeometry(cacheKey: string, version: string) {
  const local = readLocalRouteGeometry(cacheKey, version);
  if (local.length > 1) return local;
  return readIndexedRouteGeometry(cacheKey, version).catch(() => []);
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
  if (points.length <= 1) return;
  const db = await openRouteGeometryDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(ROUTE_GEOMETRY_DB_STORE, 'readwrite');
    const store = transaction.objectStore(ROUTE_GEOMETRY_DB_STORE);
    store.put({
      key: cacheKey,
      version,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      points,
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

function writePersistentRouteGeometry(cacheKey: string, points: [number, number][], version: string) {
  writeLocalRouteGeometry(cacheKey, points, version);
  void writeIndexedRouteGeometry(cacheKey, points, version).catch(() => {});
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
