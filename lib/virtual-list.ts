export function virtualListWindow(keys:string[],heights:ReadonlyMap<string,number>,top:number,viewport:number,estimate=128,overscan=450){
  const offsets=[0];keys.forEach(key=>offsets.push(offsets[offsets.length-1]+(heights.get(key)??estimate)+12));
  let start=0,end=keys.length;
  while(start<keys.length&&offsets[start+1]<Math.max(0,top-overscan))start++;
  end=start;while(end<keys.length&&offsets[end]<top+viewport+overscan)end++;
  return {start,end,offsets,total:Math.max(0,offsets[keys.length]-12)};
}
