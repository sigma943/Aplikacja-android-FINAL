/** Decorative disc rendering only. Position, phase and orientation stay astronomical. */
export const SUN_RADIUS=26,MOON_RADIUS=36;
export function moonTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const c=canvas.getContext('2d')!,r=96;
  const body=c.createRadialGradient(65,55,5,r,r,r);body.addColorStop(0,'#fff6df');body.addColorStop(.65,'#e8d7b3');body.addColorStop(1,'#adab9b');
  c.fillStyle=body;c.beginPath();c.arc(r,r,r,0,Math.PI*2);c.fill();c.save();c.clip();
  const rand=(i:number)=>{const x=Math.sin(i*127.1+31.7)*43758.5453;return x-Math.floor(x);};
  // Soft, irregular maria and small crater rims; generated once, not every frame.
  for(let i=0;i<18;i++){
    const x=30+rand(i+1)*132,y=24+rand(i+100)*144,size=8+rand(i+200)*21;
    const g=c.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,'#636e6a35');g.addColorStop(.65,'#6d746b23');g.addColorStop(1,'#67716e00');c.fillStyle=g;c.fillRect(x-size,y-size,size*2,size*2);
  }
  for(let i=0;i<110;i++){
    const x=rand(i+500)*192,y=rand(i+800)*192,size=1+rand(i+900)**3*8;
    c.strokeStyle='#fff9e52b';c.lineWidth=.7;c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.stroke();
    const g=c.createRadialGradient(x-.4,y-.3,0,x,y,size);g.addColorStop(0,'#68716a28');g.addColorStop(1,'#68716a00');c.fillStyle=g;c.fillRect(x-size,y-size,size*2,size*2);
  }
  c.restore();return canvas;
}
export function paintSun(c:CanvasRenderingContext2D,x:number,y:number,warm:number){
  c.save();c.globalCompositeOperation='screen';
  const halo=c.createRadialGradient(x,y,8,x,y,250);halo.addColorStop(0,'#fff8cfb0');halo.addColorStop(.14,'#ffe5a85c');halo.addColorStop(.42,`rgba(255,173,82,${.09+warm*.09})`);halo.addColorStop(1,'#ffaf5100');c.fillStyle=halo;c.fillRect(x-250,y-250,500,500);
  const bloom=c.createRadialGradient(x,y,15,x,y,75);bloom.addColorStop(0,'#fffdf1ff');bloom.addColorStop(.32,'#fff0c1a0');bloom.addColorStop(1,'#ffdb8a00');c.fillStyle=bloom;c.fillRect(x-75,y-75,150,150);
  c.globalCompositeOperation='source-over';
  const disc=c.createRadialGradient(x-5,y-7,1,x,y,SUN_RADIUS);disc.addColorStop(0,'#fffef5');disc.addColorStop(.7,'#fff5cf');disc.addColorStop(.88,'#ffedbd');disc.addColorStop(1,'#ffdf8a00');c.fillStyle=disc;c.beginPath();c.arc(x,y,SUN_RADIUS,0,Math.PI*2);c.fill();c.restore();
}
