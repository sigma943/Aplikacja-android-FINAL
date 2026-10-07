import fs from 'node:fs/promises';
import {matchCoordinates} from './lib/stop-coordinate-matching.mjs';
import {unzipSync, strFromU8} from 'fflate';

async function download(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}
function csv(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift().map(key=>key.replace(/^\uFEFF/,''));
  return rows.filter(row=>row.length>1).map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]||''])));
}
const primaryDataset=await (await download('https://otwartedane.erzeszow.pl/v1/datasets/slug_full_view/?slug=rozklady-jazdy-gtfs')).json();
const mpkUrl=primaryDataset.resources.find(item=>item.extension==='ZIP'&&item.file)?.file;
if(!mpkUrl)throw new Error('Official MPK GTFS missing');
const pksPoints=(await (await download('http://einfo.zgpks.rzeszow.pl/api/stop-point')).json()).items;
const normalize=name=>String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9]/g,'');
const output='public/data/bus-routes';await fs.mkdir(output,{recursive:true});
for(const [provider,url] of [['pks','https://www.mpkrzeszow.pl/gtfs-pks/latest.zip'],['mpk_rzeszow',mpkUrl]]) {
  const archive=unzipSync(new Uint8Array(await (await download(url)).arrayBuffer()),{filter:entry=>/(^|\/)(trips|shapes|stops|stop_times)\.txt$/.test(entry.name)});
  const read=name=>csv(strFromU8(Object.entries(archive).find(([key])=>key.endsWith(name))[1]));
  const shapes=new Map();
  for(const row of read('shapes.txt')){const points=shapes.get(row.shape_id)||[];points.push([Number(row.shape_pt_sequence),Number(row.shape_pt_lat),Number(row.shape_pt_lon)]);shapes.set(row.shape_id,points);}
  const directory=`${output}/${provider}`;await fs.mkdir(directory,{recursive:true});
  for(const [id,points] of shapes){points.sort((a,b)=>a[0]-b[0]);await fs.writeFile(`${directory}/${id}.json`,JSON.stringify(points.map(([,lat,lon])=>[Number(lat.toFixed(6)),Number(lon.toFixed(6))])));}
  const tripShapes=Object.fromEntries(read('trips.txt').filter(row=>shapes.has(row.shape_id)).map(row=>[row.trip_id,row.shape_id]));
  const gtfsStops=read('stops.txt');
  const canonicalIds=new Map(gtfsStops.map(stop=>[stop.stop_id,stop.stop_id]));
  if(provider==='pks') {
    const names=new Map();for(const point of pksPoints){for(const name of new Set([point.name,point.stop_area_name].map(normalize))){const key=name+String(Number(point.stop_point_code));const list=names.get(key)||[];list.push(point);names.set(key,list);}}
    const snapshots=Object.fromEntries(pksPoints.map(point=>[String(point.stop_point_id),{n:point.stop_area_name||point.name,code:point.stop_point_code,areaId:String(point.stop_area_id),lat:point.location?.lat,lon:point.location?.lon}]));
    for(const stop of gtfsStops){
      const code=stop.stop_name.match(/\s(\d+)$/)?.[1];
      const key=normalize(stop.stop_name.replace(/\s\d+$/,''))+String(Number(code));
      const candidates=names.get(key)||[];
      if(candidates.length===1){const point=candidates[0];canonicalIds.set(stop.stop_id,String(point.stop_point_id));const snapshot=snapshots[point.stop_point_id];snapshot.lat??=Number(stop.stop_lat);snapshot.lon??=Number(stop.stop_lon);}
      else canonicalIds.delete(stop.stop_id);
    }
    const verified=matchCoordinates(pksPoints.map(point=>({id:point.stop_point_id,name:point.stop_area_name||point.name,code:point.stop_point_code,lat:Number(point.location?.lat),lon:Number(point.location?.lon)})),gtfsStops.map(stop=>({id:stop.stop_id,name:stop.stop_name,lat:Number(stop.stop_lat),lon:Number(stop.stop_lon)}))).stops;
    for(const [id,point] of Object.entries(verified)){Object.assign(snapshots[id],{lat:point.lat,lon:point.lon,coordinateSource:'gtfs',gtfsStopId:point.gtfsStopId});}
    await fs.writeFile('public/data/pks-stop-points.json',JSON.stringify({coordinateSource:url,source:'http://einfo.zgpks.rzeszow.pl/api/stop-point',updatedAt:new Date().toISOString(),stops:snapshots}));
  }
  const tripStops=new Map(), tripGtfsStops=new Map();
  for(const row of read('stop_times.txt')){const list=tripStops.get(row.trip_id)||[];list.push([Number(row.stop_sequence),canonicalIds.get(row.stop_id)]);tripStops.set(row.trip_id,list);const gtfs=tripGtfsStops.get(row.trip_id)||[];gtfs.push([Number(row.stop_sequence),row.stop_id]);tripGtfsStops.set(row.trip_id,gtfs);}
  const stopShapes={};for(const [trip,stops] of tripStops){stops.sort((a,b)=>a[0]-b[0]);if(stops.every(([,id])=>id)&&tripShapes[trip])stopShapes[stops.map(([,id])=>id).join('-')]=tripShapes[trip];}
  const patterns=[],patternIds=new Map(),tripPatterns={};
  for(const [trip,stops] of tripGtfsStops){stops.sort((a,b)=>a[0]-b[0]);const ids=stops.map(([,id])=>id),key=ids.join('-');if(!patternIds.has(key)){patternIds.set(key,patterns.length);patterns.push(ids);}tripPatterns[trip]=patternIds.get(key);}
  const stops=Object.fromEntries(gtfsStops.map(stop=>[stop.stop_id,{name:stop.stop_name,lat:Number(stop.stop_lat),lon:Number(stop.stop_lon)}]));
  await fs.writeFile(`${output}/${provider}.json`,JSON.stringify({source:url,updatedAt:new Date().toISOString(),tripShapes,stopShapes,patterns,tripPatterns,stops}));
  console.log(provider,':',shapes.size,'shapes,',Object.keys(tripShapes).length,'trips,',Object.keys(stopShapes).length,'stop patterns');
}
