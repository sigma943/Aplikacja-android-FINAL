const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, writeBatch } = require('firebase/firestore');
const loadTs = require('./load-ts.cjs');
const { buildDevicePermissions } = loadTs('lib/admin/rbac.ts');
const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
assert.match(emulatorAddress, /^(127\.0\.0\.1|localhost):[0-9]+$/, 'Rules tests require a loopback emulator');
const [emulatorHost, emulatorPort] = emulatorAddress.split(':');
let env;
const device = (role, installationId, permissions = buildDevicePermissions(role)) => ({
  role, permissions, installationId, verified: role !== 'user', status:'active',
  deviceInfo:'Test', firstLogin:'2026-10-05',
});
before(async () => {
  env = await initializeTestEnvironment({ projectId:'demo-pks-live', firestore:{
    host:emulatorHost,port:Number(emulatorPort),rules:fs.readFileSync('firestore.rules','utf8'),
  }});
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db,'devices','owner'), device('owner','owner-install'));
    await setDoc(doc(db,'devices','admin'), device('admin','admin-install',buildDevicePermissions('admin',{canChangeRoles:true})));
    await setDoc(doc(db,'devices','user'),device('user','user-install'));
    await setDoc(doc(db,'admin_settings','security'),{autoBan:false});
  });
});

test('runtime routing is readable but rejects unauthorized or inconsistent direct edits', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'admin_settings', 'transport_runtime'), { endpointId: 'backup', endpointUrl: 'https://api.example', fallbackEnabled: true });
    await setDoc(doc(context.firestore(), 'maintenance_endpoints', 'backup'), { name: 'Backup', url: 'https://api.example' });
  });
  const user = env.authenticatedContext('user').firestore();
  const owner = env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(user, 'admin_settings', 'transport_runtime')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'admin_settings', 'transport_runtime')));
  await assertFails(updateDoc(doc(user, 'admin_settings', 'transport_runtime'), { endpointUrl: 'https://changed.example' }));
  await assertFails(updateDoc(doc(owner, 'admin_settings', 'transport_runtime'), { endpointUrl: 'https://changed.example' }));
  await assertFails(getDoc(doc(user, 'maintenance_endpoints', 'backup')));
  await assertSucceeds(getDoc(doc(owner, 'maintenance_endpoints', 'backup')));
});

test('owner atomically grants a role and creates a previously missing installation profile', async () => {
  const db = env.authenticatedContext('owner').firestore();
  const batch = writeBatch(db);
  const permissions = buildDevicePermissions('admin');
  batch.update(doc(db,'devices','user'),{role:'admin',permissions,verified:true});
  batch.set(doc(db,'installations','user-install'),{installationId:'user-install',role:'admin',permissions,status:'active',verified:true,updatedBy:'owner'});
  await assertSucceeds(batch.commit());
});

for (const role of ['admin', 'owner']) {
  test(`reinstall restores ${role} and exact permissions from the saved device identifier`, async () => {
    const installationId = 'android_0123456789abcdef';
    const permissions = buildDevicePermissions(role, { canBan: false });
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'installations', installationId), {
        installationId, role, permissions, verified: true, status: 'active', updatedBy: 'owner', lastUid: 'removed-installation-uid',
      });
    });
    const db = env.authenticatedContext('reinstalled-uid').firestore();
    const saved = (await assertSucceeds(getDoc(doc(db, 'installations', installationId)))).data();
    await assertSucceeds(setDoc(doc(db, 'devices', 'reinstalled-uid'), device(saved.role, installationId, saved.permissions)));
    assert.deepStrictEqual((await getDoc(doc(db, 'devices', 'reinstalled-uid'))).data().permissions, permissions);
    await assertFails(setDoc(doc(db, 'devices', 'another-uid'), device(saved.role, installationId, permissions)));
  });
}

