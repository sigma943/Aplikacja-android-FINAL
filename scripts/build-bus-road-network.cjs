const fs=require('node:fs'),path=require('node:path');
/** Merge only shared operator vertices; never invent links between nearby roads. */
function buildBusRoadNetwork(shapes){
 const points=[],lookup=new Map(),links=new Set();
 for(const shape of shapes){let previous;
  for(const p of shape){if(!Array.isArray(p)||!p.every(Number.isFinite))continue;
   const point=p.map(v=>Math.round(v*1e6)),key=point.join(','),id=lookup.get(key)??points.length;
   if(!lookup.has(key)){lookup.set(key,id);points.push(point);}
   if(previous!==undefined&&previous!==id)links.add(previous+','+id);
   previous=id;
  }
 }
 return {version:1,points,links:[...links].map(s=>s.split(',').map(Number))};
}
function prepareBusRoadNetwork(){
 const shapes=[];
 for(const provider of ['pks','mpk_rzeszow'])for(const file of fs.readdirSync('public/data/bus-routes/'+provider).sort())if(file.endsWith('.json'))shapes.push(JSON.parse(fs.readFileSync(path.join('public/data/bus-routes',provider,file),'utf8')));
 const data=buildBusRoadNetwork(shapes);fs.writeFileSync('public/data/bus-road-network.json',JSON.stringify(data));return data;
}
module.exports={buildBusRoadNetwork,prepareBusRoadNetwork};
if(require.main===module){const data=prepareBusRoadNetwork();console.log('Bus road network:',data.points.length,'vertices,',data.links.length,'directed edges');}
