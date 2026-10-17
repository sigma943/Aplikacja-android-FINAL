const diagnosticCodes = new Set([
  'permission-denied', 'unauthenticated', 'unavailable', 'deadline-exceeded',
  'failed-precondition', 'not-found', 'already-exists', 'aborted',
  'resource-exhausted', 'invalid-argument', 'internal', 'cancelled',
  'auth/network-request-failed', 'auth/too-many-requests',
  'auth/operation-not-allowed', 'auth/invalid-api-key',
]);

/** SDK messages can contain full Firestore paths. Diagnostics need only the code. */
export function firebaseDiagnosticCode(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const normalized = code.replace(/^(firestore|functions)\//, '');
  return diagnosticCodes.has(normalized) ? normalized : 'unknown';
}
