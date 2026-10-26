import {smoothstep} from './landscape-astronomy';
/** Gentle thinning preserves the original cloud silhouettes, without cut-out holes. */
export function cloudDensity(x:number,y:number){
 const pattern=.5+.27*Math.sin(x*8+Math.sin(y*17))+.23*Math.sin(x*19-y*11);
 return .66+.18*smoothstep(.10,.90,pattern);
}
