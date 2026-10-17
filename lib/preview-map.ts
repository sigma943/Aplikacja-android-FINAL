// Yard between the two rows of PKS platforms (bundled pks-stop-points.json).
export const PREVIEW_STATION={lat:50.04224,lon:22.00345,zoom:18};
export const PREVIEW_MAP_HEIGHT=416;
export const PREVIEW_BUS_ANCHOR={x:282,y:193};
export function previewMapTiles(){
 const size=256,world=size*2**PREVIEW_STATION.zoom;
 const sine=Math.sin(PREVIEW_STATION.lat*Math.PI/180);
 const left=(PREVIEW_STATION.lon+180)/360*world-PREVIEW_BUS_ANCHOR.x;
 const top=(.5-Math.log((1+sine)/(1-sine))/(4*Math.PI))*world-PREVIEW_BUS_ANCHOR.y;
 const tiles=[];
 for(let y=Math.floor(top/size);y<=Math.floor((top+PREVIEW_MAP_HEIGHT-1)/size);y++)for(let x=Math.floor(left/size);x<=Math.floor((left+392)/size);x++)tiles.push({id:`${x}:${y}`,left:x*size-left,top:y*size-top,src:`https://mt1.google.com/vt?lyrs=m&hl=pl&gl=PL&x=${x}&y=${y}&z=${PREVIEW_STATION.zoom}`});
 return tiles;
}
