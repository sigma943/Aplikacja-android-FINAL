import type {LandscapeLightingState} from './landscape-lighting';
import {smoothstep} from './landscape-astronomy';
const selector='.transit-surface,.transit-card,.pks-personal-card,.connections-card,.pks-options-sheet,.pks-map-search-panel,.pks-navigation,[data-landscape-chrome],.map-stop-handle';
/** Layout reads are batched and throttled by the owner loop (4Hz), never React.
 * Background images stay below text, inherit native clipping and rounded corners. */
export class LandscapeGlassLighting {
  private touched=new Set<HTMLElement>();
  update(light:LandscapeLightingState,sun:{x:number;y:number},stage:DOMRect,enabled:boolean,transmission=1){
    const px=stage.left+sun.x*stage.width,py=stage.top+sun.y*stage.height;
    const cards=Array.from(document.querySelectorAll<HTMLElement>(selector)).map(element=>{const window=element.querySelector<HTMLCanvasElement>('[data-landscape-window]');return {element,rect:element.getBoundingClientRect(),window,windowRect:window?.getBoundingClientRect()};});
    const live=new Set(cards.map(c=>c.element));
    for(const element of this.touched)if(!live.has(element)){this.clear(element);this.touched.delete(element);}
    const warm=light.sky.twilight;
    for(const {element,rect,window,windowRect} of cards){
      let localX=px-rect.left,localY=py-rect.top;
      if(window&&windowRect?.width&&windowRect.height){
        // Sheet/navigation artwork copies a cropped scene, rather than the main
        // canvas position. Use the SAME crop as DynamicLandscape.paintWindows.
        const sw=Math.min(stage.width,stage.height*windowRect.width/windowRect.height),sh=sw*windowRect.height/windowRect.width;
        const kind=window.dataset.landscapeWindow,top=kind==='filter'?.07:kind==='navigation'?.20:.34;
        localX=(sun.x*stage.width-(stage.width-sw)/2)/sw*windowRect.width+windowRect.left-rect.left;
        localY=(sun.y*stage.height-Math.min(stage.height-sh,stage.height*top))/sh*windowRect.height+windowRect.top-rect.top;
      }
      const cardSunX=rect.left+localX,cardSunY=rect.top+localY;
      const visible=rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
      const dx=Math.max(rect.left-cardSunX,0,cardSunX-rect.right),dy=Math.max(rect.top-cardSunY,0,cardSunY-rect.bottom);
      const proximity=1-smoothstep(0,Math.min(stage.width,stage.height)*.55,Math.hypot(dx,dy));
      const alpha=enabled&&visible?Math.min(.10,light.sun.intensity*(.025+warm*.085)*proximity*Math.max(0,Math.min(1,transmission))):0;
      const rgb=light.sun.color.map(v=>Math.round(v*255)).join(',');
      element.style.setProperty('--landscape-local-light',`radial-gradient(ellipse 240px 180px at ${localX.toFixed(1)}px ${localY.toFixed(1)}px,rgba(${rgb},${alpha.toFixed(4)}),transparent 80%)`);
      this.touched.add(element);
    }
  }
  private clear(element:HTMLElement){element.style.removeProperty('--landscape-local-light');}
  dispose(){for(const element of this.touched)this.clear(element);this.touched.clear();}
}
