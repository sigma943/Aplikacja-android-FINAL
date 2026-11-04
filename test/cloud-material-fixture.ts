import {LandscapeRenderer} from '../lib/landscape-renderer';
export async function checkCloudMaterials(){
 const image=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src='/themes/mountains/'+src;});
 const [terrain,clouds]=await Promise.all([image('terrain.webp'),image('clouds.webp')]);
 const canvas=document.createElement('canvas'),renderer=new LandscapeRenderer(canvas);renderer.setAssets({terrain,clouds,water:terrain});renderer.resize(425,925,1);
 const layer=(renderer as any).clouds as HTMLCanvasElement;
 const sample=(day:number)=>{(renderer as any).relight(day,0,.5,.5);return layer.getContext('2d')!.getImageData(0,0,layer.width,layer.height).data;};
 const day=sample(1),night=sample(0);let alphaMismatch=0,visible=0,dayEnergy=0,nightEnergy=0;
 for(let i=0;i<day.length;i+=4){if(day[i+3]!==night[i+3])alphaMismatch++;if(day[i+3]>128){visible++;dayEnergy+=day[i]+day[i+1]+day[i+2];nightEnergy+=night[i]+night[i+1]+night[i+2];}}
 renderer.dispose();return {alphaMismatch,visible,nightRatio:nightEnergy/dayEnergy};
}
