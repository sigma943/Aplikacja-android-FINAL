import {interfaceGoogleFont,googleFontUrl,parseGoogleFontLink} from './interface-fonts';
import {INTERFACE_APPEARANCE_KEY} from './interface-appearance';
import {PROFILES_KEY,SCHEDULE_KEY,normalizeProfiles,normalizeSchedule,activateProfile,type VisualProfile} from './personalization-profiles';
export const APPEARANCE_BACKUP_LIMIT=262144;
const keys=[INTERFACE_APPEARANCE_KEY,PROFILES_KEY,SCHEDULE_KEY,'mks_app_theme','mks_theme','mks_transparent','mks_panel_glow','mks_panel_glow_strength','mks_light_effects','mks_visual_schedule_applied'];
export function exportAppearanceBackup(current:VisualProfile,profiles:VisualProfile[],schedule:unknown,lightEffects:boolean){
 // Keep an explicit list of Google sources as well as each profile's selection.
 // Includes a saved custom source even when a built-in font is currently active.
 const families=new Set<string>();
 for(const profile of [current,...profiles]){
  const selected=interfaceGoogleFont(profile.appearance),custom=parseGoogleFontLink(profile.appearance.customFontUrl)?.family;
  if(selected)families.add(selected);if(custom)families.add(custom);
 }
 const googleFonts=[...families].map(family=>({family,url:googleFontUrl(family)}));
 return JSON.stringify({format:'pks-live-appearance',version:1,current,profiles,schedule,lightEffects,googleFonts},null,2);
}
export function parseAppearanceBackup(content:string){
 if(new TextEncoder().encode(content).length>APPEARANCE_BACKUP_LIMIT)throw Error('Plik jest za duży (maksymalnie 256 KB).');
 let input:any;try{input=JSON.parse(content);}catch{throw Error('Plik nie zawiera poprawnego JSON.');}
 if(input?.format!=='pks-live-appearance'||input.version!==1||!input.current?.appearance||typeof input.current.appearance!=='object'||!Array.isArray(input.profiles)||input.profiles.length>8)throw Error('To nie jest obsługiwana kopia wyglądu PKS Live.');
 const current=normalizeProfiles([input.current])[0];if(!current)throw Error('Brak poprawnego bieżącego motywu.');
 const profiles=normalizeProfiles(input.profiles);if(profiles.length!==input.profiles.length)throw Error('Kopia zawiera niepoprawne lub powtórzone zestawy.');
 const schedule=normalizeSchedule(input.schedule);
 if(schedule.dayAt===schedule.nightAt||!profiles.some(p=>p.id===schedule.dayProfile)||!profiles.some(p=>p.id===schedule.nightProfile))schedule.enabled=false;
 return {current,profiles,schedule,lightEffects:input.lightEffects===true};
}
/** Validate everything before writing; revert partial writes if storage fails. */
export function restoreAppearanceBackup(content:string){
 const backup=parseAppearanceBackup(content),previous=keys.map(key=>[key,localStorage.getItem(key)] as const);
 try{
  localStorage.setItem(PROFILES_KEY,JSON.stringify(backup.profiles));localStorage.setItem(SCHEDULE_KEY,JSON.stringify(backup.schedule));
  localStorage.removeItem('mks_visual_schedule_applied');localStorage.setItem('mks_light_effects',String(backup.lightEffects));activateProfile(backup.current,false);
 }catch(error){for(const [key,value] of previous){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}throw error;}
 window.dispatchEvent(new Event('pks-profiles-changed'));window.dispatchEvent(new Event('pks-profile-applied'));window.dispatchEvent(new Event('pks-interface-appearance'));
 return backup;
}
