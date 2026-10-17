'use client';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {doc,setDoc,serverTimestamp} from 'firebase/firestore';
import {useFirebase} from './FirebaseProvider';
import {db} from '@/lib/firebase';
import {getApiStatistics} from '@/lib/api-statistics';
import {apiStatisticsStreamId,apiStatisticsReports,readApiReportAcknowledgements,uploadApiStatisticsReports} from '@/lib/api-statistics-reports';
import {useForegroundRefresh} from '@/lib/use-foreground-refresh';
import {isAppVisible} from '@/lib/app-activity';

const ACK_KEY='pks-live:api-report-ack:v1';
export default function ApiStatisticsSync(){
  const path=usePathname();
  return path?.startsWith('/widget-data')?null:<ForegroundApiStatisticsSync/>;
}
function ForegroundApiStatisticsSync(){
  const {user,device,loading,isBanned,apiStatisticsEnabled}=useFirebase();
  const sent=useRef(new Map<string,string>()),stream=useRef<{installationId:string;startedAt:number;id:string}|null>(null);
  useEffect(()=>{try{sent.current=readApiReportAcknowledgements(JSON.parse(localStorage.getItem(ACK_KEY)||'null'));}catch{}},[]);
  const installationId=device?.installationId||'';
  const enabled=Boolean(apiStatisticsEnabled&&user?.uid&&installationId&&!loading&&!isBanned&&device?.loginApproved!==false);
  useForegroundRefresh(`api-statistics:${user?.uid||''}:${installationId}`,async()=>{
    const history=getApiStatistics();
    if(!history.startedAt||!user?.uid)return;
    if(!stream.current||stream.current.installationId!==installationId||stream.current.startedAt!==history.startedAt){
      stream.current={installationId,startedAt:history.startedAt,id:await apiStatisticsStreamId(installationId,history.startedAt)};
    }
    const reports=apiStatisticsReports(history,stream.current.id,installationId,user.uid);
    try{
      const writes=await uploadApiStatisticsReports(reports,sent.current,()=>isAppVisible()&&navigator.onLine,
        (id,report)=>setDoc(doc(db,'api_statistics',id),{...report,updatedAt:serverTimestamp()}));
      if(writes)try{localStorage.setItem(ACK_KEY,JSON.stringify(Object.fromEntries(sent.current)));}catch{}
    }catch{/* Retain local counters and retry later; reporting cannot block transport. */}
  },60_000,enabled,15_000);
  return null;
}
