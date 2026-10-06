import { signInAnonymously, type Auth, type User } from 'firebase/auth';

// React Strict Mode can mount providers twice before Firebase returns a user.
// Share the pending operation instead of creating two anonymous accounts.
const pendingSignIns = new WeakMap<Auth, Promise<User>>();
export function ensureFirebaseUser(auth: Auth): Promise<User> {
  const pending = pendingSignIns.get(auth);
  if (pending) return pending;
  const operation = (async () => {
    await auth.authStateReady();
    return auth.currentUser ?? (await signInAnonymously(auth)).user;
  })();
  pendingSignIns.set(auth, operation);
  const clear = () => pendingSignIns.delete(auth);
  operation.then(clear, clear);
  return operation;
}

const pendingRegistrations = new Map<string, Promise<void>>();
export function registerDeviceOnce(uid: string, register: () => Promise<void>): Promise<void> {
  const pending = pendingRegistrations.get(uid);
  if (pending) return pending;
  const operation = Promise.resolve().then(register);
  pendingRegistrations.set(uid, operation);
  const clear = () => pendingRegistrations.delete(uid);
  operation.then(clear, clear);
  return operation;
}
