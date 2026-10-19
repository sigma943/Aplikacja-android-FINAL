const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {buildDevicePermissions}=load('lib/admin/rbac.ts');
test('journeys restriction is independent of map and stops and defaults off for existing users',()=>{
 assert.equal(buildDevicePermissions('user',{disableStops:true}).disableJourneys,false);
 const restricted=buildDevicePermissions('user',{disableMap:true,disableJourneys:true});
 assert.equal(restricted.disableMap,true);assert.equal(restricted.disableStops,false);assert.equal(restricted.disableJourneys,true);
 const stops=buildDevicePermissions('user',{disableStops:true,disableJourneys:true});
 assert.equal(stops.disableStops,true);assert.equal(stops.disableJourneys,true);
});
