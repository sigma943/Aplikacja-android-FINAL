import fs from 'node:fs/promises';
const base='http://einfo.zgpks.rzeszow.pl/api/';
async function json(path) {
  for(let attempt=0;attempt<3;attempt++) {
    try { const r=await fetch(base+path,{signal:AbortSignal.timeout(20000)}); if(!r.ok) throw new Error(String(r.status)); const d=await r.json(); if(d.success===false || !Array.isArray(d.items)) throw new Error('Invalid PKS response'); return d; }
    catch(e) { if(attempt===2) throw e; }
  }
}
const points=(await json('stop-point')).items;
const areas=[...new Set(points.map(p=>p.stop_area_id))];
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Warsaw'});
const byArea={}; let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<areas.length){const area=areas[next++]; const d=await json('stop-point-timetable/'+area+'?day='+day); const codes={}; for(const item of d.items)for(const journey of item.journeys||[]){const code=String(journey.stop_point_code); (codes[code]??=new Set()).add(String(item.line_name));} byArea[area]=Object.fromEntries(Object.entries(codes).map(([code,lines])=>[code,[...lines].sort()])); if(next%100===0) console.log(next+'/'+areas.length);}}));
const lines=Object.fromEntries(points.map(p=>[String(p.stop_point_id),byArea[p.stop_area_id]?.[p.stop_point_code]||[]]));
await fs.writeFile('public/data/pks-stop-lines.json',JSON.stringify({source:base,updatedAt:new Date().toISOString(),lines}));
console.log('Saved '+Object.keys(lines).length+' PKS stops. Baryczka 69:',lines['2083']);
