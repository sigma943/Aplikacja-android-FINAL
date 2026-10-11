export function createCatalogWorker(): Worker {
  return new Worker(new URL('./stops-catalog.worker.ts', import.meta.url));
}
