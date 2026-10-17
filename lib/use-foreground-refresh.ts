'use client';
import { useEffect, useRef } from 'react';
import { isAppVisible, observeAppActivity } from './app-activity';
import { foregroundRefresh } from './foreground-refresh';

export function useForegroundRefresh(key: string, run: () => Promise<unknown>, interval: number, enabled = true, initialDelay = 40, requireOnline = true) {
  const current = useRef(run); current.current = run;
  const control = useRef<ReturnType<typeof foregroundRefresh> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const available = () => isAppVisible() && (!requireOnline || navigator.onLine);
    let wasAvailable = available();
    const loop = foregroundRefresh(() => current.current(), available, interval, setTimeout, clearTimeout, initialDelay);
    control.current = loop;
    const visibility = () => {
      const next = available();
      if (next === wasAvailable) return;
      wasAvailable = next;
      loop.visibilityChanged();
    };
    const online = visibility;
    const stopActivity = observeAppActivity(visibility);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      loop.dispose(); control.current = null;
      stopActivity();
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
    };
  }, [key, interval, enabled, initialDelay, requireOnline]);
  return () => control.current?.refresh();
}