test('another physical device cannot restore a privileged role from a missing installation profile', async () => {
  const db = env.authenticatedContext('new-phone').firestore();
  await assertFails(setDoc(doc(db, 'devices', 'new-phone'), device('owner', 'android_different_device')));
});
test('admin can grant only its own capabilities to a user', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const batch = writeBatch(db);
  const permissions = buildDevicePermissions('admin');
  batch.update(doc(db,'devices','user'),{role:'admin',permissions,verified:true});
  batch.set(doc(db,'installations','user-install'),{installationId:'user-install',role:'admin',permissions,status:'active',verified:true,updatedBy:'admin'});
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(doc(db,'devices','owner'),{role:'user',permissions:buildDevicePermissions('user')}));
});
test('users cannot promote themselves through device or installation', async () => {
  const db = env.authenticatedContext('user').firestore();
  await assertFails(updateDoc(doc(db,'devices','user'),{role:'owner'}));
  await assertFails(setDoc(doc(db,'installations','user-install'),{installationId:'user-install',role:'owner',permissions:buildDevicePermissions('owner'),status:'active',verified:true,updatedBy:'user'}));
});
test('an admin may recreate its own exact profile without changing its privileges', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const data = device('admin','admin-install',buildDevicePermissions('admin',{canChangeRoles:true}));
  const profile = { installationId:'admin-install',role:data.role,permissions:data.permissions,status:data.status,verified:data.verified,updatedBy:'admin' };
  await assertSucceeds(setDoc(doc(db,'installations','admin-install'),profile));
  await assertFails(updateDoc(doc(db,'installations','admin-install'),{role:'owner',permissions:buildDevicePermissions('owner')}));
});
test('legacy admin can list devices; explicit modern ban revocation wins', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(),'devices','legacy'),device('admin','legacy-install',{canViewList:true,canBan:true,ban:false}));
  });
  const db = env.authenticatedContext('legacy').firestore();
  await assertSucceeds(getDocs(collection(db,'devices')));
  await assertFails(updateDoc(doc(db,'devices','user'),{status:'banned',banDetails:{reason:'Test'}}));
});
test('regular user registration still works without Cloud Functions', async () => {
  const db = env.authenticatedContext('new-user').firestore();
  await assertSucceeds(setDoc(doc(db,'devices','new-user'),device('user','new-install')));
  await assertSucceeds(setDoc(doc(db,'installations','new-install'),{installationId:'new-install',role:'user',permissions:buildDevicePermissions('user'),status:'active',verified:false,updatedBy:'new-user'}));
});

test('ban and unban still synchronize a missing legacy installation profile', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const permissions = buildDevicePermissions('user');
  const banDetails = {reason:'Test',expiresAt:'',gifUrl:''};
  const batch = writeBatch(db);
  batch.update(doc(db,'devices','user'),{status:'banned',banDetails,verified:false});
  batch.set(doc(db,'installations','user-install'),{installationId:'user-install',role:'user',permissions,status:'banned',verified:false,banDetails,updatedBy:'admin'});
  await assertSucceeds(batch.commit());
  const unban = writeBatch(db);
  unban.update(doc(db,'devices','user'),{status:'active',verified:true});
  unban.update(doc(db,'installations','user-install'),{status:'active',verified:true});
  await assertSucceeds(unban.commit());
});

const firebaseSdk = require('firebase/firestore');
const sparkClient = (uid, firestore) => loadTs('lib/maintenance-spark.ts', {
  './firebase': { db: firestore, auth: { currentUser: { uid } } },
  '@capacitor/core': { Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request: async ({ url }) => ({ status: 200, data: url.endsWith('/pks/get_vehicles.php') ? [] : { providers: { pks: { state: 'ok' } } } }) } },
  'firebase/firestore': firebaseSdk,
});
const endpointDraft = { id: '', name: 'Spark backup', url: 'https://backup.example/api', role: 'backup', priority: 2, region: 'PL', source: 'Firestore', enabled: true, active: false, fallbackEnabled: true };

test('Spark client migrates the legacy profile, persists, tests, activates, rolls back and disables with real Firestore rules', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const legacyUrl = 'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi';
    await setDoc(doc(db, 'maintenance_endpoints', 'default-transport-api'), { name: 'Główny (PROD)', role: 'production', priority: 1, region: 'PL', source: 'Firestore', enabled: true, fallbackEnabled: true, url: legacyUrl, active: true, createdAt: firebaseSdk.serverTimestamp(), updatedAt: firebaseSdk.serverTimestamp(), updatedBy: 'system' });
    await setDoc(doc(db, 'admin_settings', 'maintenance'), { activeEndpointId: 'default-transport-api', previousEndpointId: '', updatedAt: firebaseSdk.serverTimestamp(), updatedBy: 'system' });
    await setDoc(doc(db, 'admin_settings', 'transport_runtime'), { endpointId: 'default-transport-api', endpointUrl: legacyUrl, fallbackEnabled: true, updatedAt: firebaseSdk.serverTimestamp(), updatedBy: 'system' });
  });
  try {
    const db = env.authenticatedContext('owner').firestore();
    const client = sparkClient('owner', db);
    await client.callInitialize({});
    const initial = (await getDoc(doc(db, 'admin_settings', 'transport_runtime'))).data();
    assert.equal(initial.endpointId, 'default-transport-api');
    assert.equal(initial.endpointUrl, 'https://www.mpkrzeszow.pl/pks');
    assert.equal((await getDoc(doc(db, 'maintenance_endpoints', initial.endpointId))).data().lastTest, null);
    const { data: { endpointId } } = await client.callSaveEndpoint({ endpoint: endpointDraft });
    assert.ok(endpointId);
    assert.equal((await getDocs(collection(db, 'maintenance_endpoints'))).size, 2);
    assert.equal((await client.callTestEndpoint({ endpointId })).data.result.ok, true);
    await client.callSetActive({ endpointId });
    assert.equal((await getDoc(doc(db, 'admin_settings', 'transport_runtime'))).data().endpointUrl, endpointDraft.url);
    await assert.rejects(client.callDisable({ endpointId }), /Najpierw aktywuj/);
    await client.callRollback({});
    assert.equal((await getDoc(doc(db, 'admin_settings', 'transport_runtime'))).data().endpointId, initial.endpointId);
    await client.callDisable({ endpointId });
    await client.callSaveEndpoint({ endpoint: { ...endpointDraft, id: endpointId, enabled: true } });
    assert.equal((await getDoc(doc(db, 'maintenance_endpoints', endpointId))).data().enabled, true);
    const history = (await getDocs(collection(db, 'maintenance_changes'))).docs.map(s => s.data());
    for (const action of ['save', 'test', 'activate', 'rollback', 'disable']) assert.ok(history.some(row => row.action === action));
    assert.ok(history.every(row => row.actorId === 'owner' && row.createdAt.toMillis() > 0));
    const first = (await getDocs(collection(db, 'maintenance_changes'))).docs[0];
    await assertFails(updateDoc(first.ref, { summary: 'rewritten' }));
    await assertFails(updateDoc(doc(db, 'maintenance_endpoints', initial.endpointId), { enabled: false, updatedAt: firebaseSdk.serverTimestamp(), updatedBy: 'owner' }));
    const user = sparkClient('user', env.authenticatedContext('user').firestore());
    await assert.rejects(user.callSaveEndpoint({ endpoint: endpointDraft }), error => error.code === 'permission-denied');
    await assertFails(setDoc(doc(env.authenticatedContext('user').firestore(), 'maintenance_endpoints', 'forged'), endpointDraft));
    await assertFails(getDocs(collection(env.authenticatedContext('user').firestore(), 'maintenance_changes')));
  } finally { /* Health requests are isolated from the emulator transport. */ }
});

