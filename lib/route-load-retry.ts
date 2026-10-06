/** Transient routing failures retry while this same selection remains active. */
export async function loadRouteWithRetry<T>(load: () => Promise<T>, signal: AbortSignal, delays = [1000, 3000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw new DOMException('Route selection cancelled', 'AbortError');
    try { return await load(); }
    catch (error) {
      if (signal.aborted || attempt >= delays.length) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Route selection cancelled', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delays[attempt]);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
}
