import fs from 'node:fs/promises';
// A named passenger platform is different from a road stop_position.
// Keep this source separate from routing and provider identities.
const source=process.argv[2];
if(!source)throw Error('Pass an Overpass JSON export containing passenger platforms.');
const data=JSON.parse(await fs.readFile(source,'utf8'));
const points=(data.elements||[]).flatMap(element=>{
  const tags=element.tags||{},position=element.center||element;
  if(tags.public_transport!=='platform'||!tags.name?.trim()||!Number.isFinite(position.lat)||!Number.isFinite(position.lon)
    ||position.lat<48||position.lat>56||position.lon<14||position.lon>25)return [];
  return [{id:element.type+'/'+element.id,name:tags.name.trim(),code:tags.local_ref||'',lat:position.lat,lon:position.lon}];
});
if(points.length<1000)throw Error('Incomplete platform catalog; existing file retained.');
await fs.writeFile('public/data/stop-platforms.json',JSON.stringify({source:'OpenStreetMap contributors',license:'ODbL-1.0',
  sourceUrl:'https://www.openstreetmap.org/copyright',updatedAt:new Date().toISOString(),points}));
console.log('Saved '+points.length+' named passenger platforms.');