test('Spark read-only admin can diagnose without writes; editor can persist; banned owner cannot mutate', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'devices', 'viewer'), device('admin', 'viewer-install', { globalSettings: true }));
    await setDoc(doc(db, 'devices', 'editor'), device('admin', 'editor-install', { globalSettingsEdit: true }));
    await setDoc(doc(db, 'devices', 'banned'), { ...device('owner', 'banned-install'), status: 'banned' });
  });
  try {
    const editor = sparkClient('editor', env.authenticatedContext('editor').firestore());
    await editor.callInitialize({});
    const { data: { endpointId } } = await editor.callSaveEndpoint({ endpoint: endpointDraft });
    const db = env.authenticatedContext('viewer').firestore();
    const viewer = sparkClient('viewer', db);
    await viewer.callInitialize({});
    assert.equal((await viewer.callTestEndpoint({ endpointId })).data.result.ok, true);
    await assert.rejects(viewer.callSetActive({ endpointId }), error => error.code === 'permission-denied');
    await assertFails(updateDoc(doc(db, 'maintenance_endpoints', endpointId), { enabled: false, updatedBy: 'viewer', updatedAt: firebaseSdk.serverTimestamp() }));
    const banned = sparkClient('banned', env.authenticatedContext('banned').firestore());
    await assert.rejects(banned.callSaveEndpoint({ endpoint: endpointDraft }), error => error.code === 'permission-denied');
    await assertFails(updateDoc(doc(env.authenticatedContext('banned').firestore(), 'maintenance_endpoints', endpointId), { enabled: false, updatedBy: 'banned', updatedAt: firebaseSdk.serverTimestamp() }));
  } finally { /* Health requests are isolated from the emulator transport. */ }
});

for(const role of ['owner','admin','user'])test(`atomic physical-device transfer preserves ${role} and removes previous UID including ban`,async()=>{
 const id='android_0123456789abcdef';const previousUid='previous-uid';const permissions=buildDevicePermissions(role,{canBan:false});
 const saved={...device(role,id,permissions),status:'banned',banDetails:{reason:'retain',expiresAt:'',gifUrl:''},lastUid:previousUid,updatedBy:'owner',displayName:'Operator',deviceName:'My phone'};
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'devices',previousUid),saved);await setDoc(doc(db,'installations',id),saved);});
 const db=env.authenticatedContext('new-device-uid').firestore();
 const {registerRestoredDevice}=loadTs('lib/device-registration.ts',{'firebase/firestore':firebaseSdk});
 await assertSucceeds(registerRestoredDevice(db,'new-device-uid',id,'Poco F8 Pro',false,{}));
 const record=(await getDoc(doc(db,'devices','new-device-uid'))).data();
 assert.equal(record.role,role);assert.deepStrictEqual(record.permissions,permissions);assert.equal(record.status,'banned');assert.deepStrictEqual(record.banDetails,saved.banDetails);assert.equal(record.firstLogin,saved.firstLogin);assert.equal(record.deviceName,'My phone');
 await env.withSecurityRulesDisabled(async context=>{assert.equal((await getDoc(doc(context.firestore(),'devices',previousUid))).exists(),false);});
 assert.equal((await getDoc(doc(db,'installations',id))).data().lastUid,'new-device-uid');
 // A second reinstall uses the just-transferred profile, without accumulating another device.
 const nextDb=env.authenticatedContext('next-device-uid').firestore();
 await assertSucceeds(registerRestoredDevice(nextDb,'next-device-uid',id,'Phone',false,{}));
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();assert.equal((await getDoc(doc(db,'devices','new-device-uid'))).exists(),false);assert.equal((await getDoc(doc(db,'devices','next-device-uid'))).exists(),true);});
});
test('restore works if the prior UID document is already absent; failed transfer cannot delete another device',async()=>{
 const id='android_0123456789abcdef';const saved={...device('admin',id),lastUid:'missing-previous-uid',updatedBy:'owner'};
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'installations',id),saved));
 const db=env.authenticatedContext('fresh-uid').firestore();const {registerRestoredDevice}=loadTs('lib/device-registration.ts',{'firebase/firestore':firebaseSdk});
 await assertSucceeds(registerRestoredDevice(db,'fresh-uid',id,'Phone',false,{}));
 const attackerDb=env.authenticatedContext('attacker-uid').firestore();
 const batch=writeBatch(attackerDb);
 batch.delete(doc(attackerDb,'devices','user'));
 await assertFails(batch.commit());
 const unsafeDb=env.authenticatedContext('unverified-new-uid').firestore();
 await assertFails(setDoc(doc(unsafeDb,'devices','unverified-new-uid'),device('user','unsafe-install',buildDevicePermissions('owner'))));
});

