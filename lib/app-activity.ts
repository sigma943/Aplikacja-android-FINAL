import {Capacitor} from '@capacitor/core';

let nativeForeground = true;

/** Widgets have an independent, bounded job and must keep working off screen. */
export function isAppVisible() {
  return typeof document === 'undefined' ||
    (typeof window !== 'undefined' && Boolean((window as any).NativeWidget)) || (nativeForeground && document.visibilityState !== 'hidden');
}

const subscribers = new Set<(active: boolean) => void>();
let stopObservation: (() => void) | undefined;

export function observeAppActivity(changed: (active: boolean) => void) {
  if (typeof document === 'undefined' || (window as any).NativeWidget) return () => {};
  subscribers.add(changed);
  if (!stopObservation) {
    let disposed = false, previous = isAppVisible(), revision = 0;
    const publish = () => {
      const active = isAppVisible();
      if (!disposed && active !== previous) {
        previous = active;
        for (const subscriber of subscribers) subscriber(active);
      }
    };
    document.addEventListener('visibilitychange', publish);
    const native = Capacitor.isNativePlatform() ? import('@capacitor/app').then(async ({App}) => {
      const listener = await App.addListener('appStateChange', ({isActive}) => {
        if (disposed) return;
        revision++; nativeForeground = isActive; publish();
      });
      const currentRevision = revision;
      try {
        const state = await App.getState();
        if (!disposed && revision === currentRevision) { nativeForeground = state.isActive; publish(); }
      } catch { /* DOM visibility remains available on older WebViews. */ }
      return listener;
    }) : null;
    stopObservation = () => {
      disposed = true;
      document.removeEventListener('visibilitychange', publish);
      void native?.then(listener => listener.remove()).catch(() => {});
    };
  }
  return () => {
    subscribers.delete(changed);
    if (!subscribers.size) { stopObservation?.(); stopObservation = undefined; }
  };
}

/** Abort browser requests on hide; prevent native results from starting fallbacks. */
export async function foregroundRequest<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const stop = observeAppActivity(active => { if (!active) abort(); });
  signal?.addEventListener('abort', abort, {once: true});
  try {
    if (!isAppVisible() || signal?.aborted) abort();
    controller.signal.throwIfAborted();
    const value = await run(controller.signal);
    controller.signal.throwIfAborted();
    return value;
  } finally {
    stop(); signal?.removeEventListener('abort', abort);
  }
}
