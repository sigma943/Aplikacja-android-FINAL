const fs=require('node:fs');
const path=require('node:path');
const [beforeFile,afterFile]=process.argv.slice(2);
const before=JSON.parse(fs.readFileSync(beforeFile)),after=JSON.parse(fs.readFileSync(afterFile));
const rows=[];
function compare(section,name,metric,label) {
  const previous=before[section].find(r=>r.name===name)?.[metric],current=after[section].find(r=>r.name===name)?.[metric];
  if(typeof previous!=='number'||typeof current!=='number')throw new Error('Missing metric '+name+'/'+metric);
  rows.push({label,beforeMs:previous,afterMs:current,reductionPercent:previous?+((1-current/previous)*100).toFixed(1):null});
}
for(const name of ['platform index prepare','catalog reopen from persistent snapshot','catalog first build','catalog cold: PKS + MPK','catalog cache hit: PKS + MPK','physical map catalog cache hit','collection signature: full PKS'])compare('cpu',name,'medianMs',name);
compare('browser','startup-100-vehicles','readyMs','Startup: vehicles and stop icons ready (Chrome CPU 4x)');
compare('browser','startup-100-vehicles','afterGateMs','Time from device restoration to ready map');
compare('browser','startup-100-vehicles','maxLongTaskMs','Startup: longest blocking task (Chrome CPU 4x)');
compare('browser','stop-list-open','scriptMs','Stop list opening: total JS work (Chrome CPU 4x)');
compare('browser','stop-list-search','scriptMs','Search in ready stop list: total JS work (Chrome CPU 4x)');
compare('browser','stop-list-search','maxLongTaskMs','Search in ready stop list: longest blocking task (Chrome CPU 4x)');
for(const name of ['idle-100-vehicles','hidden-map-idle','pan-map-100-vehicles','bus-panel','stop-panel'])compare('browser',name,'scriptMs',name+': JS work (Chrome CPU 4x)');
const output={baselineSha:process.env.PERF_BASELINE_SHA,environment:after.environment,rows,overlappingPks:{before:before.overlappingPks,after:after.overlappingPks},limitations:'Sequential runs on the same runner with identical harness, mocked feeds and fresh browser. Browser values are medians of three fresh-browser runs per version; raw runs are retained. Main-thread CPU throttling does not calibrate worker CPU speed or simulate a complete old phone. Not phone measurements or battery measurements.'};
const directory=path.dirname(afterFile);
fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(output,null,2));
fs.writeFileSync(path.join(directory,'comparison.md'),['# Before / after on the same runner','',output.limitations,'','| Measurement | Before ms | After ms | Reduction |','|---|---:|---:|---:|',...rows.map(r=>`| ${r.label} | ${r.beforeMs} | ${r.afterMs} | ${r.reductionPercent===null?'n/a':r.reductionPercent+'%'} |`),'','## Overlapping PKS map and panel refresh (mocked sources)','',JSON.stringify(output.overlappingPks,null,2),'','Request counts and payload bytes measure duplicate work; mocked latency cannot predict real network latency or battery use.','','Negative reduction means the measured scenario was slower; these are diagnostic results, not CI thresholds.'].join('\n'));
console.log('PERFORMANCE_COMPARISON_JSON='+JSON.stringify(output));
