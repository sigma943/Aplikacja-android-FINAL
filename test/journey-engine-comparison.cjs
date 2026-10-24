// Run from the working tree: node test/journey-engine-comparison.cjs BASELINE_DIR.
// Each measurement runs in an isolated child, serially on the same machine.
const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const cases=['regional-direct','mixed-carrier','full-network-two-transfers','full-network-unlimited'];
if(process.argv[2]==='--child'){
 const root=process.cwd(),load=require(path.join(root,'test/load-ts.cjs'));
 const {feedConnections,scanJourneys}=load('lib/journey-timetable.ts'),{warsawTimeMs}=load('lib/transit-time.ts');
 const date='2026-10-20',feeds={},hashes={};
 for(const p of ['pks','mpk']){const bytes=fs.readFileSync(path.join(root,'public/data/journeys/'+p+'.json.gz'));hashes[p]=crypto.createHash('sha256').update(bytes).digest('hex');feeds[p]=JSON.parse(z.gunzipSync(bytes));}
 const stop=(p,id)=>({...feeds[p].stops[id],id:'journey:'+p+':'+id,type:'bus',carriers:[],lines:[],isFavorite:false});
 const name=process.argv[3],large=name.startsWith('full-network');
 const from=large?{...stop('pks','10'),id:'journey:point:regression'}:name==='mixed-carrier'?stop('mpk','159'):stop('pks','566');
 const to=large?stop('pks','1789'):name==='mixed-carrier'?stop('pks','566'):load('lib/pks-terminal-identity.ts').pksTerminalStop('58',feeds.pks.stops['58'],[]);
 const options={at:warsawTimeMs(date,large?'12:00':'09:30'),day:date,arriveBy:false,maxTransfers:name.endsWith('unlimited')?-1:large?2:name==='mixed-carrier'?1:0,walkMeters:large?2000:name==='mixed-carrier'?300:500,transferMinutes:large?10:5,providers:['pks','mpk','marcel'],sort:'fastest'};
 const connections=[...feedConnections(feeds.pks,[],date,options),...feedConnections(feeds.mpk,[],date,options)];
 const times=[];let journeys;
 for(let i=0;i<3;i++){const start=performance.now();journeys=scanJourneys(from,to,connections,options);times.push(Math.round(performance.now()-start));}
 assert.ok(journeys.length,'a benchmark without reachable results is not a success');
 for(const j of journeys){let walking=0;for(const leg of j.legs){walking=leg.walking===undefined?0:walking+leg.walking;assert.ok(walking<=options.walkMeters);}if(options.maxTransfers>=0)assert.ok(j.transfers<=options.maxTransfers);}
 console.log(JSON.stringify({name,connections:connections.length,milliseconds:times,medianMs:[...times].sort((a,b)=>a-b)[1],results:journeys.length,best:{arrival:journeys[0].arrival,departure:journeys[0].departure,transfers:journeys[0].transfers,walking:journeys[0].walking},feedSha256:hashes}));
}else{
 const baseline=path.resolve(process.argv[2]||''),current=process.cwd(),rows=[];
 if(!process.argv[2])throw Error('Supply a detached baseline checkout.');
 for(const name of cases){
  const row={name};
  for(const [label,root] of [['baseline',baseline],['current',current]]){
   const run=spawnSync(process.execPath,[__filename,'--child',name],{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:1024*1024,env:{...process.env,NODE_PATH:path.join(current,'node_modules')}});
   if(run.error?.code==='ETIMEDOUT')row[label]={timeoutMs:45000};
   else{assert.equal(run.status,0,run.stderr||run.error?.message);row[label]=JSON.parse(run.stdout.trim());}
  }
  if(row.baseline.best){assert.deepEqual(row.current.feedSha256,row.baseline.feedSha256);assert.ok(row.current.best.arrival<=row.baseline.best.arrival,'earliest arrival regressed');}
  rows.push(row);
 }
 console.log(JSON.stringify({node:process.version,method:'Three sequential runs per case; 45s total deadline per isolated child; raw timetable search, no HTTP or pedestrian refinement.',rows},null,2));
}
