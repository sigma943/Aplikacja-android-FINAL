import {Capacitor, registerPlugin, type PluginListenerHandle} from '@capacitor/core';
import type {Stop, Departure} from '@/Panel/src/types';
import {departureFromLiveVehicle} from './vehicle-stop-timing';
import {departureIsPast} from './departure-display';
import {warsawDateIso, warsawTimeMs} from './transit-time';
import type {Vehicle} from '@/components/BusMap';
export interface StopWidgetConfig {stop: Stop; lines: string[] | null; size: 'small'|'medium'|'large'; theme: 'system'|'light'|'dark'}
export function widgetDepartures(departures: Departure[], vehicles: Vehicle[], lines: string[] | null, now=Date.now(),limit=16) {
  return departures.map(d=>departureFromLiveVehicle(d,vehicles)).map(d=>({...d,plannedAtMs:d.plannedAtMs??warsawTimeMs(warsawDateIso(0,new Date(now)),d.time)}))
    .filter(d=>(lines===null||lines.includes(d.line))&&!departureIsPast(d,now,d.plannedAtMs))
    .sort((a,b)=>(a.realAtMs??a.plannedAtMs)-(b.realAtMs??b.plannedAtMs)).slice(0,limit);
}
const plugin=registerPlugin<{sync(options:{stopId:string;departures:string;warning:string}):Promise<void>;getLaunchStop():Promise<{stop?:Stop}>;addListener(event:'openStop',cb:(data:{stop?:Stop})=>void):Promise<PluginListenerHandle>;pin(options:{config:string; departures:string}):Promise<{token:string}>; status(options:{token:string}):Promise<{added:boolean}>}>('StopWidget');
export const canGenerateWidget=()=>Capacitor.getPlatform()==='android';
export async function pinStopWidget(config:StopWidgetConfig,departures:Departure[],vehicles:Vehicle[]) {
  if(!canGenerateWidget())throw new Error('Widżety ekranu głównego są dostępne w aplikacji na Androida.');
  return plugin.pin({config:JSON.stringify(config),departures:JSON.stringify(widgetDepartures(departures,vehicles,config.lines))});
}
export const widgetPinStatus=(token:string)=>plugin.status({token});

export function onWidgetOpen(callback:(stop:Stop)=>void) {
  if(!canGenerateWidget())return ()=>{};
  let active=true;let listener:PluginListenerHandle|undefined;
  void plugin.getLaunchStop().then(r=>{if(active&&r.stop)callback(r.stop);}).catch(()=>{});
  void plugin.addListener('openStop',r=>{if(active&&r.stop)callback(r.stop);}).then(handle=>{if(active)listener=handle;else void handle.remove();});
  return ()=>{active=false;void listener?.remove();};
}

export async function syncStopWidgets(stopId:string,departures:Departure[],vehicles:Vehicle[],warnings:string[]) {
  if(canGenerateWidget())await plugin.sync({stopId,departures:JSON.stringify(widgetDepartures(departures,vehicles,null,Date.now(),128)),warning:warnings.join(' • ')});
}
