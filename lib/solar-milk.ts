/** Shared atmospheric tint and solar glow for glass panels and first paint. */
export function solarMilkMaterial(degrees:number,day=degrees>-2){
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const warmth=1-smooth(0,18,degrees),cool=day?[178,220,240]:[17,30,57],warm=day?[244,199,174]:[55,37,73];
 const surface=cool.map((v,i)=>Math.round(v+(warm[i]-v)*warmth)).join(',');
 const glow=smooth(-7,-.5,degrees)*(1-smooth(4,20,degrees));
 return {surface,background:`rgb(${surface})`,text:day?'rgb(11,27,38)':'rgb(244,248,252)',
  glow:`radial-gradient(ellipse 110% 85% at 12% -12%,rgba(255,232,192,${(glow*.46).toFixed(4)}),transparent 64%),radial-gradient(ellipse 85% 70% at 90% -8%,rgba(240,165,168,${(glow*.23).toFixed(4)}),transparent 72%),linear-gradient(165deg,rgba(255,190,131,${(glow*.09).toFixed(4)}),transparent 48%)`};
}
/** Compact SunCalc solar-position equations for pre-React first paint only.
 * Same fixed Rzeszow coordinates, absolute UTC instant, no guessed clock hours.
 * Panels retain Astronomy Engine; this avoids embedding an ephemeris in <head>.
 */
export function startupSunAltitude(ms:number){
 const rad=Math.PI/180,d=ms/86400000-.5+2440588-2451545;
 const m=rad*(357.5291+.98560028*d),l=m+rad*(1.9148*Math.sin(m)+.02*Math.sin(2*m)+.0003*Math.sin(3*m)+102.9372)+Math.PI;
 const e=rad*23.4397,dec=Math.asin(Math.sin(e)*Math.sin(l)),ra=Math.atan2(Math.sin(l)*Math.cos(e),Math.cos(l));
 const h=rad*(280.16+360.9856235*d+21.9991)-ra,lat=50.0412*rad;
 return Math.asin(Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(h))/rad;
}
