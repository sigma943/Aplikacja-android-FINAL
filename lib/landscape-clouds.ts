import {smoothstep} from './landscape-astronomy';
/** Open up the dense horizon bank while keeping the scattered clouds higher up. */
export function cloudCoverage(alpha:number,x:number,y:number){
 if(alpha===0)return 0;
 const pattern=.5+.27*Math.sin(x*8+Math.sin(y*17))+.23*Math.sin(x*19-y*11);
 const density=smoothstep(.10,.90,pattern);
 const bank=smoothstep(.27,.37,y);
 const clearing=bank*(1-density);
 const edge=.06+.13*bank+.26*clearing;
 const core=smoothstep(edge,edge+.36,alpha);
 return alpha*core*(.67+.17*density)*(1-.16*bank-.60*clearing);
}

/** Same cloud asset and alpha by day/night; preserve visible night texture. */
export function cloudRelightColor(day:number,warm:number,moon:number){
 const night=[100+moon*40,121+moon*35,157+moon*28],sun=[245,250,255],sunset=[255,180,126];
 return night.map((v,i)=>{const lit=v+(sun[i]-v)*day;return lit+(sunset[i]-lit)*warm*.65;});
}