test('owner reinstallation starts under the previously deployed rules and removes the old record',async()=>{
 const legacy=await initializeTestEnvironment({projectId:'demo-pks-legacy',firestore:{host:emulatorHost,port:Number(emulatorPort),rules:fs.readFileSync('test/fixtures/firestore-before-device-transfer.rules','utf8')}});
 try{
  await legacy.clearFirestore();const id='android_0123456789abcdef';const saved={...device('owner',id),lastUid:'previous-owner-uid',updatedBy:'owner',displayName:'Owner',firstLogin:'2026-01-01'};
  await legacy.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'devices','previous-owner-uid'),saved);await setDoc(doc(db,'installations',id),saved);await setDoc(doc(db,'admin_settings','security'),{autoBan:false});});
  const db=legacy.authenticatedContext('reinstalled-owner-uid').firestore();
  const {registerRestoredDevice}=loadTs('lib/device-registration.ts',{'firebase/firestore':firebaseSdk});
  await assertSucceeds(registerRestoredDevice(db,'reinstalled-owner-uid',id,'Phone',false,{}));
  assert.equal((await getDoc(doc(db,'devices','reinstalled-owner-uid'))).data().role,'owner');
  assert.equal((await getDoc(doc(db,'devices','previous-owner-uid'))).exists(),false);
  assert.equal((await getDoc(doc(db,'installations',id))).data().lastUid,'reinstalled-owner-uid');
 }finally{await legacy.cleanup();}
});
test('maintenance editor clears history on Spark; read-only admin and users cannot delete it',async()=>{
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'maintenance_changes','entry-one'),{action:'test',createdAt:firebaseSdk.Timestamp.now(),summary:'Event'});await setDoc(doc(db,'devices','viewer'),device('admin','viewer-install',{globalSettings:true}));});
 const user=sparkClient('user',env.authenticatedContext('user').firestore());
 const viewer=sparkClient('viewer',env.authenticatedContext('viewer').firestore());
 await assert.rejects(user.callClearHistory({}),e=>e.code==='permission-denied');await assert.rejects(viewer.callClearHistory({}),e=>e.code==='permission-denied');
 await assertFails(firebaseSdk.deleteDoc(doc(env.authenticatedContext('viewer').firestore(),'maintenance_changes','entry-one')));
 const ownerDb=env.authenticatedContext('owner').firestore();const result=await assertSucceeds(sparkClient('owner',ownerDb).callClearHistory({}));assert.equal(result.data.deletedCount,1);assert.equal((await getDocs(collection(ownerDb,'maintenance_changes'))).size,0);
});

