'use client';
import {useEffect,type RefObject} from 'react';
/** Trap keyboard focus in modal surfaces and restore the opener on close. */
export function useDialogFocus(ref:RefObject<HTMLElement|null>,enabled:boolean,onClose?:()=>void){
  useEffect(()=>{
    const root=ref.current;if(!enabled||!root)return;
    const previous=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length>0);
    const first=focusables()[0];first?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&onClose){event.preventDefault();event.stopPropagation();onClose();}
      if(event.key!=='Tab')return;
      const elements=focusables(),first=elements[0],last=elements[elements.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    root.addEventListener('keydown',key);
    return()=>{root.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[ref,enabled]);
}
