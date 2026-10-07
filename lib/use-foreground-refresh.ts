'use client';
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { foregroundRefresh } from './foreground-refresh';

export function useForegroundRefresh(key: string, run: () => Promise<unknown>, interval: number, enabled = true) {
  const current = useRef(run); current.current = run;
  const control = useRef<ReturnType<typeof foregroundRefresh> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let foreground = document.visibilityState !== 'hidden';
    const loop = foregroundRefresh(() => current.current(), () => foreground && navigator.onLine, interval);
    control.current = loop;
    const visibility = () => { foreground = document.visibilityState !== 'hidden'; loop.visibilityChanged(); };
    const online = () => loop.visibilityChanged();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    const native = Capacitor.isNativePlatform() ? import('@capacitor/app').then(({App}) => App.addListener('appStateChange', ({isActive}) => {
      if (active) { foreground = isActive; loop.visibilityChanged(); }
    })) : null;
    return () => {
      active = false; loop.dispose(); control.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
      void native?.then(listener => listener.remove()).catch(() => {});
    };
  }, [key, interval, enabled]);
  return () => control.current?.refresh();
}
