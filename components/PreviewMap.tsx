'use client';
import {useEffect,useRef,useState} from 'react';

/** Reuse already loaded map tiles: no second map, location request or new feed. */
export default function PreviewMap({dark}:{dark:boolean}){
  const target=useRef<HTMLDivElement>(null),[live,setLive]=useState(false);
  useEffect(()=>{
    const source=document.querySelector<HTMLElement>('[data-map-canvas] .leaflet-tile-pane');
    const canvas=source?.closest<HTMLElement>('[data-map-canvas]');
    if(!source||!canvas||!target.current)return;
    let timer:ReturnType<typeof setTimeout>|null=null;
    const copy=()=>{
      timer=null;if(!target.current||!source.querySelector('img.leaflet-tile-loaded'))return;
      const rect=canvas.getBoundingClientRect(),pane=document.createElement('div');
      Object.assign(pane.style,{position:'absolute',left:`${(393-rect.width)/2}px`,top:`${(480-rect.height)/2}px`,width:`${rect.width}px`,height:`${rect.height}px`});
      const origin=document.createElement('div');origin.className='leaflet-map-pane';origin.style.transform=source.parentElement?.style.transform||'';
      origin.append(source.cloneNode(true));pane.append(origin);target.current.replaceChildren(pane);setLive(true);
    };
    const schedule=()=>{if(timer!==null)clearTimeout(timer);timer=setTimeout(copy,120);};
    const observer=new MutationObserver(schedule);observer.observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','src']});
    const resize=new ResizeObserver(schedule);resize.observe(canvas);source.addEventListener('load',schedule,true);copy();
    return()=>{observer.disconnect();resize.disconnect();source.removeEventListener('load',schedule,true);if(timer!==null)clearTimeout(timer);};
  },[dark]);
  const road=dark?'#394552':'#fff',edge=dark?'#18212b':'#cbd5d7',text=dark?'#aab7c7':'#566475';
  const streets=['M-30 160L420 365','M70 -20L290 500','M-20 310L420 125','M-20 400L420 235','M-10 55L420 245','M160 -20L420 410'];
  return <div data-preview-map={live?'tiles':'sample'} className="absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg width="393" height="480" viewBox="0 0 393 480" style={{display:live?'none':'block',background:dark?'#101820':'#e8ede7'}}>
      <path d="M0 345L95 390L50 480H0ZM300 0H393V96L348 113Z" fill={dark?'#12362d':'#c3ddbd'}/>
      <g fill={dark?'#1d2833':'#d6ddd8'} stroke={edge}>{[[40,175],[96,200],[146,218],[42,330],[190,325],[270,213],[295,352],[157,100],[321,135]].map(([x,y],i)=><rect key={i} x={x} y={y} width={i%2?34:43} height={i%2?25:31} rx="4" transform={`rotate(25 ${x} ${y})`}/>)}</g>
      <g fill="none" strokeLinecap="round">{streets.map(d=><path key={d} d={d} stroke={edge} strokeWidth="13"/>)}{streets.map(d=><path key={d} d={d} stroke={road} strokeWidth="7"/>)}</g>
      <g fill={text} fontSize="10" fontFamily="system-ui"><text x="20" y="222" transform="rotate(25 20 222)">Jagiellońska</text><text x="236" y="309" transform="rotate(-23 236 309)">3 Maja</text><text x="170" y="147">ŚRÓDMIEŚCIE</text><text x="78" y="354">Teatr</text><text x="270" y="395">Zamek</text></g>
      <g fill={dark?'#8094d0':'#6e7ba8'}><circle cx="70" cy="342" r="4"/><circle cx="258" cy="392" r="4"/></g>
    </svg>
    <div ref={target} className="absolute inset-0"/>
  </div>;
}
