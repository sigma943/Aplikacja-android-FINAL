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
      timer=null;if(!target.current)return;
      const rect=canvas.getBoundingClientRect();
      if(rect.width<1||rect.height<1)return;
      const tiles:HTMLImageElement[]=[];
      for(const image of source.querySelectorAll<HTMLImageElement>('img')){
        if(!image.complete||!image.naturalWidth)continue;
        const bounds=image.getBoundingClientRect();
        const left=bounds.left-rect.left+(393-rect.width)/2,top=bounds.top-rect.top+(480-rect.height)/2;
        if(bounds.width<1||bounds.height<1||left>=393||top>=480||left+bounds.width<=0||top+bounds.height<=0)continue;
        // Flatten the real screen coordinates instead of copying Leaflet's nested
        // transforms, which can put every tile outside the miniature viewport.
        const tile=new Image();tile.src=image.currentSrc||image.src;tile.alt='';
        Object.assign(tile.style,{position:'absolute',left:`${left}px`,top:`${top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,maxWidth:'none',transform:'none',filter:getComputedStyle(image).filter});
        tiles.push(tile);
      }
      target.current.replaceChildren(...tiles);setLive(tiles.length>0);
      if(!tiles.length)return;
      const attribution=canvas.querySelector<HTMLElement>('.leaflet-control-attribution');
      if(attribution){
        const credits=attribution.cloneNode(true) as HTMLElement;
        Object.assign(credits.style,{position:'absolute',right:'0',bottom:'65px',margin:'0',fontSize:'8px',padding:'1px 3px',background:'rgba(255,255,255,.85)',color:'#334155',zIndex:'2'});
        target.current.append(credits);
      }
    };
    const schedule=()=>{if(timer!==null)clearTimeout(timer);timer=setTimeout(copy,120);};
    const observer=new MutationObserver(schedule);observer.observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','src']});
    const resize=new ResizeObserver(schedule);resize.observe(canvas);source.addEventListener('load',schedule,true);copy();
    return()=>{observer.disconnect();resize.disconnect();source.removeEventListener('load',schedule,true);if(timer!==null)clearTimeout(timer);};
  },[dark]);
  const road=dark?'#394552':'#fff',edge=dark?'#18212b':'#cbd5d7',text=dark?'#aab7c7':'#566475';
  const streets=['M-30 160L420 365','M70 -20L290 500','M-20 310L420 125','M-20 400L420 235','M-10 55L420 245','M160 -20L420 410'];
  return <div data-preview-map={live?'tiles':'sample'} className="absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg width="393" height="480" viewBox="0 0 393 480" style={{background:dark?'#101820':'#e8ede7'}}>
      <path d="M0 345L95 390L50 480H0ZM300 0H393V96L348 113Z" fill={dark?'#12362d':'#c3ddbd'}/>
      <g fill={dark?'#1d2833':'#d6ddd8'} stroke={edge}>{[[40,175],[96,200],[146,218],[42,330],[190,325],[270,213],[295,352],[157,100],[321,135]].map(([x,y],i)=><rect key={i} x={x} y={y} width={i%2?34:43} height={i%2?25:31} rx="4" transform={`rotate(25 ${x} ${y})`}/>)}</g>
      <g fill="none" strokeLinecap="round">{streets.map(d=><path key={d} d={d} stroke={edge} strokeWidth="13"/>)}{streets.map(d=><path key={d} d={d} stroke={road} strokeWidth="7"/>)}</g>
      <g fill={text} fontSize="10" fontFamily="system-ui"><text x="20" y="222" transform="rotate(25 20 222)">Jagiellońska</text><text x="236" y="309" transform="rotate(-23 236 309)">3 Maja</text><text x="170" y="147">ŚRÓDMIEŚCIE</text><text x="78" y="354">Teatr</text><text x="270" y="395">Zamek</text></g>
      <g fill={dark?'#8094d0':'#6e7ba8'}><circle cx="70" cy="342" r="4"/><circle cx="258" cy="392" r="4"/></g>
    </svg>
    <div ref={target} className="absolute inset-0"/>
  </div>;
}
