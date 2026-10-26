import {executeTimetableSearch,type TimetableSearch} from './journey-schedules';
import type {JourneySearchGraph} from './journey-footpath-network';
let input:TimetableSearch|undefined;
self.onmessage=async({data}:{data:{input?:TimetableSearch;graph?:JourneySearchGraph}})=>{
 try{
  if(data.input)input=data.input;else if(input)input={...input,graph:data.graph};
  if(!input)throw Error('Brak danych wyszukiwania.');
  self.postMessage({result:await executeTimetableSearch(input,(n,total)=>self.postMessage({progress:[n,total]}))});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Nie udało się obliczyć połączeń.'});}
};
