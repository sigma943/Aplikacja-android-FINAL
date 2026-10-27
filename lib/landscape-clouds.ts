import {smoothstep} from './landscape-astronomy';
/** Gentle thinning preserves the original cloud silhouettes, without cut-out holes. */
export function cloudDensity(x:number,y:number){
 const pattern=.5+.27*Math.sin(x*8+Math.sin(y*17))+.23*Math.sin(x*19-y*11);
 return .66+.18*smoothstep(.10,.90,pattern);
}

/** Same cloud asset and alpha by day/night; preserve visible night texture. */
export function cloudRelightColor(day:number,warm:number,moon:number){
 const night=[100+moon*40,121+moon*35,157+moon*28],sun=[245,250,255],sunset=[255,180,126];
 return night.map((v,i)=>{const lit=v+(sun[i]-v)*day;return lit+(sunset[i]-lit)*warm*.65;});
}
