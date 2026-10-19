import {executeTimetableSearch,type TimetableSearch} from './journey-schedules';
self.onmessage=async({data}:{data:TimetableSearch})=>{
 try{self.postMessage({result:await executeTimetableSearch(data,(n,total)=>self.postMessage({progress:[n,total]}))});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:'Nie udało się obliczyć połączeń.'});}
};
