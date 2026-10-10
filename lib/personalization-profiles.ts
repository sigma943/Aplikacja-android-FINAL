import {INTERFACE_APPEARANCE_KEY,normalizeInterfaceAppearance,type InterfaceAppearance} from './interface-appearance';
import {panelGlowStrength} from './panel-glow';
export const PROFILES_KEY='mks_visual_profiles_v1';
export const SCHEDULE_KEY='mks_visual_schedule_v1';
export type VisualProfile={id:string;name:string;updatedAt:number;appearance:InterfaceAppearance;theme:string;accent:string;glass:boolean;glow:boolean;glowStrength:number};
export type VisualSchedule={enabled:boolean;dayAt:string;nightAt:string;dayProfile:string;nightProfile:string};
export const DEFAULT_SCHEDULE:VisualSchedule={enabled:false,dayAt:'07:00',nightAt:'20:00',dayProfile:'',nightProfile:''};
export function normalizeProfiles(input:unknown):VisualProfile[]{
 if(!Array.isArray(input))return [];
 const ids=new Set<string>();
 return input.filter((p)=>p&&typeof p.id==='string'&&typeof p.name==='string').slice(0,8).flatMap(p=>{
  const id=p.id.trim().slice(0,80);if(!id||ids.has(id)||!p.name.trim())return [];ids.add(id);
  return [{id,name:p.name.trim().slice(0,40),updatedAt:Number.isFinite(p.updatedAt)?p.updatedAt:0,appearance:normalizeInterfaceAppearance(p.appearance),theme:['light','light-warm','dark','dark-oled','dark-aurora','system'].includes(p.theme)?p.theme:'dark-oled',accent:/^#[\da-f]{6}$/i.test(p.accent)?p.accent.toLowerCase():'#00a3a2',glass:typeof p.glass==='boolean'?p.glass:true,glow:p.glow===true,glowStrength:panelGlowStrength(p.glowStrength)}];
 });
}
export function normalizeSchedule(input:unknown):VisualSchedule{
 const v=input&&typeof input==='object'?input as Partial<VisualSchedule>:{};
 const time=(t:unknown,fallback:string)=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?t:fallback;
 return {enabled:v.enabled===true,dayAt:time(v.dayAt,'07:00'),nightAt:time(v.nightAt,'20:00'),dayProfile:typeof v.dayProfile==='string'?v.dayProfile:'',nightProfile:typeof v.nightProfile==='string'?v.nightProfile:''};
}
export function readProfiles():VisualProfile[]{try{return normalizeProfiles(JSON.parse(localStorage.getItem(PROFILES_KEY)||'[]'));}catch{return [];}}
export function readSchedule():VisualSchedule{try{return normalizeSchedule(JSON.parse(localStorage.getItem(SCHEDULE_KEY)||'{}'));}catch{return {...DEFAULT_SCHEDULE};}}
export function activateProfile(profile:VisualProfile,notify=true){
 const values:Record<string,string>={[INTERFACE_APPEARANCE_KEY]:JSON.stringify(profile.appearance),mks_app_theme:profile.theme,mks_theme:profile.accent,mks_transparent:String(profile.glass),mks_panel_glow:String(profile.glow),mks_panel_glow_strength:String(profile.glowStrength)};
 for(const [key,value]of Object.entries(values))localStorage.setItem(key,value);
 if(notify){window.dispatchEvent(new Event('pks-profile-applied'));window.dispatchEvent(new Event('pks-interface-appearance'));}
}
export function scheduleSlot(minutes:number,dayAt:string,nightAt:string):'day'|'night'|null{
 if(dayAt===nightAt)return null;
 const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
 return (minutes-minute(dayAt)+1440)%1440<(minutes-minute(nightAt)+1440)%1440?'day':'night';
}
export function applyScheduledProfile(now=new Date()):boolean{
 const schedule=readSchedule();if(!schedule.enabled)return false;
 const minutes=now.getHours()*60+now.getMinutes(),slot=scheduleSlot(minutes,schedule.dayAt,schedule.nightAt);if(!slot)return false;
 const profiles=readProfiles();if(!profiles.some(p=>p.id===schedule.dayProfile)||!profiles.some(p=>p.id===schedule.nightProfile))return false;
 const profile=profiles.find(p=>p.id===(slot==='day'?schedule.dayProfile:schedule.nightProfile));if(!profile)return false;
 const boundary=slot==='day'?schedule.dayAt:schedule.nightAt;
 const date=new Date(now);if(minutes<Number(boundary.slice(0,2))*60+Number(boundary.slice(3)))date.setDate(date.getDate()-1);
 const signature=`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}:${slot}:${profile.id}:${profile.updatedAt}:${schedule.dayAt}:${schedule.nightAt}`;
 if(localStorage.getItem('mks_visual_schedule_applied')===signature)return false;
 localStorage.setItem('mks_visual_schedule_applied',signature);activateProfile(profile,false);return true;
}
