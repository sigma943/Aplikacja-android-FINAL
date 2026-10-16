import type {Vehicle} from './transport/vehicle';

/** Compare every feed field, including nested schedules, without serializing the fleet. */
export function equalFeedValue(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equalFeedValue(left[key],right[key]));
}
export function reconcileVehicles(previous:Vehicle[],incoming:Vehicle[]):Vehicle[] {
  const byId=new Map(previous.map(vehicle=>[`${vehicle.provider||'pks'}:${vehicle.id}`,vehicle]));
  let unchanged=previous.length===incoming.length;
  const next=incoming.map((vehicle,index)=>{
    const old=byId.get(`${vehicle.provider||'pks'}:${vehicle.id}`);
    const stable=old&&equalFeedValue(old,vehicle)?old:vehicle;
    if(stable!==previous[index])unchanged=false;
    return stable;
  });
  return unchanged?previous:next;
}
