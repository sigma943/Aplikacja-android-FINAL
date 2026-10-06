const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

function session(signInAnonymously) {
  return loadTs('lib/firebase-session.ts', { 'firebase/auth': { signInAnonymously } });
}

test('parallel mounts share one anonymous login and one UID', async () => {
  let calls = 0;
  const auth = { currentUser: null, authStateReady: async () => {} };
  const user = { uid: 'stable-uid' };
  const { ensureFirebaseUser } = session(async () => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    auth.currentUser = user;
    return { user };
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => ensureFirebaseUser(auth)));
  assert.equal(calls, 1);
  assert.ok(results.every(result => result === user));
  assert.equal(await ensureFirebaseUser(auth), user);
  assert.equal(calls, 1);
});

test('persisted auth is restored before deciding to create an account', async () => {
  const user = { uid: 'persisted' };
  const auth = { currentUser: null, authStateReady: async () => { auth.currentUser = user; } };
  const { ensureFirebaseUser } = session(() => { throw new Error('Must reuse persisted account'); });
  assert.equal(await ensureFirebaseUser(auth), user);
});

test('failed login releases the lock and can retry with real credentials', async () => {
  let calls = 0;
  const auth = { currentUser: null, authStateReady: async () => {} };
  const { ensureFirebaseUser } = session(async () => {
    if (++calls === 1) throw new Error('offline');
    return { user: { uid: 'authenticated' } };
  });
  await assert.rejects(ensureFirebaseUser(auth), /offline/);
  assert.equal((await ensureFirebaseUser(auth)).uid, 'authenticated');
});

test('parallel registration writes once; failed registration can retry', async () => {
  const { registerDeviceOnce } = session();
  let calls = 0;
  const register = async () => {
    calls++;
    await new Promise(resolve => setImmediate(resolve));
    throw new Error('unavailable');
  };
  const results = await Promise.allSettled([
    registerDeviceOnce('same-uid', register), registerDeviceOnce('same-uid', register),
  ]);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 'rejected'));
  await registerDeviceOnce('same-uid', async () => { calls++; });
  assert.equal(calls, 2);
});
