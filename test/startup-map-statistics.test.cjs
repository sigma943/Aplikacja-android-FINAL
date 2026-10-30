const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),load=require('./load-ts.cjs');
function source(path){return ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function initializer(src,name){let result;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(src)===name)result=node.initializer.getText(src);ts.forEachChild(node,visit);}visit(src);assert.ok(result,name);return result;}
function memoHarness(){const slots=[];let index=0;return {reset(){index=0;},useMemo(run,deps){const previous=slots[index];if(!previous||deps.some((v,i)=>v!==previous.deps[i]))slots[index]={deps,value:run()};return slots[index++].value;}};}

test('a rejected old API report cannot block today, and only failures are retried',async()=>{
 const {uploadApiStatisticsReports}=load('lib/api-statistics-reports.ts');
 const old={stream:'a'.repeat(64),date:'2026-10-29',startedAt:1,providers:{pks:{requests:20}}};
 const today={...old,date:'2026-10-30',providers:{pks:{requests:6}}},sent=new Map(),writes=[];
 await assert.rejects(uploadApiStatisticsReports([old,today],sent,()=>true,async(_,report)=>{writes.push(report.date);if(report===old)throw Error('Historical counter rejected');}),/Historical/);
 assert.deepEqual(writes,['2026-10-30','2026-10-29']);assert.equal(sent.size,1);
 assert.ok(sent.has(today.stream+'_'+today.date));
 await uploadApiStatisticsReports([old,today],sent,()=>true,async(_,report)=>writes.push(report.date));
 assert.deepEqual(writes,['2026-10-30','2026-10-29','2026-10-29']);
});

test('missing daily API reports are gaps, explicit zeros remain zeros and totals stay exact',()=>{
 const {apiStatistics}=load('lib/admin/statistics.ts');const now=Date.parse('2026-10-30T06:00:00Z');
 const result=apiStatistics([{date:'2026-10-28',providers:{pks:{requests:2593,errors:2,latencyMs:259300}}},{date:'2026-10-30',providers:{pks:{requests:6,errors:0,latencyMs:600}}}],7,now-10*86400_000,now);
 assert.equal(result.series.find(p=>p.date==='2026-10-29').value,null);
 assert.equal(result.series.at(-1).value,6);assert.equal(result.requests,2599);
 const zero=apiStatistics([{date:'2026-10-30',providers:{pks:{requests:0,errors:0,latencyMs:0}}}],1,now-1000,now);
 assert.equal(zero.series[0].value,0);
});

test('API chart displays low request counts and missing reports without error dots covering request dots',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {TimeChart}=load('app/admin/components/StatisticsView.tsx',{'@/lib/use-global-api-statistics':{useGlobalApiStatistics:()=>({})}});
 const points=[{date:'2026-10-28',value:2593,errors:1},{date:'2026-10-29',value:null,errors:null},{date:'2026-10-30',value:6,errors:0}];
 const markup=renderToStaticMarkup(React.createElement(TimeChart,{points,color:'#14b8a6',title:'API',dark:false}));
 assert.match(markup,/6 zapytań/);assert.match(markup,/2026-10-29<\/td><td>Brak pomiarów/);
 const marks=[...markup.matchAll(/<g[^>]*data-statistics-marks[^>]*>(.*?)<\/g>/g)].map(m=>m[1]);
 assert.equal(marks.length,3);
 assert.ok(marks[2].indexOf('--statistics-errors')<marks[2].indexOf('--statistics-series'));
 assert.equal(marks[1],'');
});

test('the signed-in device keeps its record during pending presence writes and duplicate UID cleanup',()=>{
 const {dedupeDevicesByInstallation}=load('lib/admin/dashboard-model.ts');
 const time=ms=>({toDate:()=>new Date(ms)});
 const other={id:'other',installationId:'other-phone',role:'user',lastSeenAt:time(100_000)};
 const mine={id:'me',installationId:'my-phone',role:'owner',lastSeenAt:time(120_000)};
 const legacy={...mine,id:'old-uid',lastSeenAt:time(110_000)};
 for(const seen of [mine.lastSeenAt,null,time(130_000)]){
  const rows=dedupeDevicesByInstallation([other,{...mine,lastSeenAt:seen},legacy],'me');
  assert.deepEqual(rows.map(row=>row.id),['other','me']);
 }
 const foreign=dedupeDevicesByInstallation([other,{...legacy,lastSeenAt:time(1)},mine]);
 assert.equal(foreign.find(row=>row.installationId==='my-phone').id,'me','other installations retain their existing selection policy');
});

