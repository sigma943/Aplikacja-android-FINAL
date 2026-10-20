import type {DeviceData} from '@/components/firebase/types';
export type BanDuration='hour'|'day'|'week'|'month'|'year'|'custom';
export const BAN_DURATIONS:readonly [BanDuration,string][]=[['hour','Godzina'],['day','Dzień'],['week','Tydzień'],['month','Miesiąc'],['year','Rok'],['custom','Niestandardowy']];
export function banExpiryForDuration(duration:BanDuration,now=new Date()):string {
 if(duration==='custom')return '';
 const end=new Date(now);
 if(duration==='year'||duration==='month'){
  const day=end.getDate();end.setDate(1);
  if(duration==='year')end.setFullYear(end.getFullYear()+1);else end.setMonth(end.getMonth()+1);
  end.setDate(Math.min(day,new Date(end.getFullYear(),end.getMonth()+1,0).getDate()));
 }else end.setTime(end.getTime()+({hour:3600000,day:86400000,week:604800000}[duration]));
 return end.toISOString();
}
export function banDateTimeInput(iso:string):string {
 const d=new Date(iso);if(!iso||!Number.isFinite(d.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function banDetailsForSave({previous,reason,expiryDate,image,silent,actor,now=new Date()}:{previous?:DeviceData['banDetails'];reason:string;expiryDate:string;image:string;silent:boolean;actor:string;now?:Date}):NonNullable<DeviceData['banDetails']>{
 const expiry=expiryDate?new Date(expiryDate):null;
 if(expiry&&(!Number.isFinite(expiry.getTime())||expiry.getTime()<=now.getTime()))throw new Error('Wybierz datę i godzinę zakończenia w przyszłości.');
 return {...previous,reason:reason.trim()||'Naruszenie regulaminu',expiresAt:expiry?.toISOString()||'',gifUrl:silent?'':image,silent,bannedBy:previous?.bannedBy||actor,bannedAt:previous?.bannedAt||now.toISOString()};
}
