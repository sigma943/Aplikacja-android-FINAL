import reviewed from './pks-terminal-courses.json';

type Course={journey_id?:string|number;time?:string;legends?:string[];stop_point_code?:string|number};
const courses=new Map(reviewed.courses.map(course=>[course.id,course]));
const normalized=(value:unknown)=>String(value??'').trim().toLocaleLowerCase('pl').replace(/\s+/g,' ');
const legends=(value:string[]|undefined)=>[...(value||[])].sort().join('|');

/** API codes are technical groups, not necessarily physical bay numbers. */
export function pksPhysicalPlatform(areaId:string|undefined,line:string,destination:string,journey:Course){
 const original=String(journey.stop_point_code??'').trim();
 if(areaId!==reviewed.areaId)return original;
 const course=courses.get(String(journey.journey_id));
 if(!course||original!==course.apiCode||String(line)!==course.line||journey.time!==course.time
  ||normalized(destination)!==normalized(course.destination)||legends(journey.legends)!==legends(course.legends))return original;
 return course.platform;
}

export function pksTerminalLines(areaId:string|undefined,code:string|undefined):string[]|null {
 if(areaId!==reviewed.areaId)return null;
 // Only the disputed bays need an override. Other bays retain their feed lines.
 if(!['1','4','7','10'].includes(String(code)))return null;
 return [...new Set(reviewed.courses.filter(c=>c.platform===code).map(c=>c.line))].sort((a,b)=>a.localeCompare(b,'pl',{numeric:true}));
}
