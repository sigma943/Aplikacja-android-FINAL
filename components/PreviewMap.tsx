'use client';
import {useEffect,useState} from 'react';
import {previewMapTiles} from '@/lib/preview-map';

/** A small street-only preview. Never includes real vehicles or requests location. */
export default function PreviewMap({dark,onTilesChange}:{dark:boolean;onTilesChange?:(shown:boolean)=>void}){
  const [loaded,setLoaded]=useState<Set<string>>(()=>new Set());
  const tiles=previewMapTiles();
  useEffect(()=>{onTilesChange?.(loaded.size>0);},[loaded,onTilesChange]);
  const road=dark?'#394552':'#fff',edge=dark?'#18212b':'#cbd5d7',text=dark?'#aab7c7':'#566475';
  const streets=['M-30 160L420 365','M70 -20L290 500','M-20 310L420 125','M-20 400L420 235','M-10 55L420 245','M160 -20L420 410'];
  return <div data-preview-map={loaded.size?'tiles':'sample'} className="personal-preview-map absolute inset-x-0 top-0 bottom-16 overflow-hidden" aria-hidden="true">
    <svg width="393" height="480" viewBox="0 0 393 480" style={{background:dark?'#101820':'#e8ede7'}}>
      <path d="M0 345L95 390L50 480H0ZM300 0H393V96L348 113Z" fill={dark?'#12362d':'#c3ddbd'}/>
      <g fill={dark?'#1d2833':'#d6ddd8'} stroke={edge}>{[[40,175],[96,200],[146,218],[42,330],[190,325],[270,213],[295,352],[157,100],[321,135]].map(([x,y],i)=><rect key={i} x={x} y={y} width={i%2?34:43} height={i%2?25:31} rx="4" transform={`rotate(25 ${x} ${y})`}/>)}</g>
      <g fill="none" strokeLinecap="round">{streets.map(d=><path key={d} d={d} stroke={edge} strokeWidth="13"/>)}{streets.map(d=><path key={d} d={d} stroke={road} strokeWidth="7"/>)}</g>
      <g fill={text} fontSize="10" fontFamily="system-ui"><text x="20" y="222" transform="rotate(25 20 222)">Grottgera</text><text x="236" y="309" transform="rotate(-23 236 309)">Grunwaldzka</text><text x="170" y="147">Dworzec PKS Rzeszów</text><text x="78" y="354">Stanowiska</text><text x="270" y="395">D.A.</text></g>
      <g fill={dark?'#8094d0':'#6e7ba8'}><circle cx="70" cy="342" r="4"/><circle cx="258" cy="392" r="4"/></g>
    </svg>
    <div className="absolute inset-0" style={{filter:dark?'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)':'none'}}>
      {tiles.map(tile=><img key={tile.id} data-preview-tile src={tile.src} alt="" draggable={false} onLoad={()=>setLoaded(previous=>new Set(previous).add(tile.id))} style={{position:'absolute',left:tile.left,top:tile.top,width:256,height:256,maxWidth:'none',visibility:loaded.has(tile.id)?'visible':'hidden'}}/>)}
    </div>
  </div>;
}
