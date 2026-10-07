import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import type {Stop} from '../types';
import {virtualListWindow} from '../../../lib/virtual-list';
const measuredHeights=new Map<string,number>();
let measuredWidth=0;
function MeasuredRow({id,top,onHeight,children}:{id:string;top:number;onHeight:(id:string,height:number)=>void;children:ReactNode}){
  const node=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(!node.current)return;
    const element=node.current;
    const measure=()=>onHeight(id,element.getBoundingClientRect().height);
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return()=>observer.disconnect();
  },[id,onHeight]);
  return <div ref={node} style={{position:'absolute',top,left:0,right:0}}>{children}</div>;
}
export default function VirtualStopCards({stops,scroll,render,onVisible}:{stops:Stop[];scroll:RefObject<HTMLDivElement|null>;render:(stop:Stop,index:number)=>ReactNode;onVisible?:(stops:Stop[])=>void}){
  const heights=useRef(measuredHeights);
  const [revision,setRevision]=useState(0),[view,setView]=useState({top:0,height:800});
  useEffect(()=>{
    const node=scroll.current;if(!node)return;
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      if(measuredWidth&&Math.abs(measuredWidth-node.clientWidth)>1){heights.current.clear();setRevision(value=>value+1);}
      measuredWidth=node.clientWidth;setView({top:node.scrollTop,height:node.clientHeight});
    });};
    const observer=new ResizeObserver(update);observer.observe(node);node.addEventListener('scroll',update,{passive:true});update();
    return()=>{observer.disconnect();node.removeEventListener('scroll',update);cancelAnimationFrame(frame);};
  },[scroll]);
  const range=useMemo(()=>virtualListWindow(stops.map(stop=>stop.id),heights.current,view.top,view.height),[stops,view,revision]);
  const measured=useRef<(id:string,height:number)=>void>(()=>{});
  measured.current=(id,height)=>{
    if(height<=0||Math.abs((heights.current.get(id)??128)-height)<1)return;
    heights.current.set(id,height);setRevision(value=>value+1);
    if(heights.current.size>5000)heights.current.delete(heights.current.keys().next().value!);
  };
  const stableMeasure=useRef((id:string,height:number)=>measured.current(id,height)).current;
  const visible=stops.slice(range.start,range.end);
  const visibleKey=visible.map(stop=>stop.id).join('|');
  const current=useRef({onVisible,visible});current.current={onVisible,visible};
  useEffect(()=>{current.current.onVisible?.(current.current.visible);},[visibleKey]);
  return <div data-virtual-stop-cards data-total-stops={stops.length} style={{position:'relative',height:range.total,flexShrink:0}}>
    {visible.map((stop,index)=><MeasuredRow key={stop.id} id={stop.id} top={range.offsets[range.start+index]} onHeight={stableMeasure}>{render(stop,range.start+index)}</MeasuredRow>)}
  </div>;
}
