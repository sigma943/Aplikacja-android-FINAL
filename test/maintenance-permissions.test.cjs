const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

test('maintenance callable permissions allow diagnostics but protect mutations and reject banned devices', async () => {
  const devices = { owner: { role: 'owner', status: 'active' }, viewer: { role: 'admin', status: 'active', permissions: { globalSettings: true } },
    editor: { role: 'admin', status: 'active', permissions: { globalSettingsEdit: true } }, user: { role: 'user', status: 'active' }, banned: { role: 'owner', status: 'banned' } };
  const calls = [];
  const service = Object.fromEntries(['initialize', 'save', 'test', 'activate', 'disable', 'rollback'].map(name => [name, async () => { calls.push(name); return { ok: true }; }]));
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const functions = loadTs('functions/src/index.ts', {
    'firebase-admin/app': { initializeApp() {} },
    'firebase-admin/firestore': { getFirestore: () => ({ collection: () => ({ doc: id => ({ get: async () => ({ exists: Boolean(devices[id]), data: () => devices[id] }) }) }) }), FieldValue: {} },
    'firebase-functions/v2/https': { HttpsError, onCall: (...args) => args.at(-1), onRequest: (...args) => args.at(-1) },
    './transport/service': {}, './transport/route-geometry': {},
    './maintenance-service': { maintenanceService: () => service, MaintenanceError: class extends Error {}, DEFAULT_API_URL: 'https://api.example', DEFAULT_ENDPOINT_ID: 'default' },
  });
  const reads = ['initializeMaintenance', 'testMaintenanceEndpoint'];
  const writes = ['saveMaintenanceEndpoint', 'setActiveMaintenanceEndpoint', 'disableMaintenanceEndpoint', 'rollbackMaintenanceEndpoint'];
  const request = uid => ({ auth: { uid }, data: { endpointId: 'backup' } });
  for (const name of [...reads, ...writes]) {
    await assert.rejects(functions[name]({ data: {} }), error => error.code === 'unauthenticated');
    for (const uid of ['user', 'banned', 'missing']) await assert.rejects(functions[name](request(uid)), error => error.code === 'permission-denied');
  }
  for (const name of reads) await functions[name](request('viewer'));
  for (const name of writes) await assert.rejects(functions[name](request('viewer')), error => error.code === 'permission-denied');
  for (const uid of ['owner', 'editor']) for (const name of [...reads, ...writes]) await functions[name](request(uid));
  assert.equal(calls.length, 14);
});
