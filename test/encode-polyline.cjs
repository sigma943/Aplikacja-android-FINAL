module.exports = function encode(points) {
  let lat=0,lon=0,result='';
  const delta=value=>{let n=value<0?~(value<<1):value<<1,out='';while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>>=5;}return out+String.fromCharCode(n+63);};
  for(const point of points){const a=Math.round(point[0]*1e6),b=Math.round(point[1]*1e6);result+=delta(a-lat)+delta(b-lon);lat=a;lon=b;}
  return result;
};
