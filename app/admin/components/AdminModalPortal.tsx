'use client';
import {useEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {useDialogFocus} from '@/lib/use-dialog-focus';
import {appBackStack} from '@/lib/app-back';

/** Escape animated/scrolling admin ancestors while preserving the current theme. */
export function AdminModalPortal({children}: {children:ReactNode}) {
  const anchor=useRef<HTMLSpanElement>(null);
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const modal=useRef<HTMLDivElement>(null);
  useDialogFocus(modal,Boolean(target),()=>{appBackStack.dispatch();});
  const [scope,setScope]=useState({theme:'dark',glass:'off',light:false,variables:{} as CSSProperties});
  useEffect(()=>{
    const source=anchor.current?.closest<HTMLElement>('.pks-panel-scope');
    const root=anchor.current?.closest<HTMLElement>('.pks-theme-root');
    const update=()=>{
      const style=getComputedStyle(source || document.documentElement);
      const variables:Record<string,string>={};
      for(let i=0;i<style.length;i++) {
        const name=style.item(i);
        if(name.startsWith('--pks-')||name.startsWith('--ui-'))variables[name]=style.getPropertyValue(name);
      }
      variables['--admin-viewport-height']=`${window.visualViewport?.height || innerHeight}px`;
      variables['--admin-viewport-top']=`${window.visualViewport?.offsetTop || 0}px`;
      setScope({theme:source?.dataset.panelTheme || 'dark',glass:source?.dataset.glass || 'off',light:source?.classList.contains('admin-light') || false,variables});
    };
    setTarget(root || document.body);update();
    const observer=new MutationObserver(update);
    if(source)observer.observe(source,{attributes:true,attributeFilter:['style','class','data-glass','data-panel-theme']});
    if(root)observer.observe(root,{attributes:true,attributeFilter:['style','class']});
    window.visualViewport?.addEventListener('resize',update);
    window.visualViewport?.addEventListener('scroll',update);
    window.addEventListener('resize',update);
    return ()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[]);
  return <><span ref={anchor} hidden />{target&&createPortal(<div ref={modal} className={`pks-panel-scope ${scope.light?'admin-light':''}`} data-panel-theme={scope.theme} data-glass={scope.glass} style={scope.variables}>{children}</div>,target)}</>;
}
