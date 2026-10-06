const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

for (const native of [false, true]) {
  test(`Firebase uses browser transport with native=${native}`, () => {
    const app = {};
    let settings;
    let databaseId;
    loadTs('lib/firebase.ts', {
      'firebase/app': { getApps: () => [app], getApp: () => app,
        initializeApp: () => { throw new Error('Must reuse existing Firebase app'); } },
      'firebase/auth': { getAuth: () => ({}) },
      'firebase/functions': { getFunctions: () => ({}) },
      'firebase/firestore': { initializeFirestore: (usedApp, config, id) => {
        assert.equal(usedApp, app);
        settings = config;
        databaseId = id;
        return {};
      } },
      '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
    });
    assert.equal(databaseId, '(default)');
    assert.deepEqual(settings, native ? { experimentalForceLongPolling: true } : {});
  });
}

test('Android HTTP global patching is off; explicit native HTTP remains available', () => {
  const { default: config } = loadTs('capacitor.config.ts');
  assert.equal(config.plugins.CapacitorHttp.enabled, false);
});
