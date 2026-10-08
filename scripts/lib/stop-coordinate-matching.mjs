const aliases={szk:'szkola',szkole:'szkola',kosc:'kosciol',kos:'kosciol',skrz:'skrzyzowanie',skr:'skrzyzowanie',przych:'przychodnia',cment:'cmentarz',cm:'cmentarz',osr:'osrodek',dw:'dworzec',szp:'szpital',mochn:'mochnackiego'};
export const stopCode=value=>String(value??'').trim().toLowerCase().replace(/^0+(?=\d)/,'');
export function coordinateName(value,separator=''){
  return String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l')
    .replace(/\bnz\b/g,'').replace(/^rzeszow[\s,]+/,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(t=>aliases[t]||t).join(separator);
}
export function splitPlatformName(name){
  const clean=String(name).replace(/\s+n[żz]\.?$/i,'').trim(),m=/\s(\d+[a-z]?)$/i.exec(clean);
  return {name:m?clean.slice(0,m.index):clean,code:m?stopCode(m[1]):''};
}
export function meters(a,b){const rad=Math.PI/180;const dLat=(a.lat-b.lat)*rad,dLon=(a.lon-b.lon)*rad;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2)));}
export function validPoint(point){return Number.isFinite(point.lat)&&Number.isFinite(point.lon)&&point.lat>=48&&point.lat<=56&&point.lon>=14&&point.lon<=25;}
/** Exact locality/name + platform code; ambiguous matches are never snapped to a road. */
export function matchCoordinates(apiStops,gtfsStops){
  const groups=new Map();
  for(const stop of gtfsStops){const platform=splitPlatformName(stop.name),key=coordinateName(platform.name)+'|'+stopCode(stop.code||platform.code);if(!platform.code&&!stop.code)continue;if(!validPoint(stop))continue;const group=groups.get(key)||[];group.push(stop);groups.set(key,group);}
  // GTFS sometimes uses only the locality (e.g. Boguchwała 93), whereas the API
  // adds a landmark. The code must still be unique on BOTH sides and within 250 m.
  const localGroups=new Map();
  for(const stop of apiStops){const platform=splitPlatformName(stop.name),key=coordinateName(platform.name.split(',')[0])+'|'+stopCode(stop.code||platform.code);const group=localGroups.get(key)||[];group.push(stop);localGroups.set(key,group);}
  const gtfsByCode=new Map();
  for(const stop of gtfsStops){const platform=splitPlatformName(stop.name),code=stopCode(stop.code||platform.code);if(!code||!validPoint(stop))continue;const group=gtfsByCode.get(code)||[];group.push({stop,name:coordinateName(platform.name,' ')});gtfsByCode.set(code,group);}
  const result={},rejected=[];
  for(const stop of apiStops){const platform=splitPlatformName(stop.name),key=coordinateName(platform.name)+'|'+stopCode(stop.code||platform.code);let candidates=groups.get(key)||[];
    if(!candidates.length&&stop.name.includes(',')&&validPoint(stop)){
      const localKey=coordinateName(platform.name.split(',')[0])+'|'+stopCode(stop.code||platform.code);
      const local=groups.get(localKey)||[];
      if(local.length===1&&localGroups.get(localKey)?.length===1&&meters(stop,local[0])<=250)candidates=local;
    }
    // The reverse also occurs: EINFO says only SOŁONKA 02 while GTFS names
    // Sołonka pętla 02. Require a whole-word locality prefix and a unique code
    // on both sides; rural API coordinates can be more than 1 km approximate.
    if(!candidates.length&&!stop.name.includes(',')&&validPoint(stop)){
      const code=stopCode(stop.code||platform.code),name=coordinateName(platform.name,' ');
      const local=(gtfsByCode.get(code)||[]).filter(candidate=>candidate.name.startsWith(name+' '));
      if(local.length===1&&localGroups.get(key)?.length===1&&meters(stop,local[0].stop)<=2000)candidates=[local[0].stop];
    }
    if(candidates.length!==1){rejected.push({id:stop.id,name:stop.name,reason:candidates.length?'ambiguous':'unmatched'});continue;}
    const candidate=candidates[0];if(validPoint(stop)&&meters(stop,candidate)>2000){rejected.push({id:stop.id,name:stop.name,reason:'distant'});continue;}
    result[String(stop.id)]={name:stop.name,lat:candidate.lat,lon:candidate.lon,gtfsStopId:String(candidate.id)};
  }
  return {stops:result,rejected};
}
