import type {MaintenanceChange} from '@/app/admin/types';
export function maintenanceChange(id:string,data:Record<string,unknown>):MaintenanceChange {
  const timestamp=data.createdAt as {toDate?:()=>Date}|undefined;
  return {id,action:String(data.action||''),endpointId:String(data.endpointId||''),actorId:String(data.actorId||''),summary:String(data.summary||''),createdAtMs:timestamp?.toDate?.().getTime()||0};
}
export function mergeMaintenanceHistory(recent:MaintenanceChange[],older:MaintenanceChange[]){
  const unique=new Map<string,MaintenanceChange>();[...older,...recent].forEach(row=>unique.set(row.id,row));
  return [...unique.values()].sort((a,b)=>b.createdAtMs-a.createdAtMs||a.id.localeCompare(b.id));
}
export function exportMaintenanceHistory(rows:MaintenanceChange[]){
  const url=URL.createObjectURL(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),scope:'loaded-entries',entries:rows},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='historia-konserwacji.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
