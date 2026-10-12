let pending: Promise<typeof import('@/components/BusMap')> | undefined;

/** Loads code only; does not mount the map, fetch vehicles or grant access. */
export function loadMapCode() {
  if (!pending) {
    pending = import('@/components/BusMap').catch(error => {
      pending = undefined;
      throw error;
    });
  }
  return pending;
}

export function preloadMapCode() {
  if (typeof window !== 'undefined') void loadMapCode().catch(() => undefined);
}
