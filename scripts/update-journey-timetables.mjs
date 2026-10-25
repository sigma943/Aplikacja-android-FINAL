// Complete timetables for the Connections tab; no changes to map/stop data.
import fs from 'node:fs/promises';
import {unzipSync,strFromU8,gzipSync,strToU8} from 'fflate';
function csv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}
 if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}const header=rows.shift().map(s=>s.replace(/^\uFEFF/,''));
 return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||''])));
}
const seconds=s=>{const p=String(s).split(':').map(Number);return p.length===3&&p.every(Number.isFinite)?p[0]*3600+p[1]*60+p[2]:NaN;};
const output='public/data/journeys';await fs.mkdir(output,{recursive:true});
const index={version:1,updatedAt:new Date().toISOString(),feeds:{}};
for(const [provider,asset] of [['pks','pks'],['mpk','mpk_rzeszow']]){
 const {source}=JSON.parse(await fs.readFile(`public/data/bus-routes/${asset}.json`,'utf8'));
 const response=await fetch(source,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`GTFS ${provider}: ${response.status}`);
 const archive=unzipSync(new Uint8Array(await response.arrayBuffer()),{filter:e=>/(^|\/)(stops|trips|stop_times|routes|calendar|calendar_dates)\.txt$/.test(e.name)});
 const read=name=>{const entry=Object.entries(archive).find(([key])=>key.endsWith('/'+name)||key===name);return entry?csv(strFromU8(entry[1])):[];};
 const stops=Object.fromEntries(read('stops.txt').map(s=>[s.stop_id,{name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon)}]));
 const routes=Object.fromEntries(read('routes.txt').filter(r=>['3','700','704'].includes(r.route_type)).map(r=>[r.route_id,r.route_short_name]));
 const calendars=Object.fromEntries(read('calendar.txt').map(c=>[c.service_id,{start:c.start_date,end:c.end_date,days:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>c[d]).join('')}]));
 const exceptions={};for(const c of read('calendar_dates.txt'))(exceptions[c.date]??={})[c.service_id]=Number(c.exception_type);
 const times=new Map();for(const s of read('stop_times.txt')){const a=seconds(s.arrival_time||s.departure_time),d=seconds(s.departure_time||s.arrival_time);if(!Number.isFinite(a)||!Number.isFinite(d))continue;const list=times.get(s.trip_id)||[];list.push([Number(s.stop_sequence),s.stop_id,a,d,Number(s.pickup_type||0),Number(s.drop_off_type||0)]);times.set(s.trip_id,list);}
 const patterns=[],patternIds=new Map(),trips=[];
 for(const t of read('trips.txt')){const list=times.get(t.trip_id);if(!routes[t.route_id]||!list||list.length<2)continue;list.sort((a,b)=>a[0]-b[0]);const start=list[0][3],pattern=list.map(([sequence,id,a,d,pick,drop])=>[id,a-start,d-start,pick,drop,sequence]),key=JSON.stringify(pattern);if(!patternIds.has(key)){patternIds.set(key,patterns.length);patterns.push(pattern);}trips.push([t.trip_id,routes[t.route_id],t.service_id,start,patternIds.get(key)]);}
 const dates=[...Object.values(calendars).flatMap(c=>[c.start,c.end]),...Object.keys(exceptions)].sort();
 const data={version:1,provider,source,updatedAt:index.updatedAt,validFrom:dates[0],validUntil:dates.at(-1),stops,calendars,exceptions,patterns,trips};
 const bytes=gzipSync(strToU8(JSON.stringify(data)),{level:9});await fs.writeFile(`${output}/${provider}.json.gz`,bytes);
 index.feeds[provider]={source,validFrom:data.validFrom,validUntil:data.validUntil,trips:trips.length,stops:Object.keys(stops).length};
 console.log(provider,trips.length,'complete trips,',patterns.length,'patterns,',bytes.length,'bytes');
}
await fs.writeFile(`${output}/index.json`,JSON.stringify(index,null,2)+'\n');
