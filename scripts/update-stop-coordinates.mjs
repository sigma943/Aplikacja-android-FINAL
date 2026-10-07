import fs from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {matchCoordinates,meters} from './lib/stop-coordinate-matching.mjs';
const source='https://www.mpkrzeszow.pl/gtfs-pks/latest.zip';
async function download(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return r;}
function csv(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const header=rows.shift().map(s=>s.replace(/^\uFEFF/,''));return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]||''])));}
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const data=arg('--points')?JSON.parse(await fs.readFile(arg('--points'),'utf8')):await (await download('http://einfo.zgpks.rzeszow.pl/api/stop-point')).json();
const archive=unzipSync(arg('--gtfs')?new Uint8Array(await fs.readFile(arg('--gtfs'))):new Uint8Array(await (await download(source)).arrayBuffer()),{filter:e=>/(^|\/)stops\.txt$/.test(e.name)});
const stops=csv(strFromU8(Object.values(archive)[0])).map(s=>({id:s.stop_id,name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon)}));
const api=data.items.map(s=>({id:s.stop_point_id,name:s.stop_area_name||s.name,code:s.stop_point_code,lat:Number(s.location?.lat),lon:Number(s.location?.lon)}));
const matched=matchCoordinates(api,stops);if(Object.keys(matched.stops).length<500)throw Error('Unexpectedly incomplete coordinate match; existing catalog retained.');
const snapshot=Object.fromEntries(data.items.map(s=>{const correction=matched.stops[s.stop_point_id];return [String(s.stop_point_id),{n:s.stop_area_name||s.name,code:s.stop_point_code,areaId:String(s.stop_area_id),lat:correction?.lat??s.location?.lat,lon:correction?.lon??s.location?.lon,...(correction?{coordinateSource:'gtfs',gtfsStopId:correction.gtfsStopId}:{})}];}));
await fs.writeFile('public/data/pks-stop-points.json',JSON.stringify({source:'http://einfo.zgpks.rzeszow.pl/api/stop-point',coordinateSource:source,updatedAt:new Date().toISOString(),stops:snapshot}));
console.log(JSON.stringify({total:api.length,verified:Object.keys(matched.stops).length,changedOver10m:api.filter(s=>matched.stops[s.id]&&meters(s,matched.stops[s.id])>10).length,unmatched:matched.rejected.length}));
for(const id of ['11028','11029'])console.log(id,snapshot[id]);
