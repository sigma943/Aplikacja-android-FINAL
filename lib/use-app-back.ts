'use client';
import {createContext,createElement,useContext,useEffect,useRef,type ReactNode} from 'react';
import {appBackStack} from './app-back';

const BackScopeContext = createContext(true);
export function BackScope({enabled,children}: {enabled: boolean;children: ReactNode}) {
  return createElement(BackScopeContext.Provider,{value:enabled},children);
}

export function useAppBack(enabled: boolean, run: () => boolean, priority = 0) {
  const inForeground = useContext(BackScopeContext);
  const active = enabled && inForeground;
  const current = useRef({active,run});
  current.current = {active,run};
  useEffect(() => active ? appBackStack.register(() => current.current.active && current.current.run(),priority) : undefined,[active,priority]);
}
