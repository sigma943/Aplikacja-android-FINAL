declare module 'suncalc' {
  export function getPosition(date: Date, lat: number, lng: number): {altitude:number;azimuth:number};
  export function getMoonPosition(date: Date, lat: number, lng: number): {altitude:number;azimuth:number;parallacticAngle:number;distance:number};
  export function getMoonIllumination(date: Date): {fraction:number;phase:number;angle:number};
  export function getTimes(date: Date, lat: number, lng: number): Record<string,Date>;
}
