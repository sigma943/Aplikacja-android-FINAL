const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, writeBatch } = require('firebase/firestore');
const loadTs = require('./load-ts.cjs');
const { buildDevicePermissions } = loadTs('lib/admin/rbac.ts');
let env;
const device = (role, installationId, permissions = buildDevicePermissions(role)) => ({
  role, permissions, installationId, verified: role !== 'user', status:'active',
  deviceInfo:'Test', firstLogin:'2026-10-05',
});
before(async () => {
  env = await initializeTestEnvironment({ projectId:'demo-pks-live', firestore:{
    host:'127.0.0.1',port:8088,rules:fs.readFileSync('firestore.rules','utf8'),
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
