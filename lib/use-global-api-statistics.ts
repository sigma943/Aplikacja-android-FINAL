'use client';
import {useEffect,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {db} from './firebase';
import {aggregateApiStatisticsReports,EMPTY_GLOBAL_API,type GlobalApiStatistics} from './api-statistics-reports';
import {observeAppActivity,isAppVisible} from './app-activity';
import {warsawDateIso} from './transit-time';
import type {StatisticsRange} from './admin/statistics';
import {useForegroundRefresh} from './use-foreground-refresh';

export function useGlobalApiStatistics(range:StatisticsRange,enabled=true){
  const [snapshot,setSnapshot]=useState<GlobalApiStatistics>(EMPTY_GLOBAL_API);
  const [dateKey,setDateKey]=useState(()=>warsawDateIso(0));
  useForegroundRefresh('global-api-calendar',async()=>{setDateKey(warsawDateIso(0));},60_000,enabled,60_000,false);
  useEffect(()=>{
    if(!enabled)return;
    let unsubscribe:undefined|(()=>void),disposed=false;
    const connect=()=>{
      unsubscribe?.();unsubscribe=undefined;
      if(disposed||!isAppVisible()||!navigator.onLine)return;
      setSnapshot({...EMPTY_GLOBAL_API});
      const now=new Date();
      const reports=query(collection(db,'api_statistics'),where('date','>=',warsawDateIso(1-range,now)),where('date','<=',warsawDateIso(0,now)));
      unsubscribe=onSnapshot(reports,result=>setSnapshot(aggregateApiStatisticsReports(result.docs.map(doc=>doc.data()))),
        ()=>setSnapshot({...EMPTY_GLOBAL_API,loading:false,error:'Nie udało się pobrać statystyk ze wszystkich urządzeń.'}));
    };
    const stop=observeAppActivity(connect);
    window.addEventListener('online',connect);window.addEventListener('offline',connect);
    connect();
    return()=>{disposed=true;unsubscribe?.();stop();window.removeEventListener('online',connect);window.removeEventListener('offline',connect);};
  },[range,enabled,dateKey]);
  return snapshot;
}
