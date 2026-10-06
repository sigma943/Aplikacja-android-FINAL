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

test('runtime routing is readable by signed-in devices but cannot be changed directly by clients', async () => {
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
