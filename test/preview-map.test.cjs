const test=require('node:test');const assert=require('node:assert/strict');
const {PREVIEW_STATION,PREVIEW_BUS_ANCHOR,PREVIEW_MAP_HEIGHT,previewMapTiles}=require('./load-ts.cjs')('lib/preview-map.ts');
const points=require('../public/data/pks-stop-points.json').stops;
test('preview bus sits within the PKS terminal yard and tiles cover the whole miniature',()=>{
 const platforms=Object.values(points).filter(p=>p.areaId==='1937');
 assert.ok(platforms.length>=4);
 for(const [axis,key]of [['lat','lat'],['lon','lon']])assert.ok(PREVIEW_STATION[axis]>=Math.min(...platforms.map(p=>p[key]))&&PREVIEW_STATION[axis]<=Math.max(...platforms.map(p=>p[key])));
 const tiles=previewMapTiles();assert.ok(tiles.length>=4&&tiles.length<=9);
 assert.ok(Math.min(...tiles.map(t=>t.left))<=0&&Math.max(...tiles.map(t=>t.left+256))>=393);
 assert.ok(Math.min(...tiles.map(t=>t.top))<=0&&Math.max(...tiles.map(t=>t.top+256))>=PREVIEW_MAP_HEIGHT);
 const world=256*2**PREVIEW_STATION.zoom,sine=Math.sin(PREVIEW_STATION.lat*Math.PI/180),tile=tiles[0],url=new URL(tile.src);
 assert.ok(Math.abs((PREVIEW_STATION.lon+180)/360*world-(Number(url.searchParams.get('x'))*256-tile.left)-PREVIEW_BUS_ANCHOR.x)<.01);
 assert.ok(Math.abs((.5-Math.log((1+sine)/(1-sine))/(4*Math.PI))*world-(Number(url.searchParams.get('y'))*256-tile.top)-PREVIEW_BUS_ANCHOR.y)<.01);
});
