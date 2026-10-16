'use client';
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { foregroundRefresh } from './foreground-refresh';

export function useForegroundRefresh(key: string, run: () => Promise<unknown>, interval: number, enabled = true, initialDelay = 40, requireOnline = true) {
  const current = useRef(run); current.current = run;
  const control = useRef<ReturnType<typeof foregroundRefresh> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let nativeActive = true;
    const available = () => nativeActive && document.visibilityState !== 'hidden' && (!requireOnline || navigator.onLine);
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
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    const native = Capacitor.isNativePlatform() ? import('@capacitor/app').then(({App}) => App.addListener('appStateChange', ({isActive}) => {
      if (active) { nativeActive = isActive; visibility(); }
    })) : null;
    return () => {
      active = false; loop.dispose(); control.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
      void native?.then(listener => listener.remove()).catch(() => {});
    };
  }, [key, interval, enabled, initialDelay, requireOnline]);
  return () => control.current?.refresh();
}
