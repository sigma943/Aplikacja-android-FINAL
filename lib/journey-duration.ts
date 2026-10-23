/** Display only: elapsed milliseconds, rounded up to complete minutes. */
export function formatJourneyDuration(milliseconds:number):string {
 const minutes=Math.max(0,Math.ceil(milliseconds/60000));
 if(minutes<60)return `${minutes} min`;
 const hours=Math.floor(minutes/60),remainder=minutes%60;
 return `${hours} godz${remainder?` ${remainder} min`:''}`;
}
