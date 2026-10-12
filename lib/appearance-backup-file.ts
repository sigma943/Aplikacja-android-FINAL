import {Capacitor,registerPlugin} from '@capacitor/core';
const plugin=registerPlugin<{save(options:{content:string}):Promise<{saved:boolean}>;load():Promise<{content?:string;cancelled?:boolean}>}>('AppearanceBackup');
export async function saveAppearanceBackupFile(content:string){
 if(Capacitor.getPlatform()==='android')return plugin.save({content});
 const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='pks-live-wyglad.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return {saved:true};
}
export const loadNativeAppearanceBackup=()=>plugin.load();
export const nativeAppearanceBackup=()=>Capacitor.getPlatform()==='android';
