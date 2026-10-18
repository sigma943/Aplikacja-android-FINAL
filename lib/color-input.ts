export type RGB=[number,number,number];
export function parseHexColor(value:string):string|null{
  const hex=value.trim().replace(/^#/,'');
  if(/^[\da-f]{3}$/i.test(hex))return '#'+hex.split('').map(c=>c+c).join('').toLowerCase();
  return /^[\da-f]{6}$/i.test(hex)?'#'+hex.toLowerCase():null;
}
export function colorRgb(hex:string):RGB{return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as RGB;}
export function rgbHex(rgb:RGB):string{return '#'+rgb.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');}
export function parseRgbColor(value:string):string|null{
  const text=value.trim().replace(/^rgb\((.*)\)$/i,'$1');
  const parts=text.includes(',')?text.split(','):text.split(/\s+/);
  if(parts.length!==3||parts.some(p=>!/^\d{1,3}$/.test(p.trim())||Number(p)>255))return null;
  return rgbHex(parts.map(Number) as RGB);
}
export function hexHsv(hex:string):[number,number,number]{
  const [r,g,b]=colorRgb(hex).map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  const h=!d?0:max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return [(h*60+360)%360,max?d/max:0,max];
}
export function hsvHex(h:number,s:number,v:number):string{
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgbHex(rgb.map(n=>(n+m)*255) as RGB);
}
