import {findJourneys} from './journey-planner';
self.onmessage=event=>{const {from,to,legs,options}=event.data;try{self.postMessage({journeys:findJourneys(from,to,legs,options)});}catch{self.postMessage({error:true});}};
