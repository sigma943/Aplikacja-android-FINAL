import {useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useStopDepartures} from '../Panel/src/components/useStopDepartures';
import type {Departure,DepartureResult,Stop} from '../Panel/src/types';
const api:any={requests:[],renders:[],metadata:0};(window as any).__stopRefresh=api;
const load=(_stop:Stop,_day?:number,partial?:(value:DepartureResult)=>void)=>new Promise<DepartureResult>((resolve,reject)=>api.requests.push({partial,resolve,reject}));
function App(){
 const [stop,setStop]=useState({id:'2083',name:'Gwoźnica Górna',sourceProviderIds:['pks'],providerStopIds:{pks:'2083',pksNames:'Gwoźnica'},lines:['108'],carriers:[]} as unknown as Stop);
 const [date,setDate]=useState('2026-11-06');
 const state=useStopDepartures(stop,0,date,load,true);
 useLayoutEffect(()=>{
  api.enrich=()=>setStop(old=>({...old,providerStopIds:{...old.providerStopIds,pksNames:'Nazwa '+(++api.metadata)}}));
  api.changeDate=setDate;api.changeStop=()=>setStop(old=>({...old,id:'2084',providerStopIds:{pks:'2084'}}));api.refresh=state.refresh;
  api.renders.push({ids:state.departures.map(d=>d.id),loading:state.isLoading,fetching:state.isFetching,date,stop:stop.id});
 });
 return <main><button onClick={()=>state.refresh()}>Odśwież</button><div data-loading={state.isLoading?'true':'false'} data-fetching={state.isFetching?'true':'false'}>{state.isLoading?<p data-skeleton>Wczytywanie</p>:<ul data-list>{state.departures.map(d=><li data-row key={d.id}>{d.id}: {d.time}</li>)}</ul>}</div><p data-warning>{state.warnings.join(' ')}</p></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
