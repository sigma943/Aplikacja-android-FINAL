import type {Stop} from '@/Panel/src/types';
export function stopIdentityIds(stop:Pick<Stop,'id'|'providerStopIds'>):string[]{
  const ids=new Set([stop.id]);
  for(const provider of ['pks','mpk_rzeszow','marcel'])for(const raw of String(stop.providerStopIds?.[provider]||'').split(',')){
    const id=raw.trim();if(id)ids.add(provider==='pks'?id:provider+':'+id);
  }
  return [...ids];
}
export function toggleStopFavoriteIds(current:string[],canonicalId:string,aliases:string[]=[]){
  const group=new Set([canonicalId,...aliases]);
  return current.some(id=>group.has(id))?current.filter(id=>!group.has(id)):[...current,canonicalId];
}
