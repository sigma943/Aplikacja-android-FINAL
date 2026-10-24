const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
test('journeys can be the start screen and old navigation orders gain one movable journeys entry',()=>{
 const {normalizeInterfaceAppearance}=load('lib/interface-appearance.ts');
 const old=normalizeInterfaceAppearance({navOrder:['options','map','stops','admin']});assert.deepEqual(old.navOrder,['options','map','stops','journeys','admin']);
 const saved=normalizeInterfaceAppearance({startScreen:'journeys',navOrder:['journeys','stops','map','options','admin','journeys']});assert.equal(saved.startScreen,'journeys');assert.equal(saved.navOrder[0],'journeys');assert.equal(saved.navOrder.filter(x=>x==='journeys').length,1);
});
test('journeys is opt-in for users and admins, with an automatic owner bypass',()=>{
 const {canUseJourneys,buildDevicePermissions,normalizeAdminPermissions}=load('lib/admin/rbac.ts');
 assert.equal(canUseJourneys(undefined,undefined),false);
 for(const role of ['user','admin']){
  for(const permissions of [undefined,{}, {disableJourneys:false},buildDevicePermissions(role)])assert.equal(canUseJourneys(role,permissions),false);
  const granted=buildDevicePermissions(role,{journeys:true,disableMap:true});
  assert.equal(granted.journeys,true);assert.equal(canUseJourneys(role,JSON.parse(JSON.stringify(granted))),true);
  assert.equal(canUseJourneys(role,{journeys:true,disableJourneys:true}),false);
  assert.equal(canUseJourneys(role,buildDevicePermissions(role,{journeys:false})),false);
  assert.equal(normalizeAdminPermissions(granted,role).journeys,true);
 }
 assert.equal(canUseJourneys('owner',undefined),true);assert.equal(canUseJourneys('owner',{journeys:false,disableJourneys:true}),true);
 assert.equal('journeys' in buildDevicePermissions('user'),false,'new installations never write an opt-in');
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