test('owner atomically saves statistics access with existing device schema and preserves security settings',async()=>{
 const db=env.authenticatedContext('owner').firestore();
 await assertSucceeds(setDoc(doc(db,'admin_settings','security'),{loginEnabled:true,maintenanceMode:false,autoBan:false,hiddenProviderIds:['marcel']}));
 const batch=writeBatch(db);batch.update(doc(db,'devices','admin'),{permissions:buildDevicePermissions('admin')});batch.set(doc(db,'admin_settings','statistics_access'),{statisticsAccess:{'admin-install':false}},{merge:true});await assertSucceeds(batch.commit());
 const saved=(await getDoc(doc(db,'admin_settings','security'))).data();assert.equal(saved.loginEnabled,true);assert.deepEqual(saved.hiddenProviderIds,['marcel']);assert.equal(saved.statisticsAccess,undefined);
 const adminDb=env.authenticatedContext('admin').firestore();assert.equal((await assertSucceeds(getDoc(doc(adminDb,'admin_settings','statistics_access')))).data().statisticsAccess['admin-install'],false);
 await assertFails(setDoc(doc(adminDb,'admin_settings','statistics_access'),{statisticsAccess:{'admin-install':true}},{merge:true}));
 await assertFails(setDoc(doc(env.authenticatedContext('user').firestore(),'admin_settings','statistics_access'),{statisticsAccess:{'admin-install':true}},{merge:true}));
});
test('closed new logins require a pending device and installation; callers cannot approve themselves',async()=>{
 const owner=env.authenticatedContext('owner').firestore();await updateDoc(doc(owner,'admin_settings','security'),{loginEnabled:false});
 const db=env.authenticatedContext('pending-device').firestore(),id='android_pending_device';
 const pending={...device('user',id),loginApproved:false};
 await assertFails(setDoc(doc(db,'devices','pending-device'),device('user',id)));
 await assertFails(setDoc(doc(db,'devices','pending-device'),{...pending,loginApproved:true}));
 await assertFails(setDoc(doc(db,'installations',id),{...pending,loginApproved:true,updatedBy:'pending-device'}));
 const batch=writeBatch(db);batch.set(doc(db,'devices','pending-device'),pending);batch.set(doc(db,'installations',id),{...pending,lastUid:'pending-device',updatedBy:'pending-device'});await assertSucceeds(batch.commit());
 await assertSucceeds(getDoc(doc(db,'devices','pending-device')));
 await assertFails(updateDoc(doc(db,'devices','pending-device'),{loginApproved:true}));
 await assertFails(updateDoc(doc(db,'installations',id),{loginApproved:true}));
 await assertSucceeds(updateDoc(doc(owner,'devices','pending-device'),{verified:true}));
 const saved=(await getDoc(doc(db,'devices','pending-device'))).data();
 await assertSucceeds(setDoc(doc(db,'installations',id),{...saved,lastUid:'pending-device',updatedBy:'pending-device'}));
});
test('pending reinstall cannot change approval even after global logins reopen',async()=>{
 const id='android_3123456789abcdef';
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'installations',id),{...device('user',id),loginApproved:false,lastUid:'prior-pending'});await setDoc(doc(db,'devices','prior-pending'),{...device('user',id),loginApproved:false});});
 const db=env.authenticatedContext('next-pending').firestore();
 await assertFails(setDoc(doc(db,'devices','next-pending'),{...device('user',id),loginApproved:true}));
 const batch=writeBatch(db);const pending={...device('user',id),loginApproved:false};batch.set(doc(db,'devices','next-pending'),pending);batch.set(doc(db,'installations',id),{...pending,lastUid:'next-pending',updatedBy:'next-pending'});batch.delete(doc(db,'devices','prior-pending'));await assertSucceeds(batch.commit());
});

test('users and fresh anonymous accounts cannot enumerate installation identities', async () => {
  await env.withSecurityRulesDisabled(async context => {
    for (const role of ['owner', 'admin', 'user']) {
      await setDoc(doc(context.firestore(), 'installations', `${role}-install`), {
        ...device(role, `${role}-install`), lastUid: role, updatedBy: 'owner',
      });
    }
  });
  for (const uid of ['user', 'fresh-anonymous']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDocs(collection(db, 'installations')));
    await assertFails(getDocs(firebaseSdk.query(collection(db, 'installations'), firebaseSdk.limit(1))));
    await assertFails(getDocs(collection(db, 'devices')));
    await assertFails(getDoc(doc(db, 'admin_settings', 'statistics_access')));
    await assertFails(getDocs(collection(db, 'admin_logs')));
    await assertFails(getDoc(doc(db, 'devices', 'owner')));
  }
  const db = env.authenticatedContext('user').firestore();
  await assertSucceeds(getDoc(doc(db, 'installations', 'user-install')));
  await assertFails(getDoc(doc(db, 'installations', 'owner-install')));
  await assertFails(getDoc(doc(db, 'devices', 'owner')));
  for (const uid of ['owner', 'admin']) {
    await assertSucceeds(getDocs(collection(env.authenticatedContext(uid).firestore(), 'installations')));
  }
});

test('statistics identifiers stay private while public startup settings remain readable', async () => {
  const db = env.authenticatedContext('owner').firestore();
  await assertSucceeds(setDoc(doc(db, 'admin_settings', 'statistics_access'), {
    statisticsAccess: { 'owner-install': true, 'admin-install': false },
  }));
  // Reject accidentally reintroducing installation IDs into a public document.
  await assertFails(setDoc(doc(db, 'admin_settings', 'security'), { statisticsAccess: { 'owner-install': true } }, { merge: true }));
  for (const uid of ['user', 'fresh-anonymous']) {
    const client = env.authenticatedContext(uid).firestore();
    const security = (await assertSucceeds(getDoc(doc(client, 'admin_settings', 'security')))).data();
    assert.equal(security.statisticsAccess, undefined);
    await assertFails(getDoc(doc(client, 'admin_settings', 'statistics_access')));
  }
  await assertSucceeds(getDoc(doc(env.authenticatedContext('admin').firestore(), 'admin_settings', 'statistics_access')));
  await assertFails(setDoc(doc(env.authenticatedContext('admin').firestore(), 'admin_settings', 'statistics_access'), { statisticsAccess: {} }));
});

