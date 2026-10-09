import type {DeviceRole} from './rbac';
export type StatisticsAccess=Record<string,boolean>;
export function readStatisticsAccess(value:unknown):StatisticsAccess {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([key,flag])=>key.length>0&&key.length<=200&&typeof flag==='boolean'));
}
export function statisticsAccessKey(device:{id:string;installationId?:string|null}) {
  return device.installationId?.trim()||device.id;
}
export function statisticsPermission(device:{id:string;role:DeviceRole;installationId?:string|null},access:StatisticsAccess,ready=true) {
  return device.role==='owner'||(device.role==='admin'&&ready&&access[statisticsAccessKey(device)]!==false);
}
export function statisticsAccessChange(device:{id:string;installationId?:string|null},role:DeviceRole,requested:boolean|undefined,access:StatisticsAccess){
  if(role==='user')return null;
  const next=role==='owner'||requested!==false,key=statisticsAccessKey(device);
  return next===(access[key]!==false)?null:{key,enabled:next};
}
