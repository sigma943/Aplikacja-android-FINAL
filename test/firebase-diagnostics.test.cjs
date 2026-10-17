const { test } = require('node:test');
const assert = require('node:assert/strict');
const { firebaseDiagnosticCode } = require('./load-ts.cjs')('lib/firebase-diagnostics.ts');

test('Firebase diagnostics keep error categories without paths, tokens or identifiers', () => {
  assert.equal(firebaseDiagnosticCode({ code: 'firestore/permission-denied', message: 'installations/private-id token=private' }), 'permission-denied');
  assert.equal(firebaseDiagnosticCode({ code: 'functions/unavailable', details: { installationId: 'private' } }), 'unavailable');
  assert.equal(firebaseDiagnosticCode({ code: 'auth/too-many-requests' }), 'auth/too-many-requests');
  for (const value of [null, undefined, 'private-id', { code: 'installations/private-id' }, new Error('private-id')]) assert.equal(firebaseDiagnosticCode(value), 'unknown');
});
