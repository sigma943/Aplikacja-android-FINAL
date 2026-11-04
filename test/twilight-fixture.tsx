import {useEffect,useRef} from 'react';
import {LandscapeRenderer,landscapeSkyColors} from '../lib/landscape-renderer';
import {astronomyAt,DEFAULT_LANDSCAPE_LOCATION} from '../lib/landscape-astronomy';
export default function TwilightFixture(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let alive=true,renderer:LandscapeRenderer|undefined;
  const image=(name:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/themes/mountains/'+name;});
  void Promise.all(['terrain.webp','clouds.webp','water-mask.png','water-uv.png','water-perspective.png','scene-depth.png','terrain-normal.png'].map(image)).then(([terrain,clouds,water,geometry,perspective,sceneDepth,terrainNormal])=>{
   if(!alive)return;const canvas=ref.current!;renderer=new LandscapeRenderer(canvas);renderer.setAssets({terrain,clouds,water,geometry,perspective,sceneDepth,terrainNormal});renderer.resize(425,925,1);
   (window as any).__setTwilight=(iso:string)=>{
    const state=astronomyAt(Date.parse(iso),DEFAULT_LANDSCAPE_LOCATION);renderer!.render(state,0,false);
    const pixels=canvas.getContext('2d')!.getImageData(0,0,425,300).data;let energy=0;
    for(let i=0;i<pixels.length;i+=4)energy+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
    const lighting=renderer!.lighting!;return {altitude:state.sun.altitude*180/Math.PI,sky:lighting.sky,colors:landscapeSkyColors(lighting.sky),meanSky:energy/(pixels.length/4),gpu:renderer!.diagnostics().gpu};
   };
  }).catch(error=>{(window as any).__twilightError=String(error);});
  return()=>{alive=false;renderer?.dispose();delete (window as any).__setTwilight;};
 },[]);
 return <canvas ref={ref} data-twilight-scene style={{position:'fixed',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>;
}
