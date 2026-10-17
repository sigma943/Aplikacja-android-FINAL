const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const reports=load('lib/api-statistics-reports.ts');
const now=Date.parse('2026-10-17T10:00:00Z'),date='2026-10-17';
const bucket=(requests,errors=0,latencyMs=requests*100)=>({requests,errors,latencyMs});
const history={version:1,startedAt:now-1000,days:[{date,providers:{pks:bucket(10,1)}}]};

test('report stream survives UID changes and hides the stable identifier in its document key',async()=>{
 const first=await reports.apiStatisticsStreamId('android_private_phone',history.startedAt);
 assert.match(first,/^[a-f0-9]{64}$/);assert.equal(first.includes('private'),false);
 assert.equal(await reports.apiStatisticsStreamId('android_private_phone',history.startedAt),first);
 assert.notEqual(await reports.apiStatisticsStreamId('other-phone',history.startedAt),first);
 assert.notEqual(await reports.apiStatisticsStreamId('android_private_phone',history.startedAt+1),first);
 const a=reports.apiStatisticsReports(history,first,'phone','old-uid',now)[0];
 const b=reports.apiStatisticsReports(history,first,'phone','new-uid',now)[0];
 assert.equal(a.stream,b.stream);assert.deepEqual(a.providers,b.providers);assert.notEqual(a.uid,b.uid);
});

test('global totals sum phones and reinstall streams once, with physical device count per day',()=>{
 const one={stream:'a'.repeat(64),date,installationId:'phone-one',startedAt:now-1000,providers:{pks:bucket(10,1)}};
 const reinstalled={...one,stream:'b'.repeat(64),providers:{mpk_rzeszow:bucket(5,1,1000)}};
 const other={...one,stream:'c'.repeat(64),installationId:'phone-two',providers:{pks:bucket(20,2),marcel:bucket(3)}};
 const result=reports.aggregateApiStatisticsReports([one,reinstalled,other,one],now);
 const {apiStatistics}=load('lib/admin/statistics.ts');const summary=apiStatistics(result.days,1,result.startedAt,now);
 assert.equal(summary.requests,38);assert.equal(summary.errors,4);assert.equal(result.contributors[date],2);
 assert.equal(summary.averageMs,Math.round((1000+1000+2000+300)/38));
 assert.equal(summary.series[0].averageMs,summary.averageMs);
 assert.equal(summary.series[0].successRate,summary.successRate);
});

test('uploading cumulative reports is idempotent and only changed daily counters are written',async()=>{
 const stream='a'.repeat(64),sent=new Map(),stored=new Map();let writes=0;
 const write=async(id,report)=>{stored.set(id,report);writes++;};
 let data=reports.apiStatisticsReports(history,stream,'phone','first-uid',now);
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>true,write),1);
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>true,write),0);
 data=reports.apiStatisticsReports(history,stream,'phone','reinstalled-uid',now);
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>true,write),0);
 data[0].providers.pks={...data[0].providers.pks,requests:11};
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>true,write),1);
 assert.equal(stored.size,1);assert.equal(writes,2);assert.equal([...stored.values()][0].providers.pks.requests,11);
});

test('hiding or going offline stops writes between reports and failed writes remain pending',async()=>{
 const data=reports.apiStatisticsReports({...history,days:[...history.days,{date:'2026-10-16',providers:{pks:bucket(1)}}]},'a'.repeat(64),'phone','uid',now);
 const sent=new Map();let active=false,writes=0;
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>active,async()=>{writes++;}),0);
 active=true;assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>active,async()=>{writes++;active=false;}),1);
 assert.equal(writes,1);assert.equal(sent.size,1);
 active=true;await assert.rejects(reports.uploadApiStatisticsReports(data,sent,()=>active,async()=>{throw Error('offline');}),/offline/);
 assert.equal(sent.size,1);
 assert.equal(await reports.uploadApiStatisticsReports(data,sent,()=>active,async()=>{writes++;}),1);
 assert.equal(sent.size,2);assert.equal(writes,2);
});

test('reports and acknowledgements reject corrupt and expired data without exposing device lists',()=>{
 assert.deepEqual(reports.apiStatisticsReports(history,'invalid','phone','uid',now),[]);
 const result=reports.aggregateApiStatisticsReports([null,{stream:'invalid'},
  {stream:'a'.repeat(64),date:'2026-01-01',installationId:'phone',startedAt:now-1000,providers:{pks:bucket(1)}},
  {stream:'b'.repeat(64),date,installationId:'phone',startedAt:now+1000,providers:{pks:bucket(1)}}],now);
 assert.deepEqual(result.days,[]);assert.equal(result.startedAt,null);
 const valid='a'.repeat(64)+'_'+date;
 const sent=reports.readApiReportAcknowledgements({[valid]:'fingerprint',['b'.repeat(64)+'_2026-01-01']:'old',private:'invalid'},now);
 assert.deepEqual([...sent],[[valid,'fingerprint']]);
});
