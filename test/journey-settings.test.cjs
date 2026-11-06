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

test('owners keep every tab despite stored restrictions; other roles retain their restrictions',()=>{
 const {buildDevicePermissions,normalizeAdminPermissions,canUseJourneys}=load('lib/admin/rbac.ts');
 const ts=require('typescript'),fs=require('node:fs');
 const source=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),names=['isMapTabDisabled','isJourneysTabDisabled','isStopsTabDisabled'],found={};
 const visit=n=>{if(ts.isVariableDeclaration(n)&&names.includes(n.name.getText(source)))found[n.name.getText(source)]=n.initializer.getText(source);ts.forEachChild(n,visit);};visit(source);
 const access=new Function('device','canUseJourneys',names.map(n=>'const '+n+'='+found[n]+';').join('')+'return ['+names.join(',')+'];');
 for(const flags of [{disableMap:true},{disableStops:true},{disableMap:true,disableStops:true,disableJourneys:true,journeys:false}]){
  assert.deepEqual(access({role:'owner',permissions:flags},canUseJourneys),[false,false,false]);
  for(const row of [normalizeAdminPermissions(flags,'owner'),buildDevicePermissions('owner',flags)]){assert.equal(row.disableMap,false);assert.equal(row.disableStops,false);assert.notEqual(row.disableJourneys,true);}
 }
 for(const role of ['user','admin']){
  assert.deepEqual(access({role,permissions:{disableMap:true}},canUseJourneys),[true,true,false]);
  assert.deepEqual(access({role,permissions:{disableStops:true,journeys:true}},canUseJourneys),[false,false,true]);
 }
});
test('owner role modal blocks all three tab toggles and saves unrestricted access',async()=>{
 const React=require('react');let updates=0,saved;
 const mockReact={...React,useState:init=>[typeof init==='function'?init():init,()=>updates++],useEffect:()=>{}};
 const {RolesModal}=load('app/admin/components/RolesModal.tsx',{react:mockReact,'./AdminModalPortal':{AdminModalPortal:({children})=>children},'motion/react':{motion:{div:'div'},AnimatePresence:React.Fragment}});
 const tree=RolesModal({device:{id:'other-owner',rawRole:'owner',role:'Właściciel',name:'Owner',permissions:{disableMap:true,disableStops:true,disableJourneys:true}},canAssignOwner:true,canManageTabAccess:true,onClose:()=>{},onUpdateUser:()=>{},onSave:(...args)=>{saved=args;}});
 const buttons=[];function visit(node){if(!React.isValidElement(node))return;if(node.type==='button')buttons.push(node);React.Children.forEach(node.props.children,visit);}visit(tree);
 const text=node=>typeof node==='string'?node:React.isValidElement(node)?React.Children.toArray(node.props.children).map(text).join(''):'';
 for(const title of ['Połączenia','Mapa','Przystanki']){
  const button=buttons.find(b=>text(b).includes(title));assert.ok(button,title);assert.equal(Boolean(button.props.disabled),true,title);assert.match(text(button),/Właściciel ma zawsze dostęp/);
  const switches=[];const findSwitch=node=>{if(!React.isValidElement(node))return;if(node.props.role==='switch')switches.push(node);React.Children.forEach(node.props.children,findSwitch);};findSwitch(button);
  assert.equal(switches.length,1);assert.equal(switches[0].props['aria-checked'],true);assert.match(switches[0].props.className,/justify-end/);assert.doesNotMatch(text(button),/Wyłącz/);
  button.props.onClick();assert.equal(updates,0,'even a stale click handler cannot change owner restrictions');
 }
 await buttons.find(b=>text(b).includes('Zapisz zmiany')).props.onClick();
 assert.equal(saved[0],'WŁAŚCICIEL');for(const key of ['disableMap','disableStops','disableJourneys'])assert.equal(saved[1][key],false);
});
