'use client';
import {useEffect} from 'react';
export function editableTextTarget(target:EventTarget|null){
 const element=target instanceof Element?target:target instanceof Node?target.parentElement:null;
 return Boolean(element?.closest('input,textarea,[contenteditable="true"],[contenteditable=""]'));
}
export default function TextSelectionGuard(){
 useEffect(()=>{
  const prevent=(event:Event)=>{if(!editableTextTarget(event.target))event.preventDefault();};
  document.addEventListener('selectstart',prevent);document.addEventListener('contextmenu',prevent);
  return()=>{document.removeEventListener('selectstart',prevent);document.removeEventListener('contextmenu',prevent);};
 },[]);
 return null;
}
