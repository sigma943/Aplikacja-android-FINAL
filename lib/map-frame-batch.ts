/** Spread Leaflet DOM writes across frames without changing marker appearance. */
export function runFrameBatch<T>(items: T[], update: (item: T) => void, options: {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
  now: () => number;
  paused?: () => boolean;
  budgetMs?: number;
  batchSize?: number;
}) {
  let index = 0;
  let frame: number | undefined;
  let cancelled = false;
  const tick = () => {
    frame = undefined;
    if (cancelled || options.paused?.()) return;
    const start = options.now();
    let count = 0;
    while (index < items.length) {
      update(items[index++]);
      if (++count >= (options.batchSize ?? 64) || options.now() - start >= (options.budgetMs ?? 6)) break;
    }
    if (index < items.length) frame = options.request(tick);
  };
  if (items.length) frame = options.request(tick);
  return () => { cancelled = true; if (frame !== undefined) options.cancel(frame); };
}
