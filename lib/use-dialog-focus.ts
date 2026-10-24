'use client';
import {useEffect,useRef,type RefObject} from 'react';
// Only the most recently opened modal handles keys, including when focus is lost.
const dialogs:HTMLElement[]=[];
/** Trap keyboard focus in modal surfaces and restore the opener on close. */
export function useDialogFocus(ref:RefObject<HTMLElement|null>,enabled:boolean,onClose?:()=>void){
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;},[onClose]);
  useEffect(()=>{
    const root=ref.current;if(!enabled||!root)return;
    dialogs.push(root);
    const previous=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length>0);
    // Opening a surface must not summon the phone keyboard. Text entry begins
    // when the user taps a field or reaches it with Tab.
    const initial=focusables().find(element=>!element.matches('input,textarea,select,[contenteditable]'));
    const previousTabIndex=root.getAttribute('tabindex');
    if(!initial)root.setAttribute('tabindex','-1');
    (initial||root).focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{
      if(dialogs.at(-1)!==root)return;
      if(event.key==='Escape'&&close.current){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key!=='Tab')return;
      const elements=focusables(),first=elements[0],last=elements[elements.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);if(!initial){if(previousTabIndex===null)root.removeAttribute('tabindex');else root.setAttribute('tabindex',previousTabIndex);}const wasTop=dialogs.at(-1)===root;const index=dialogs.lastIndexOf(root);if(index>=0)dialogs.splice(index,1);if(wasTop&&previous?.isConnected)previous.focus({preventScroll:true});};
  },[ref,enabled]);
}
