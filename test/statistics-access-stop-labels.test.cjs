const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
const {displayStopLabel,displayStopCatalogLabel,rzeszowTerminalPlatform}=loadTs('lib/stop-label.ts');
test('D.A. labels hide numbers and platform suffixes only for display',()=>{
 for(const name of ['Boguchwała D.A. 1','Boguchwała D.A 01','Boguchwała D.A.st. 2','Boguchwała D.A., 3','Boguchwała DA 05','Boguchwała d.a. stanowisko 6'])assert.equal(displayStopLabel(name),'Boguchwała D.A.');
 assert.equal(displayStopLabel('Rzeszów D.A. st. 5'),'Rzeszów D.A.');
 for(const name of ['Niebylec 2','Boguchwała, Stadion Motor 99','Rzeszów, Podkar.Kościół 07','Dąbrowa 1','Wola 12','Boguchwała D.A.'])assert.equal(displayStopLabel(name),name);
 const stops=[{id:'one',name:'Boguchwała D.A. 1'},{id:'two',name:'Boguchwała D.A. 2'}];stops.map(s=>displayStopLabel(s.name));assert.equal(stops[0].name,'Boguchwała D.A. 1');assert.notEqual(stops[0].id,stops[1].id);
});
test('Rzeszów terminal platforms are visible in stop labels but not vehicle labels or icons',()=>{
 for(const name of ['Rzeszów D.A. st. 5','RZESZÓW  D.A. 05','Rzeszów D.A.stanowisko 5','Rzeszow, DA 5']){
  assert.equal(rzeszowTerminalPlatform(name),'5');
  assert.match(displayStopCatalogLabel(name),/D\.A\. st\. 5$/);
  assert.doesNotMatch(displayStopLabel(name),/st\.|5/);
 }
 assert.equal(displayStopCatalogLabel('Rzeszów D.A.','02'),'Rzeszów D.A. st. 2');
 assert.equal(rzeszowTerminalPlatform('Rzeszów D.A. st. 5','2'),'5','name is authoritative');
 for(const name of ['Boguchwała D.A. 1','Rzeszów, Podkar.Kościół 07','Rzeszów D.A.']){
  assert.equal(rzeszowTerminalPlatform(name),null);
  assert.equal(displayStopCatalogLabel(name),displayStopLabel(name));
 }
 assert.equal(rzeszowTerminalPlatform('Rzeszów D.A.','<script>'),null);
 const {mapStopIconHtml}=loadTs('lib/map-stop-markers.ts');
 for(const selected of [false,true])assert.doesNotMatch(mapStopIconHtml('#14b8a6',selected),/map-stop-platform/);
});
const access=loadTs('lib/admin/statistics-access.ts');
test('statistics defaults preserve current admins, enforce owners and fail closed while loading',()=>{
 const admin={id:'admin',role:'admin',installationId:'android_123456789abcdef0'},owner={...admin,role:'owner'},user={...admin,role:'user'};
 assert.equal(access.statisticsPermission(admin,{}),true);
 assert.equal(access.statisticsPermission(admin,{android_123456789abcdef0:false}),false);
 assert.equal(access.statisticsPermission({...admin,id:'new-session'},{android_123456789abcdef0:false}),false);
 assert.equal(access.statisticsPermission(owner,{android_123456789abcdef0:false},false),true);
 assert.equal(access.statisticsPermission(user,{}),false);assert.equal(access.statisticsPermission(admin,{},false),false);
 assert.deepEqual(access.statisticsAccessChange(admin,'admin',false,{}),{key:'android_123456789abcdef0',enabled:false});
 assert.equal(access.statisticsAccessChange(admin,'admin',undefined,{}),null);
 assert.deepEqual(access.statisticsAccessChange(owner,'owner',false,{android_123456789abcdef0:false}),{key:'android_123456789abcdef0',enabled:true});
 assert.deepEqual(access.readStatisticsAccess({one:false,two:true,three:'false'}),{one:false,two:true});
});
test('statistics access remains outside stored device and installation permissions',()=>{
 const {buildDevicePermissions,normalizeAdminPermissions}=loadTs('lib/admin/rbac.ts');
 for(const role of ['admin','owner','user']){assert.equal(Object.hasOwn(buildDevicePermissions(role,{statistics:false}),'statistics'),false);assert.equal(Object.hasOwn(normalizeAdminPermissions({statistics:false},role),'statistics'),false);}
});

test('Wetlińska 05 display alias preserves raw stop data and every unrelated platform',()=>{
 const stop={id:'5320',name:'Rzeszów, Podkarpacka Kolonia 05',lat:50.01231,lon:21.96892,code:'05'};
 const original=structuredClone(stop);
 assert.equal(displayStopCatalogLabel(stop.name,stop.code),'Rzeszów, Podkarpacka / Wetlińska 05 nż');
 assert.deepEqual(stop,original);
 for(const name of ['Rzeszów, Podkarpacka Kolonia 06','Rzeszów, Podkarpacka kościół 05','Podkarpacka Kolonia 05','Rzeszów, Podkarpacka / Wetlińska 05 nż'])assert.equal(displayStopCatalogLabel(name),name);
});
