// Reproduce assets from captured OSRM responses. No guessed stop-to-stop lines.
import fs from 'node:fs/promises';
import ts from 'typescript';
const directory=process.argv[2];if(!directory)throw Error('Usage: node scripts/update-marcel-route-assets.mjs <captured-response-directory>');
const source=await fs.readFile('lib/bus-road-geometry.ts','utf8');
const exports={};new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {roadRouteMatchesStops,simplifyRoadRoute}=exports;
const patterns={},assets=[];
for(const filename of (await fs.readdir(directory)).filter(name=>/^full-.*\.json$/.test(name)).sort()){
  const capture=JSON.parse(await fs.readFile(`${directory}/${filename}`,'utf8'));
  const points=capture.stops;
  const route=(capture.osrm?.routes?.[0]?.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon]);
  if(!roadRouteMatchesStops(route,points,150))throw Error(`Invalid captured road geometry: ${filename}`);
  const simplified=simplifyRoadRoute(route,2);
  if(!roadRouteMatchesStops(simplified,points,150))throw Error(`Simplification lost stops: ${filename}`);
  const key=points.map(p=>p.map(n=>n.toFixed(6)).join(',')).join('|');
  if(patterns[key])throw Error(`Ambiguous pattern: ${filename}`);
  const shape=`pattern-${assets.length}`;patterns[key]=shape;assets.push([shape,simplified]);
}
if(!assets.length)throw Error('No verified routes; existing assets retained');
const output='public/data/marcel-routes';await fs.mkdir(output,{recursive:true});
for(const [shape,points] of assets)await fs.writeFile(`${output}/${shape}.json`,JSON.stringify(points));
await fs.writeFile(`${output}/index.json`,JSON.stringify({version:1,source:'https://router.project-osrm.org',dataSource:'OpenStreetMap contributors',license:'ODbL-1.0',updatedAt:new Date().toISOString(),patterns}));
console.log(`Saved ${assets.length} validated, complete Marcel road patterns`);