test('settings migration is atomic, idempotent and leaves identities and public policies unchanged', async () => {
  const { migrateStatisticsAccess } = require('../scripts/lib/migrate-statistics-access.cjs');
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const source = { autoBan: true, loginEnabled: false, maintenanceMode: true, hiddenProviderIds: ['marcel'], statisticsAccess: { 'owner-install': true, 'admin-install': false, 'conflict-install': false } };
    await setDoc(doc(db, 'admin_settings', 'security'), source);
    await setDoc(doc(db, 'admin_settings', 'statistics_access'), { statisticsAccess: { 'conflict-install': true, 'new-admin': false } });
    const ownerBefore = (await getDoc(doc(db, 'devices', 'owner'))).data();
    const adapter = { doc: path => doc(db, ...path.split('/')), runTransaction: callback => firebaseSdk.runTransaction(db, callback) };
    assert.deepEqual(await migrateStatisticsAccess(adapter, firebaseSdk.deleteField), { migrated: true });
    assert.deepEqual(await migrateStatisticsAccess(adapter, firebaseSdk.deleteField), { migrated: false });
    const { statisticsAccess, ...publicPolicy } = source;
    assert.deepEqual((await getDoc(doc(db, 'admin_settings', 'security'))).data(), publicPolicy);
    assert.deepEqual((await getDoc(doc(db, 'admin_settings', 'statistics_access'))).data().statisticsAccess, { ...statisticsAccess, 'new-admin': false });
    assert.deepEqual((await getDoc(doc(db, 'devices', 'owner'))).data(), ownerBefore);
    await setDoc(doc(db, 'admin_settings', 'security'), { statisticsAccess: { bad: 'invalid' } }, { merge: true });
    await assert.rejects(migrateStatisticsAccess(adapter, firebaseSdk.deleteField), /migration stopped/);
    assert.equal((await getDoc(doc(db, 'admin_settings', 'security'))).data().statisticsAccess.bad, 'invalid');
  });
});

for (const role of ['owner', 'admin', 'user']) test(`closed admission and auto-ban do not change saved ${role} on reinstall`, async () => {
  const id = 'android_4123456789abcdef';
  const saved = { ...device(role, id), lastUid: 'previous-device', loginApproved: true, updatedBy: 'owner', firstLogin: '2025-01-01',
    ...(role === 'user' ? { status: 'banned', banDetails: { reason: 'retain', expiresAt: '', silent: true } } : {}) };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'admin_settings', 'security'), { loginEnabled: false, autoBan: true });
    await setDoc(doc(db, 'devices', 'previous-device'), saved);
    await setDoc(doc(db, 'installations', id), saved);
  });
  const db = env.authenticatedContext('reinstalled-device').firestore();
  const { registerRestoredDevice } = loadTs('lib/device-registration.ts', { 'firebase/firestore': firebaseSdk });
  await assertSucceeds(registerRestoredDevice(db, 'reinstalled-device', id, 'Same phone', true, { reason: 'new ban' }, false));
  const restored = (await getDoc(doc(db, 'devices', 'reinstalled-device'))).data();
  for (const field of ['role', 'permissions', 'status', 'verified', 'loginApproved', 'firstLogin', 'banDetails']) assert.deepEqual(restored[field], saved[field]);
  assert.equal((await getDoc(doc(db, 'installations', id))).data().lastUid, 'reinstalled-device');
});

test('restoration cannot drop or alter a saved ban reason', async () => {
  const id = 'android_5123456789abcdef';
  const saved = { ...device('user', id), status: 'banned', banDetails: { reason: 'keep ban', silent: true, expiresAt: '' } };
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'installations', id), saved));
  const db = env.authenticatedContext('new-device').firestore();
  const { banDetails, ...withoutBan } = saved;
  await assertFails(setDoc(doc(db, 'devices', 'new-device'), withoutBan));
  await assertFails(setDoc(doc(db, 'devices', 'new-device'), { ...saved, banDetails: { ...banDetails, silent: false } }));
  await assertFails(setDoc(doc(db, 'devices', 'new-device'), { ...saved, status: null }));
  await assertSucceeds(setDoc(doc(db, 'devices', 'new-device'), saved));
});

test('users cannot rewrite another installation or remove their persisted ban details', async () => {
  const saved = { ...device('user', 'user-install'), lastUid: 'user', updatedBy: 'owner', status: 'banned', banDetails: { reason: 'keep', silent: true, expiresAt: '' } };
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'devices', 'user'), saved);
    await setDoc(doc(context.firestore(), 'installations', 'user-install'), saved);
    await setDoc(doc(context.firestore(), 'installations', 'other-install'), { ...device('user', 'other-install'), updatedBy: 'owner' });
  });
  const db = env.authenticatedContext('user').firestore();
  await assertFails(updateDoc(doc(db, 'installations', 'other-install'), { updatedBy: 'user', lastUid: 'user' }));
  await assertFails(updateDoc(doc(db, 'installations', 'user-install'), { updatedBy: 'user', banDetails: firebaseSdk.deleteField() }));
  await assertFails(updateDoc(doc(db, 'installations', 'user-install'), { updatedBy: 'user', status: firebaseSdk.deleteField() }));
  await assertSucceeds(setDoc(doc(db, 'installations', 'user-install'), { ...saved, updatedBy: 'user' }));
});

