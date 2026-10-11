import {buildStopsCatalog} from './stops-catalog';
import type {CatalogWorkerRequest, CatalogWorkerResult} from './stops-catalog-async';

// Use the same identity and coordinate pipeline as the synchronous fallback.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CatalogWorkerRequest>) => void) | null;
  postMessage: (result: CatalogWorkerResult | {id:number; error:true}) => void;
};
scope.onmessage = ({data}) => {
  try {
    const list = buildStopsCatalog(data.pks, data.mpk, data.marcel, data.key);
    const physical = buildStopsCatalog(data.pks, data.mpk, data.marcel, data.key, true);
    scope.postMessage({id:data.id, list, physical});
  } catch {
    scope.postMessage({id:data.id, error:true});
  }
};
