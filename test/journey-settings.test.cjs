const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('journeys can be the start screen and old navigation orders gain one movable journeys entry',()=>{
 const {normalizeInterfaceAppearance}=load('lib/interface-appearance.ts');
 const old=normalizeInterfaceAppearance({navOrder:['options','map','stops','admin']});assert.deepEqual(old.navOrder,['options','map','stops','journeys','admin']);
 const saved=normalizeInterfaceAppearance({startScreen:'journeys',navOrder:['journeys','stops','map','options','admin','journeys']});assert.equal(saved.startScreen,'journeys');assert.equal(saved.navOrder[0],'journeys');assert.equal(saved.navOrder.filter(x=>x==='journeys').length,1);
});
test('journeys access is independent of map and stops, defaults to enabled and survives persisted permissions',()=>{
 const {normalizeAdminPermissions,buildDevicePermissions}=load('lib/admin/rbac.ts');
 assert.equal(Boolean(normalizeAdminPermissions({},'user').disableJourneys),false);
 const p=buildDevicePermissions('user',{disableJourneys:true});assert.equal(p.disableJourneys,true);assert.equal(p.disableMap,false);assert.equal(p.disableStops,false);
 assert.equal(normalizeAdminPermissions(p,'user').disableJourneys,true);assert.equal('disableJourneys' in buildDevicePermissions('user'),false);
 assert.equal(Boolean(normalizeAdminPermissions({disableJourneys:true},'owner').disableJourneys),false);
});

test('default navigation and every saved slot include journeys in CSS ordering',()=>{
 const {NAV_ITEMS,normalizeInterfaceAppearance,interfaceAppearanceVariables}=load('lib/interface-appearance.ts');
 assert.deepEqual([...NAV_ITEMS],['map','stops','journeys','admin','options']);
 assert.deepEqual(normalizeInterfaceAppearance({}).navOrder,[...NAV_ITEMS]);
 for(let position=0;position<5;position++){
  const order=NAV_ITEMS.filter(id=>id!=='journeys');order.splice(position,0,'journeys');
  const value=normalizeInterfaceAppearance({navOrder:order});
  assert.deepEqual(value.navOrder,order);
  const vars=interfaceAppearanceVariables(value,true,'#00a3a2',false);
  for(const [index,id] of order.entries())assert.equal(vars['--personal-nav-'+id],String(index));
 }
});
test('journey durations display hours without changing minute rounding',()=>{
 const {formatJourneyDuration:format}=load('lib/journey-duration.ts');
 for(const [minutes,label] of [[0,'0 min'],[9,'9 min'],[59,'59 min'],[60,'1 godz'],[61,'1 godz 1 min'],[90,'1 godz 30 min'],[120,'2 godz'],[125,'2 godz 5 min']])assert.equal(format(minutes*60000),label);
 assert.equal(format(59*60000+1),'1 godz');assert.equal(format(-1),'0 min');
});
