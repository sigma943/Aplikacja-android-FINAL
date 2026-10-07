const {test}=require('node:test');const assert=require('node:assert/strict');const loadTs=require('./load-ts.cjs');
function client(seed={}){
 const records=new Map(Object.entries(seed));const calls=[];
 const api=loadTs('lib/device-registration.ts',{'firebase/firestore':{doc:(_,...path)=>path.join('/'),serverTimestamp:()=> 'server-time',runTransaction:async(_,callback)=>{const writes=[];await callback({get:async ref=>{calls.push(ref);return{exists:()=>records.has(ref),data:()=>records.get(ref)}},set:(ref,data,options)=>writes.push(()=>records.set(ref,options?.merge?{...records.get(ref),...data}:data)),delete:ref=>writes.push(()=>records.delete(ref))});writes.forEach(write=>write());}}});return {...api,records,calls};
}
for(const role of ['owner','admin','user'])test(`reinstall transfers ${role} once with exact permissions, first login, name and ban`,async()=>{
 const installationId='android_0123456789abcdef';const permissions={monitor:role!=='user',canBan:false,disableStops:true};const profile={installationId,lastUid:'previous-uid',role,permissions,verified:role!=='user',status:'banned',banDetails:{reason:'retain ban',expiresAt:''},displayName:'Operator'};
 const c=client({'devices/previous-uid':{...profile,firstLogin:'2026-01-01',deviceName:'My phone'},[`installations/${installationId}`]:profile});
 await c.registerRestoredDevice({},'new-uid',installationId,'Poco F8 Pro',true,{reason:'auto'});
 assert.equal([...c.records.keys()].filter(key=>key.startsWith('devices/')).length,1);const record=c.records.get('devices/new-uid');
 assert.deepEqual(record.permissions,permissions);assert.equal(record.role,role);assert.equal(record.firstLogin,'2026-01-01');assert.equal(record.deviceName,'My phone');assert.equal(record.displayName,'Operator');assert.deepEqual(record.banDetails,profile.banDetails);
 assert.equal(c.records.get(`installations/${installationId}`).lastUid,'new-uid');
 await c.registerRestoredDevice({},'new-uid',installationId,'Other',false,{});assert.equal(c.records.get('devices/new-uid'),record);
});
test('unrelated previous record is never deleted',async()=>{const c=client({'installations/android_aabbccddeeff0011':{lastUid:'other-uid'},'devices/other-uid':{installationId:'different'}});await c.registerRestoredDevice({},'new-uid','android_aabbccddeeff0011','Phone',false,{});assert.ok(c.records.has('devices/other-uid'));});
test('Android ID survives cache loss and native reader fallback; transient failures never generate UUID',async()=>{const c=client();const fail=async()=>{throw Error('temporarily unavailable')};assert.equal(await c.stableAndroidInstallationId(async()=> '0123456789ABCDEF',fail),'android_0123456789abcdef');assert.equal(await c.stableAndroidInstallationId(fail,async()=> '0123456789abcdef'),'android_0123456789abcdef');assert.equal(await c.stableAndroidInstallationId(fail,fail,'android_0123456789abcdef'),'android_0123456789abcdef');await assert.rejects(c.stableAndroidInstallationId(fail,fail),/identyfikatora Androida/);});
