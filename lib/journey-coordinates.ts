import {journeyMapPoint} from './journey-places';
import type {Stop} from '@/Panel/src/types';

/** Decimal WGS84, latitude first. Accept Google-style pairs and Polish decimal commas. */
export function parseJourneyCoordinates(input:string):Stop|null{
 const value=input.trim().replace(/\u2212/g,'-');
 const dot=/^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/.exec(value);
 const comma=/^([+-]?\d+,\d+)\s*[;\s]\s*([+-]?\d+,\d+)$/.exec(value);
 const pair=dot||comma;if(!pair)return null;
 const lat=Number(pair[1].replace(',','.')),lon=Number(pair[2].replace(',','.'));
 try{return journeyMapPoint(lat,lon);}catch{return null;}
}
