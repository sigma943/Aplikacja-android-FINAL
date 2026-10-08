'use client';
import {useEffect} from 'react';
import {subscribeTransportMeasurements} from '@/lib/transport-diagnostics';
import {collectApiMeasurement,saveApiStatistics} from '@/lib/api-statistics';

/** Passive local statistics, isolated from authentication and transport requests. */
export default function StatisticsCollector(){
  useEffect(()=>{
    const unsubscribe=subscribeTransportMeasurements(collectApiMeasurement);
    const hidden=()=>{if(document.visibilityState==='hidden')saveApiStatistics();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',saveApiStatistics);
    return()=>{unsubscribe();saveApiStatistics();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',saveApiStatistics);};
  },[]);
  return null;
}
