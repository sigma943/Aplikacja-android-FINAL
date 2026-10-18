type RouteRetryOptions<T> = {
  isUsable?: (value: T) => boolean;
  keepRetrying?: boolean;
};

/** Retry transient failures and empty geometry only for the active selection. */
export async function loadRouteWithRetry<T>(
  load: () => Promise<T>,
  signal: AbortSignal,
  delays = [1000, 3000],
  options: RouteRetryOptions<T> = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new DOMException('Route selection cancelled', 'AbortError');
    try {
      const value = await load();
      if (signal.aborted) throw new DOMException('Route selection cancelled', 'AbortError');
      if (options.isUsable && !options.isUsable(value)) throw new Error('Route geometry is not available yet');
      return value;
    } catch (error) {
      if (signal.aborted || (!options.keepRetrying && attempt >= delays.length)) throw error;
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 30000;
      await new Promise<void>((resolve, reject) => {
        const onlineTarget = typeof window === 'undefined' ? null : window;
        const cleanup = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', abort);
          onlineTarget?.removeEventListener('online', resume);
        };
        const resume = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(new DOMException('Route selection cancelled', 'AbortError')); };
        const timer = setTimeout(resume, delay);
        signal.addEventListener('abort', abort, { once: true });
        onlineTarget?.addEventListener('online', resume, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
}
