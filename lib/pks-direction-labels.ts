type Row=Record<string,any>;
const KEY='pks-live:pks-direction-labels:v1';
let known:Map<string,string>|null=null;
function labels(){
 if(!known){known=new Map();try{
  const data=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(Array.isArray(data))for(const entry of data.slice(-1000))if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string')known.set(entry[0],entry[1]);
 }catch{/* A label cache is optional. */}}
 return known;
}
const departure=(row:Row)=>JSON.stringify([String(row.line_name),row.timetable_time]);
const identity=(row:Row)=>JSON.stringify([String(row.line_name),String(row.trip_id??row.journey_id),String(row.route_description),String(row.timetable_time).slice(11,19)]);
/** Keep a verified old display label for the same course. New or ambiguous
 * courses retain their published GTFS destination; never cut an arbitrary name. */
export function mergePksDirectionLabels(scheduled:Row[],legacy:Row[]):Row[]{
 const counts=new Map<string,number>(),old=new Map<string,Row[]>(),cache=labels();let changed=false;
 for(const row of scheduled){const key=departure(row);counts.set(key,(counts.get(key)||0)+1);}
 for(const row of legacy){const key=departure(row);old.set(key,[...(old.get(key)||[]),row]);}
 const rows=scheduled.map(row=>{
  const matches=old.get(departure(row))||[],unique=counts.get(departure(row))===1&&matches.length===1?matches[0]:null;
  const label=typeof unique?.route_description==='string'?unique.route_description.trim():'';
  const key=identity(row);
  if(label&&cache.get(key)!==label){cache.delete(key);cache.set(key,label);changed=true;}
  const route_description=label||cache.get(key)||row.route_description;
  return unique?{...unique,...row,route_description,journey_id:unique.journey_id??row.journey_id,deviation:unique.deviation??null}:{...row,route_description};
 });
 if(changed){while(cache.size>1000)cache.delete(cache.keys().next().value!);try{localStorage.setItem(KEY,JSON.stringify([...cache]));}catch{/* Keep the in-memory names when storage is full. */}}
 return rows;
}
