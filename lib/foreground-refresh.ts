/** A disposed loop cannot schedule another timer after an in-flight request finishes. */
export function foregroundRefresh(run: () => Promise<unknown>, visible: () => boolean, interval: number,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (id: any) => void = clearTimeout, initialDelay = 40) {
  let disposed = false, running = false, timer: unknown;
  const tick = async () => {
    if (disposed || running) return;
    cancel(timer); timer = undefined;
    if (!visible()) return;
    running = true;
    try { await run(); } catch { /* The consumer owns error presentation. */ }
    finally {
      running = false;
      if (!disposed && visible()) timer = schedule(() => { void tick(); }, interval);
    }
  };
  timer = schedule(() => { void tick(); }, initialDelay);
  return {
    refresh: () => { if (!disposed) void tick(); },
    visibilityChanged: () => { cancel(timer); timer = undefined; if (visible()) void tick(); },
    dispose: () => { disposed = true; cancel(timer); },
  };
}
