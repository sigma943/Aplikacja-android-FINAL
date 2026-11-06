import BusStopDetail from '../Panel/src/components/BusStopDetail';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
const carrier={id:'mpk',name:'MPK RZESZÓW',colorClass:'text-orange-400',bgClass:'bg-orange-500/10',borderClass:'border-orange-500/20'};
const stop:any={id:'readability-stop',name:'Albigowa I 21 nż',code:'21',type:'bus',lines:['46'],carriers:[carrier],isFavorite:false};
const load=async()=>[0,1,2].map(i=>({id:'readability-'+i,line:'46',status:'on_time' as const,direction:'Dworzec Lokalny',plannedAtMs:Date.now()+(i+1)*3600000,time:['07:40','15:46','17:01'][i],carrier}));
export default function ReadabilityFixture({kind,dark}:{kind:string;dark:boolean}){
 return <div style={{position:'relative',height:'100vh',width:'100%'}}>{kind==='stops'?<BusStopDetail stop={stop} onBack={()=>{}} toggleFavorite={()=>{}} loadDepartures={load} isDarkTheme={dark}/>:<JourneyPlanner stops={[]} dark={dark} active allowMap={false} onClose={()=>{}}/>}</div>;
}