test('legacy metadata migration preserves first login and name without exposing previous UID documents', async () => {
  const { migrateInstallationMetadata } = require('../scripts/lib/migrate-installation-metadata.cjs');
  const id = 'android_6123456789abcdef';
  const profile = { ...device('admin', id), firstLogin: '2026-06-01', lastUid: 'prior-admin', updatedBy: 'owner' };
  const previous = { ...profile, firstLogin: '2025-01-01', deviceName: 'My original phone' };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'devices', 'prior-admin'), previous);
    await setDoc(doc(db, 'installations', id), profile);
    const adapter = { doc: path => doc(db, ...path.split('/')), runTransaction: callback => firebaseSdk.runTransaction(db, callback) };
    assert.equal(await migrateInstallationMetadata(adapter, doc(db, 'installations', id)), true);
    assert.equal(await migrateInstallationMetadata(adapter, doc(db, 'installations', id)), false);
    assert.deepEqual((await getDoc(doc(db, 'installations', id))).data(), { ...profile, firstLogin: previous.firstLogin, deviceName: previous.deviceName, restorationMetadataVersion: 1 });
    assert.deepEqual((await getDoc(doc(db, 'devices', 'prior-admin'))).data(), previous);
  });
  const db = env.authenticatedContext('next-admin').firestore();
  await assertFails(getDoc(doc(db, 'devices', 'prior-admin')));
  const { registerRestoredDevice } = loadTs('lib/device-registration.ts', { 'firebase/firestore': firebaseSdk });
  await assertSucceeds(registerRestoredDevice(db, 'next-admin', id, 'Phone', false, {}));
  const restored = (await getDoc(doc(db, 'devices', 'next-admin'))).data();
  assert.equal(restored.firstLogin, previous.firstLogin);
  assert.equal(restored.deviceName, previous.deviceName);
  assert.deepEqual(restored.permissions, previous.permissions);
  await env.withSecurityRulesDisabled(async context => assert.equal((await getDoc(doc(context.firestore(), 'devices', 'prior-admin'))).exists(), false));
});

const backendRequire = require('node:module').createRequire(require('node:path').resolve('functions/package.json'));
let adminSdkAvailable = false;
try { backendRequire.resolve('firebase-admin/app'); adminSdkAvailable = true; } catch {}
test('deployment CLI runs with the real Admin SDK against only the local emulator', { skip: !adminSdkAvailable }, async () => {
  const id = 'android_8123456789abcdef';
  const previous = { ...device('owner', id), firstLogin: '2025-01-01', deviceName: 'Original phone' };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'admin_settings', 'security'), { loginEnabled: false, autoBan: true, statisticsAccess: { [id]: false } });
    await setDoc(doc(db, 'devices', 'previous-owner'), previous);
    await setDoc(doc(db, 'installations', id), { ...device('owner', id), lastUid: 'previous-owner' });
  });
  const { execFile } = require('node:child_process');
  const execute = require('node:util').promisify(execFile);
  for (let repeat = 0; repeat < 2; repeat++) {
    const result = await execute(process.execPath, ['scripts/migrate-statistics-access.cjs', 'demo-pks-live', ...(repeat===1?['--enable-api-statistics']:[])], {
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: emulatorAddress, GCLOUD_PROJECT: 'demo-pks-live' }, timeout: 30000,
    });
    assert.ok(!result.stdout.includes(id), 'Migration output must not disclose installation identifiers');
  }
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    assert.deepEqual((await getDoc(doc(db, 'admin_settings', 'security'))).data(), { loginEnabled: false, autoBan: true, apiStatisticsVersion:1 });
    assert.deepEqual((await getDoc(doc(db, 'admin_settings', 'statistics_access'))).data(), { statisticsAccess: { [id]: false } });
    const profile = (await getDoc(doc(db, 'installations', id))).data();
    assert.equal(profile.firstLogin, previous.firstLogin);
    assert.equal(profile.deviceName, previous.deviceName);
    assert.equal(profile.restorationMetadataVersion, 1);
    assert.deepEqual((await getDoc(doc(db, 'devices', 'previous-owner'))).data(), previous);
  });
});

