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
for(const name of ['catalog first build','catalog cold: PKS + MPK','catalog cache hit: PKS + MPK','physical map catalog cache hit','collection signature: full PKS'])compare('cpu',name,'medianMs',name);
compare('browser','startup-100-vehicles','readyMs','Startup: vehicles and stop icons ready (Chrome CPU 4x)');
compare('browser','startup-100-vehicles','maxLongTaskMs','Startup: longest blocking task (Chrome CPU 4x)');
compare('browser','stop-list-search','scriptMs','Stop list and search: total JS work (Chrome CPU 4x)');
compare('browser','stop-list-search','maxLongTaskMs','Stop list and search: longest blocking task (Chrome CPU 4x)');
const output={baselineSha:process.env.PERF_BASELINE_SHA,environment:after.environment,rows,overlappingPks:{before:before.overlappingPks,after:after.overlappingPks},limitations:'Sequential runs on the same runner with identical harness, mocked feeds and fresh browser. One browser run per version; repeat to establish a reliable distribution. Not phone measurements or battery measurements.'};
const directory=path.dirname(afterFile);
fs.writeFileSync(path.join(directory,'comparison.json'),JSON.stringify(output,null,2));
fs.writeFileSync(path.join(directory,'comparison.md'),['# Before / after on the same runner','',output.limitations,'','| Measurement | Before ms | After ms | Reduction |','|---|---:|---:|---:|',...rows.map(r=>`| ${r.label} | ${r.beforeMs} | ${r.afterMs} | ${r.reductionPercent===null?'n/a':r.reductionPercent+'%'} |`),'','## Overlapping PKS map and panel refresh (mocked sources)','',JSON.stringify(output.overlappingPks,null,2),'','Request counts and payload bytes measure duplicate work; mocked latency cannot predict real network latency or battery use.','','Negative reduction means the measured scenario was slower; these are diagnostic results, not CI thresholds.'].join('\n'));
console.log('PERFORMANCE_COMPARISON_JSON='+JSON.stringify(output));
