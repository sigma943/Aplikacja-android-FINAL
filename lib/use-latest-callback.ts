'use client';
import {useCallback,useRef} from 'react';

/** Stable child action with access to the current render's state and handlers. */
export function useLatestCallback<T extends (...args:any[])=>any>(callback:T):T {
  const current=useRef(callback);
  current.current=callback;
  return useCallback(((...args:Parameters<T>)=>current.current(...args)) as T,[]);
}
