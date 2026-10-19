const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');

test('real PKS and MPK delay windows load on a small worker stack',()=>{
 const script=`
 const assert=require('node:assert/strict'),fs=require('node:fs'),load=require('./test/load-ts.cjs');
 const {executeTimetableSearch}=load('lib/journey-schedules.ts');
 const {warsawTimeMs}=load('lib/transit-time.ts');
 global.fetch=async url=>({ok:true,arrayBuffer:async()=>{const bytes=fs.readFileSync('public'+url);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}});
 const stop={id:'journey:rzeszow-da',name:'Rzeszów D.A.',type:'bus',carriers:[],lines:[],isFavorite:false};
 (async()=>{const progress=[];const result=await executeTimetableSearch({from:stop,to:{...stop,id:'destination',name:'destination'},catalog:[],date:'2026-10-19',vehicles:[{id:'test'}],options:{at:warsawTimeMs('2026-10-19','17:15'),arriveBy:false,maxTransfers:1,walkMeters:0,transferMinutes:5,providers:['pks','mpk'],sort:'fastest'}},(n,total)=>progress.push([n,total]));assert.deepEqual(result.warnings,[]);assert.deepEqual(progress,[[1,2],[2,2]]);})().catch(error=>{console.error(error);process.exitCode=1;});
 `;
 const result=spawnSync(process.execPath,['--stack-size=128','-e',script],{cwd:process.cwd(),encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message);
});