const apiReport = (uid, installationId, stream='a'.repeat(64), requests=10) => ({
  uid,installationId,stream,date:'2026-10-17',startedAt:Date.parse('2026-10-17T08:00:00Z'),
  providers:{pks:{requests,errors:1,latencyMs:requests*100},mpk_rzeszow:{requests:0,errors:0,latencyMs:0},marcel:{requests:0,errors:0,latencyMs:0}},updatedAt:firebaseSdk.serverTimestamp(),
});
test('global API reports are opt-in, private, attributed to the caller and cumulative', async () => {
  const user=env.authenticatedContext('user').firestore();
  const report=apiReport('user','user-install'),id=report.stream+'_'+report.date;
  await assertFails(setDoc(doc(user,'api_statistics',id),report));
  await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'admin_settings','security'),{apiStatisticsVersion:1}));
  await assertSucceeds(setDoc(doc(user,'api_statistics',id),report));
  await assertSucceeds(setDoc(doc(user,'api_statistics',id),{...report,updatedAt:firebaseSdk.serverTimestamp()}));
  await assertFails(setDoc(doc(user,'api_statistics',id),{...report,installationId:'owner-install'}));
  await assertFails(setDoc(doc(user,'api_statistics',id),{...report,uid:'owner'}));
  await assertFails(updateDoc(doc(user,'api_statistics',id),{providers:{...report.providers,pks:{requests:1,errors:0,latencyMs:1}},updatedAt:firebaseSdk.serverTimestamp()}));
  await assertFails(updateDoc(doc(user,'api_statistics',id),{providers:{...report.providers,pks:{requests:11,errors:12,latencyMs:100}},updatedAt:firebaseSdk.serverTimestamp()}));
  await assertFails(getDocs(collection(user,'api_statistics')));
  await assertSucceeds(getDoc(doc(user,'api_statistics',id)));
  await assertFails(getDoc(doc(env.authenticatedContext('fresh-user').firestore(),'api_statistics',id)));
  const owner=env.authenticatedContext('owner').firestore();
  const result=await assertSucceeds(getDocs(firebaseSdk.query(collection(owner,'api_statistics'),firebaseSdk.where('date','>=','2026-10-01'),firebaseSdk.where('date','<=','2026-10-31'))));
  assert.equal(result.size,1);
  const admin=env.authenticatedContext('admin').firestore();
  await assertSucceeds(getDocs(collection(admin,'api_statistics')));
  await setDoc(doc(owner,'admin_settings','statistics_access'),{statisticsAccess:{'admin-install':false}});
  await assertFails(getDocs(collection(admin,'api_statistics')));
  await assertFails(getDoc(doc(admin,'api_statistics',id)));
  await assertFails(firebaseSdk.deleteDoc(doc(user,'api_statistics',id)));
});

test('banned, pending and unregistered devices cannot publish global API reports',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await updateDoc(doc(db,'admin_settings','security'),{apiStatisticsVersion:1});
    await setDoc(doc(db,'devices','banned-user'),{...device('user','banned-install'),status:'banned'});
    await setDoc(doc(db,'devices','pending-user'),{...device('user','pending-install'),loginApproved:false});
  });
  for(const uid of ['banned-user','pending-user','unknown-user']){
    const db=env.authenticatedContext(uid).firestore(),report=apiReport(uid,uid.replace('-user','-install'));
    await assertFails(setDoc(doc(db,'api_statistics',report.stream+'_'+report.date),report));
  }
});

test('API reports survive device deduplication and a reinstall cannot overwrite another phone',async()=>{
  const installationId='shared-api-install',profile={...device('user',installationId),lastUid:'prior-api-user',updatedBy:'owner',restorationMetadataVersion:1};
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();await updateDoc(doc(db,'admin_settings','security'),{apiStatisticsVersion:1});
    await setDoc(doc(db,'devices','prior-api-user'),profile);await setDoc(doc(db,'installations',installationId),profile);
  });
  const oldDb=env.authenticatedContext('prior-api-user').firestore();
  const report=apiReport('prior-api-user',installationId),id=report.stream+'_'+report.date;
  await assertSucceeds(setDoc(doc(oldDb,'api_statistics',id),report));
  const db=env.authenticatedContext('reinstalled-api-user').firestore();
  const {registerRestoredDevice}=loadTs('lib/device-registration.ts',{'firebase/firestore':firebaseSdk});
  await assertSucceeds(registerRestoredDevice(db,'reinstalled-api-user',installationId,'Phone',false,{}));
  await assertSucceeds(setDoc(doc(db,'api_statistics',id),apiReport('reinstalled-api-user',installationId,report.stream,11)));
  assert.equal((await getDoc(doc(db,'api_statistics',id))).data().providers.pks.requests,11);
  const other=env.authenticatedContext('user').firestore();
  await assertFails(setDoc(doc(other,'api_statistics',id),apiReport('user','user-install',report.stream,100)));
  await env.withSecurityRulesDisabled(async context=>assert.equal((await getDoc(doc(context.firestore(),'devices','prior-api-user'))).exists(),false));
});

test('only owner can change journeys access and a restricted user cannot remove the restriction',async()=>{
 const owner=env.authenticatedContext('owner').firestore(),admin=env.authenticatedContext('admin').firestore();
 const permissions=buildDevicePermissions('user',{disableJourneys:true});
 await assertFails(updateDoc(doc(admin,'devices','user'),{permissions}));
 await assertSucceeds(updateDoc(doc(owner,'devices','user'),{permissions}));
 const user=env.authenticatedContext('user').firestore();
 await assertFails(updateDoc(doc(user,'devices','user'),{permissions:buildDevicePermissions('user')}));
 await assertSucceeds(updateDoc(doc(owner,'devices','user'),{permissions:buildDevicePermissions('user')}));
});
