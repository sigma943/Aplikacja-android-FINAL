'use client';

import {useEffect,useState} from 'react';

const lenses=[
  {id:'nav',width:144,height:32,radius:11,scale:.12},
  {id:'filter',width:144,height:52,radius:9,scale:.10},
  {id:'control',width:32,height:32,radius:11,scale:.22},
] as const;

let cachedTextures:string[]|undefined;

// The red and green channels encode horizontal and vertical offsets.
// The center stays neutral, with refraction confined to the rounded bevel.
function bevelTexture({width,height,radius}:typeof lenses[number]){
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)return '';
  const image=context.createImageData(width,height);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const px=x+.5,py=y+.5;
      const dx=px-Math.max(radius,Math.min(width-radius,px));
      const dy=py-Math.max(radius,Math.min(height-radius,py));
      const distance=Math.hypot(dx,dy);
      const depth=(radius-distance)/4;
      const strength=depth>0&&depth<1?Math.sin(Math.PI*depth)*118:0;
      const i=(y*width+x)*4;
      image.data[i]=128-strength*(height/width)*dx/(distance||1);
      image.data[i+1]=128-strength*dy/(distance||1);
      image.data[i+2]=128;
      image.data[i+3]=255;
    }
  }
  context.putImageData(image,0,0);
  return canvas.toDataURL();
}

export default function LiquidGlassOptics(){
  const [textures,setTextures]=useState(cachedTextures);
  useEffect(()=>{
    cachedTextures??=lenses.map(bevelTexture);
    setTextures(cachedTextures);
  },[]);
  if(!textures?.every(Boolean))return null;
  return (
    <svg data-liquid-glass-optics aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <defs>
        {lenses.map(({id,scale},index)=>(
          <filter key={id} id={`pks-liquid-${id}`} x="0%" y="0%" width="100%" height="100%" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            <feImage href={textures[index]} x="0%" y="0%" width="100%" height="100%" preserveAspectRatio="none" result="bevel"/>
            <feDisplacementMap in="SourceGraphic" in2="bevel" scale={scale} xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        ))}
      </defs>
    </svg>
  );
}
