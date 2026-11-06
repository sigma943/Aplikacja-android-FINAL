const {test}=require('node:test'),assert=require('node:assert/strict'),load=require('./load-ts.cjs');
const {banExpiryTime,hasExpiredBan}=load('lib/ban-expiry.ts');
const now=Date.parse('2026-11-02T12:00:00.000Z');
const device=(expiresAt,status='banned')=>({status,banDetails:{expiresAt}});
test('temporary bans expire exactly at the saved deadline, permanent/invalid bans remain',()=>{
 assert.equal(hasExpiredBan(device(new Date(now).toISOString()),now),true);
 assert.equal(hasExpiredBan(device(new Date(now+1).toISOString()),now),false);
 for(const value of ['',undefined,null,42,'bad']){assert.equal(banExpiryTime(device(value)),null);assert.equal(hasExpiredBan(device(value),now),false);}
 assert.equal(hasExpiredBan(device('2000-01-01T00:00:00Z','active'),now),false);
 assert.equal(hasExpiredBan(device('2026-11-02T13:00:00+01:00'),now),true);
});
function transactionFixture(row,profile={role:'user',status:'banned'}){
 const writes=[],reads=[];
 const snapshot=data=>({exists:()=>Boolean(data),data:()=>data});
 const sdk={doc:(_db,...parts)=>parts.join('/'),deleteField:()=>'<delete>',serverTimestamp:()=>'<server-time>',runTransaction:async(_db,run)=>run({get:async ref=>{reads.push(ref);return snapshot(ref.startsWith('devices/')?row:profile);},update:(ref,patch)=>writes.push({ref,patch}),set:(ref,patch)=>writes.push({ref,patch})})};
 return {...load('lib/expire-device-ban.ts',{'firebase/firestore':sdk}),writes,reads};
}
test('expiry transaction reads fresh state and clears device/profile without changing role or permissions',async()=>{
 const f=transactionFixture({...device('2000-01-01T00:00:00Z'),installationId:'install',role:'user',permissions:{ban:false}});
 assert.equal(await f.expireDeviceBan({},'user','user'),true);
 assert.deepEqual(f.reads,['devices/user']);
 assert.deepEqual(f.writes,[{ref:'devices/user',patch:{status:'active',verified:true,banDetails:'<delete>'}},{ref:'installations/install',patch:{status:'active',verified:true,banDetails:'<delete>',installationId:'install',role:'user',permissions:{ban:false},loginApproved:true,updatedBy:'user',updatedAt:'<server-time>'}}]);
});
test('extended, permanent, removed or already-cleared bans cannot be removed by a stale timer',async()=>{
 for(const row of [null,device(''),device('invalid'),device('2999-01-01T00:00:00Z'),device('2000-01-01T00:00:00Z','active')]){
  const f=transactionFixture(row);assert.equal(await f.expireDeviceBan({},'user','user'),false);assert.deepEqual(f.writes,[]);
 }
});
test('an absent legacy installation does not prevent removing an expired device ban',async()=>{
 const f=transactionFixture(device('2000-01-01T00:00:00Z'),null);
 assert.equal(await f.expireDeviceBan({},'user','admin'),true);assert.equal(f.writes.length,1);
});
