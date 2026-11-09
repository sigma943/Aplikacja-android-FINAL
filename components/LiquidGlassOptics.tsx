'use client';

import {useEffect,useState} from 'react';

const lenses=[
  {id:'nav',width:144,height:32,radius:11,bevel:6,scale:.28},
  {id:'filter',width:144,height:52,radius:9,bevel:5,scale:.19},
  {id:'control',width:32,height:32,radius:11,bevel:6,scale:.42},
] as const;

let cachedTextures:string[]|undefined;

// Red and green encode refraction. Blue encodes the light reflected by
// the same curved surface, so the glint follows the corners of the lens.
function bevelTexture({width,height,radius,bevel}:typeof lenses[number]){
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
      const depth=(radius-distance)/bevel;
      const curve=depth>=0&&depth<1?1-depth:0;
      const slope=curve/Math.sqrt(Math.max(.04,1-curve*curve));
      const bend=124*slope/(1+slope);
      const nx=dx/(distance||1),ny=dy/(distance||1);
      const light=.58*nx+.82*ny;
      const glint=curve*curve*(.16+.84*Math.pow(Math.abs(light),4));
      const i=(y*width+x)*4;
      image.data[i]=128-bend*(height/width)*nx;
      image.data[i+1]=128-bend*ny;
      image.data[i+2]=255*glint;
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
            <feDisplacementMap in="SourceGraphic" in2="bevel" scale={scale} xChannelSelector="R" yChannelSelector="G" result="refracted"/>
            <feColorMatrix in="bevel" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0" result="reflection"/>
            <feBlend in="reflection" in2="refracted" mode="screen"/>
          </filter>
        ))}
      </defs>
    </svg>
  );
}
