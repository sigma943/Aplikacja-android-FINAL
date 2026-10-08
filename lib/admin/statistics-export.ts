import {Capacitor,registerPlugin} from '@capacitor/core';
const exporter=registerPlugin<{save(options:{content:string;filename:string}):Promise<{saved:boolean}>}>('AdminStatisticsExport');
/** Android uses its document picker; WebView does not support blob downloads. */
export async function saveStatisticsCsv(content:string,filename:string){
  if(Capacitor.getPlatform()==='android')return exporter.save({content,filename});
  const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);return {saved:true};
}