test('device cards and desktop rows keep the same React identity when the UID changes',()=>{
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const {DeviceTable}=load('app/admin/components/DeviceTable.tsx',{
  react:{useState:value=>[typeof value==='function'?value():value,()=>{}],useMemo:fn=>fn(),useEffect:()=>{},useRef:value=>({current:value})},
  'react/jsx-runtime':{jsx,jsxs:jsx},
  'motion/react':{motion:{div:'motion.div'},AnimatePresence:'presence'},
  '@/lib/use-app-back':{useAppBack:()=>{}},'@/lib/journey-motion':{useJourneyReducedMotion:()=>false},
 });
 const base={name:'Phone',os:'Android',role:'Użytkownik',status:'Aktywny',iconType:'mobile',firstLogin:'30.10.2026',installationId:'physical'};
 const keys=id=>{const result=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='tr'||node.props?.['data-admin-device-item'])result.push(node.key);Object.values(node.props||{}).forEach(v=>Array.isArray(v)?v.forEach(walk):walk(v));}walk(DeviceTable({devices:[{...base,id,deviceId:id}],onMenuClick:()=>{}}));return result.filter(Boolean);};
 assert.deepEqual(keys('old-uid'),['installation:physical','installation:physical']);
 assert.deepEqual(keys('new-uid'),keys('old-uid'));
});

test('map clock and GPS updates reuse painted geometry while exact coordinate/provider changes still repaint',()=>{
 const src=source('components/BusMap.tsx'),memo=memoHarness();let paints=0;
 const script=ts.transpile(`const routeCoordinatesKey=${initializer(src,'routeCoordinatesKey')};const paintedGeometry=${initializer(src,'paintedGeometry')};return paintedGeometry;`,{target:ts.ScriptTarget.ES2022});
 const render=new Function('useMemo','routeGeometryStops','currentGeometry','selectedVehicle','mpkShapePins','mpkRouteForPaint',script);
 const geometry=[[50,22],[50.01,22.01]],pins=[[50,22]];
 const paint=(route)=>{paints++;return route;};
 for(let tick=0;tick<240;tick++){
  memo.reset();assert.equal(render(memo.useMemo,[{id:1,lat:50,lon:22,name:'Stop',planned:String(tick)}],geometry,{provider:'mpk_rzeszow',delay:tick},pins,paint),geometry);
 }
 assert.equal(paints,1);
 memo.reset();render(memo.useMemo,[{id:1,lat:50.00000001,lon:22}],geometry,{provider:'mpk_rzeszow'},pins,paint);assert.equal(paints,2,'submetre coordinate changes are not hidden by rounded hashes');
 memo.reset();render(memo.useMemo,[{id:1,lat:50.00000001,lon:22}],geometry,{provider:'marcel'},pins,paint);assert.equal(paints,3);
});

test('optional startup parsing waits for map readiness and foreground; cleanup cancels pending warmup',()=>{
 const src=source('app/page.tsx');let effect;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(src)==='useEffect'&&node.arguments[0]?.getText(src).includes('warmPanelCode'))effect=node.arguments[0].getText(src);ts.forEachChild(node,visit);}visit(src);assert.ok(effect);
 const run=new Function('isLoading','mapReady','isAppForeground','setTimeout','clearTimeout','window','warmPanelCode','return ('+ts.transpile('const effect='+effect,{target:ts.ScriptTarget.ES2022}).replace(/^const effect\s*=\s*/,'').replace(/;\s*$/,'')+')();');
 let calls=0,timer,scheduled=0;const schedule=fn=>{scheduled++;timer=fn;return 1;};
 assert.equal(run(false,false,true,schedule,()=>{},{},()=>calls++),undefined);assert.equal(scheduled,0);
 assert.equal(run(false,true,false,schedule,()=>{},{},()=>calls++),undefined);assert.equal(scheduled,0);
 const cleanup=run(false,true,true,schedule,()=>{},{},()=>calls++);assert.equal(scheduled,1);cleanup();timer();assert.equal(calls,0);
 run(false,true,true,schedule,()=>{},{},()=>calls++);timer();assert.equal(calls,1);
});
