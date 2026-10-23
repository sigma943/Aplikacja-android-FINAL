import {HORIZON_DEFAULT_LOCATION} from './horizon-sky';
const KEY='mks_horizon_location_v1';
export function readHorizonLocation(){
  try{const v=JSON.parse(localStorage.getItem(KEY)||'null');
    if(v&&Number.isFinite(v.lat)&&Math.abs(v.lat)<=90&&Number.isFinite(v.lon)&&Math.abs(v.lon)<=180&&Number.isFinite(v.at)&&Date.now()-v.at<7*86400_000&&v.at<=Date.now()+60_000)return {...v,known:true};
  }catch{/* Default works offline and without permission. */}
  return {...HORIZON_DEFAULT_LOCATION,at:0,known:false};
}
export function rememberHorizonLocation(lat:number,lon:number){
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return;
  // Approximate location is sufficient; do not persist a precise GPS trail.
  try{localStorage.setItem(KEY,JSON.stringify({lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100,at:Date.now()}));}catch{/* Session can use the default if storage is blocked. */}
  window.dispatchEvent(new Event('pks-horizon-location'));
}
