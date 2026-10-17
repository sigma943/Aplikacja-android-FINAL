'use client';
import {useEffect,useState,useRef} from 'react';
import {previewMapTiles,PREVIEW_MAP_HEIGHT} from '@/lib/preview-map';

/** A small street-only preview. Never includes real vehicles or requests location. */
export default function PreviewMap({dark,onTilesChange}:{dark:boolean;onTilesChange?:(shown:boolean)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),[loaded,setLoaded]=useState(0);
  useEffect(()=>{
    const context=canvas.current?.getContext('2d');if(!context)return;
    let disposed=false,painted=0;setLoaded(0);context.clearRect(0,0,393,PREVIEW_MAP_HEIGHT);
    const tiles=previewMapTiles();
    const images=tiles.map(tile=>{
      const image=new Image();
      image.onload=()=>{
        if(disposed)return;
        // Bake the palette into pixels. No live CSS filter/compositing surface
        // can invert a neighbouring navigation bar in Android WebView.
        context.save();context.filter=dark?'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)':'none';
        context.drawImage(image,tile.left,tile.top,256,256);context.restore();
        setLoaded(++painted);
      };
      image.src=tile.src;return image;
    });
    return()=>{disposed=true;for(const image of images)image.onload=null;};
  },[dark]);
  useEffect(()=>{onTilesChange?.(loaded>0);},[loaded,onTilesChange]);
  const road=dark?'#394552':'#fff',edge=dark?'#18212b':'#cbd5d7',text=dark?'#aab7c7':'#566475';
  const streets=['M-30 160L420 365','M70 -20L290 500','M-20 310L420 125','M-20 400L420 235','M-10 55L420 245','M160 -20L420 410'];
  return <div data-preview-map={loaded?'tiles':'sample'} className="personal-preview-map absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg width="393" height="480" viewBox="0 0 393 480" style={{background:dark?'#101820':'#e8ede7'}}>
      <path d="M0 345L95 390L50 480H0ZM300 0H393V96L348 113Z" fill={dark?'#12362d':'#c3ddbd'}/>
      <g fill={dark?'#1d2833':'#d6ddd8'} stroke={edge}>{[[40,175],[96,200],[146,218],[42,330],[190,325],[270,213],[295,352],[157,100],[321,135]].map(([x,y],i)=><rect key={i} x={x} y={y} width={i%2?34:43} height={i%2?25:31} rx="4" transform={`rotate(25 ${x} ${y})`}/>)}</g>
      <g fill="none" strokeLinecap="round">{streets.map(d=><path key={d} d={d} stroke={edge} strokeWidth="13"/>)}{streets.map(d=><path key={d} d={d} stroke={road} strokeWidth="7"/>)}</g>
      <g fill={text} fontSize="10" fontFamily="system-ui"><text x="20" y="222" transform="rotate(25 20 222)">Grottgera</text><text x="236" y="309" transform="rotate(-23 236 309)">Grunwaldzka</text><text x="170" y="147">Dworzec PKS Rzeszów</text><text x="78" y="354">Stanowiska</text><text x="270" y="395">D.A.</text></g>
      <g fill={dark?'#8094d0':'#6e7ba8'}><circle cx="70" cy="342" r="4"/><circle cx="258" cy="392" r="4"/></g>
    </svg>
    <canvas ref={canvas} data-preview-raster data-painted-tiles={loaded} data-total-tiles={previewMapTiles().length} data-palette={dark?'dark':'light'} width={393} height={PREVIEW_MAP_HEIGHT} className="absolute inset-0" aria-hidden="true"/>

  </div>;
}
