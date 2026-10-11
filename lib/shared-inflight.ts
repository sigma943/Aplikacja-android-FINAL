/** Share only unfinished work. Each caller retains independent cancellation. */
export function sharedInflight<T>(load: (signal: AbortSignal) => Promise<T>) {
  type Subscriber = { resolve: (value: T) => void; reject: (reason: unknown) => void; cleanup: () => void };
  type Flight = { controller: AbortController; subscribers: Set<Subscriber> };
  let current: Flight | undefined;
  return (signal?: AbortSignal): Promise<T> => {
    const aborted = () => new DOMException('Request aborted', 'AbortError');
    if (signal?.aborted) return Promise.reject(aborted());
    const fresh = !current;
    const flight = current ??= { controller: new AbortController(), subscribers: new Set() };
    const result = new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        subscriber.cleanup();
        flight.subscribers.delete(subscriber);
        reject(aborted());
        if (!flight.subscribers.size) {
          if (current === flight) current = undefined;
          flight.controller.abort();
        }
      };
      const subscriber: Subscriber = { resolve, reject, cleanup: () => signal?.removeEventListener('abort', onAbort) };
      flight.subscribers.add(subscriber);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    if (fresh) {
      const finish = (value: T | undefined, error: unknown, failed: boolean) => {
        if (current === flight) current = undefined;
        for (const subscriber of flight.subscribers) {
          subscriber.cleanup();
          if (failed) subscriber.reject(error);
          else subscriber.resolve(value as T);
        }
        flight.subscribers.clear();
      };
      Promise.resolve().then(() => {
        if (flight.controller.signal.aborted) throw aborted();
        return load(flight.controller.signal);
      }).then(
        value => finish(value, undefined, false),
        error => finish(undefined, error, true),
      );
    }
    return result;
  };
}
