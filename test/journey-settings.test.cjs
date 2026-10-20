const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('journeys can be the start screen and old navigation orders gain one movable journeys entry',()=>{
 const {normalizeInterfaceAppearance}=load('lib/interface-appearance.ts');
 const old=normalizeInterfaceAppearance({navOrder:['options','map','stops','admin']});assert.deepEqual(old.navOrder,['options','map','journeys','stops','admin']);
 const saved=normalizeInterfaceAppearance({startScreen:'journeys',navOrder:['journeys','stops','map','options','admin','journeys']});assert.equal(saved.startScreen,'journeys');assert.equal(saved.navOrder[0],'journeys');assert.equal(saved.navOrder.filter(x=>x==='journeys').length,1);
});
test('journeys access is independent of map and stops, defaults to enabled and survives persisted permissions',()=>{
 const {normalizeAdminPermissions,buildDevicePermissions}=load('lib/admin/rbac.ts');
 assert.equal(Boolean(normalizeAdminPermissions({},'user').disableJourneys),false);
 const p=buildDevicePermissions('user',{disableJourneys:true});assert.equal(p.disableJourneys,true);assert.equal(p.disableMap,false);assert.equal(p.disableStops,false);
 assert.equal(normalizeAdminPermissions(p,'user').disableJourneys,true);assert.equal('disableJourneys' in buildDevicePermissions('user'),false);
 assert.equal(Boolean(normalizeAdminPermissions({disableJourneys:true},'owner').disableJourneys),false);
});
