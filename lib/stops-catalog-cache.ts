import {mpkPassengerStop} from './mpk-passenger-lines';
import {sanitizeBusStop} from './bus-coordinates';
import type { Stop } from '@/Panel/src/types';
import type { RawStop, MarcelIndexedStop } from '@/components/stops-panel/stop-domain';

export type MpkCatalogStop = { id: string; name: string; lat?: number; lon?: number; lines: string[] };
export type CatalogSnapshot = {
  version: 2;
  pks: RawStop[];
  mpk: MpkCatalogStop[];
  marcel: MarcelIndexedStop[];
  lines: Record<string, string[]>;
  stops: Stop[];
};

function sanitizeSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  return {...snapshot, pks: snapshot.pks.map(sanitizeBusStop), mpk: snapshot.mpk.map(mpkPassengerStop).map(sanitizeBusStop),
    marcel: snapshot.marcel.map(sanitizeBusStop), stops: snapshot.stops.map(stop => stop.type === 'train' ? stop : sanitizeBusStop(stop))};
}

let memory: CatalogSnapshot | null = null;
let reading: Promise<CatalogSnapshot | null> | null = null;

export function validCatalogSnapshot(value: unknown): value is CatalogSnapshot {
  const data = value as CatalogSnapshot | null;
  const namedStop = (stop: RawStop | null) => Boolean(stop && typeof stop.id === 'string' && typeof stop.name === 'string');
  return Boolean(data && data.version === 2 && Array.isArray(data.pks) && Array.isArray(data.mpk)
    && Array.isArray(data.marcel) && data.lines && typeof data.lines === 'object'
    && data.pks.every(namedStop) && data.mpk.every(stop => namedStop(stop) && Array.isArray(stop.lines))
    && data.marcel.every(stop => namedStop(stop) && Array.isArray(stop.routeIds))
    && Object.values(data.lines).every(lines => Array.isArray(lines) && lines.every(line => typeof line === 'string'))
    && Array.isArray(data.stops) && data.stops.length
    && data.stops.every(stop => namedStop(stop)
      && Array.isArray(stop.lines) && Array.isArray(stop.carriers)));
}

export function peekStopsCatalogCache() { return memory; }

// Structured cloning in IndexedDB avoids parsing a large JSON catalog on the UI thread.
// Cache failure must never stop the network-backed list from loading.
function catalogStorage<T>(action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    let db: IDBDatabase | undefined;
    let finished = false;
    const finish = (value: T | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      db?.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1000);
    try {
      const open = indexedDB.open('pks-live-stops-catalog', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('catalog');
      open.onerror = open.onblocked = () => finish(null);
      open.onsuccess = () => {
        db = open.result;
        if (finished) { db.close(); return; }
        db.onversionchange = () => db?.close();
        try {
          const transaction = db.transaction('catalog', 'readwrite');
          const request = action(transaction.objectStore('catalog'));
          let result: T | null = null;
          request.onsuccess = () => { result = request.result; };
          transaction.oncomplete = () => finish(result);
          transaction.onerror = transaction.onabort = () => finish(null);
        } catch { finish(null); }
      };
    } catch { finish(null); }
  });
}

export function readStopsCatalogCache(): Promise<CatalogSnapshot | null> {
  if (memory) return Promise.resolve(memory);
  if (!reading) reading = catalogStorage(store => store.get('latest')).then(value => {
    if (validCatalogSnapshot(value)) memory = sanitizeSnapshot(value);
    return memory;
  }).finally(() => { reading = null; });
  return reading;
}

export async function writeStopsCatalogCache(snapshot: CatalogSnapshot) {
  if (!validCatalogSnapshot(snapshot)) return;
  memory = sanitizeSnapshot(snapshot);
  if(typeof window!=='undefined')window.dispatchEvent(new Event('pks-live:catalog-updated'));
  await catalogStorage(store => store.put(memory!, 'latest'));
}
