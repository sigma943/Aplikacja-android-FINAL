const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {parseJourneyCoordinates}=load('lib/journey-coordinates.ts');
test('typed and pasted WGS84 coordinates accept standard and Polish decimal notation',()=>{
 for(const value of ['50.03897, 22.00282','50.03897 22.00282','50.03897;22.00282','50,03897; 22,00282','50,03897 22,00282','\n50.03897,\n22.00282\n']){
  const point=parseJourneyCoordinates(value);assert.equal(point.lat,50.03897);assert.equal(point.lon,22.00282);assert.match(point.id,/^journey:point:/);
 }
 assert.equal(parseJourneyCoordinates('-33.86, 151.2').lat,-33.86);
 for(const value of ['91, 22','50, 181','50.0','NaN, 22','Pro-Familia Rzeszów','50,,22','50 22 3'])assert.equal(parseJourneyCoordinates(value),null,value);
});
