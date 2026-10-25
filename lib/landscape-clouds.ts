import {smoothstep} from './landscape-astronomy';
/** Static soft openings in the drifting tile; shared by colour and light occlusion. */
export function cloudDensity(x:number,y:number){
 const pattern=.5+.27*Math.sin(x*8+Math.sin(y*17))+.23*Math.sin(x*19-y*11);
 return .96*smoothstep(.16,.48,pattern);
}
