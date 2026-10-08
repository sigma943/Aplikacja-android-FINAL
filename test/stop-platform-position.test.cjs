const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-ts.cjs');
const {createPlatformResolver}=load('lib/stop-platform-position.ts');
test('platform markers use confirmed passenger locations without mutating routing coordinates',()=>{
  const resolve=createPlatformResolver([{id:'n/1',name:'Konieczkowa szkoła 08',lat:49.84,lon:21.99},
    {id:'n/2',name:'Konieczkowa szkoła 07',lat:49.8401,lon:21.9901}]);
  const stop={name:'Konieczkowa Szk. 8',lat:49.84004,lon:21.99004};
  assert.deepEqual(resolve(stop),{lat:49.84,lon:21.99});
  assert.equal(stop.lat,49.84004);
  assert.equal(resolve({...stop,name:'Konieczkowa szkoła'}),null);
  assert.equal(resolve({...stop,name:'Konieczkowa szkoła 09'}),null);
  assert.equal(resolve({...stop,lat:50.84}),null);
  assert.equal(resolve({...stop,lat:0,lon:0}),null);
});
test('ambiguous platforms and different landmarks retain provider coordinates',()=>{
  const points=[{id:'a',name:'Babica za torami 53',lat:49.9,lon:22.0},
    {id:'b',name:'Babica za torami 53',lat:49.9001,lon:22.0001}];
  const resolve=createPlatformResolver(points);
  assert.equal(resolve({name:'Babica - Za torami 53',lat:49.9,lon:22}),null);
  assert.equal(resolve({name:'Babica szkoła 53',lat:49.9,lon:22}),null);
  assert.deepEqual(createPlatformResolver(points.slice(0,1))({name:'Babica - Za torami',lat:49.90001,lon:22}),{lat:49.9,lon:22});
});
test('the packaged catalog contains only named validated passenger platforms',()=>{
  const catalog=require('../public/data/stop-platforms.json');
  assert.ok(catalog.points.length>1000);
  for(const p of catalog.points){assert.ok(p.name&&p.id);assert.ok(p.lat>=48&&p.lat<=56&&p.lon>=14&&p.lon<=25);}
});

test('named Mochnackiego platforms accept the provider abbreviation but never the opposite code',()=>{
  const point={id:'platform/03',name:'Lisa-Kuli / Mochnackiego 03',lat:50.035944,lon:21.99708};
  const resolve=createPlatformResolver([point]);
  const stop={name:'Rzeszów, Lisa Kuli/Mochn. 03',lat:50.0359,lon:21.9971};
  assert.deepEqual(resolve(stop),{lat:point.lat,lon:point.lon});
  assert.equal(resolve({...stop,name:'Rzeszów, Lisa Kuli/Mochn. 04'}),null);
});
