import {astronomyAt,solarEvents,lunarEvents,type LandscapeLocation} from './landscape-astronomy';
self.onmessage=(event:MessageEvent<{ms:number;location:LandscapeLocation;id:number;span?:number}>)=>{
  const {ms,location,id,span=30000}=event.data;
  self.postMessage({id,a:astronomyAt(ms,location),b:astronomyAt(ms+span,location),events:{...solarEvents(ms,location),...lunarEvents(ms,location)}});
};
