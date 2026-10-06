import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { auth, db } from './firebase';
import { maintenanceService, probeEndpoint, endpointUrl, type MaintenanceRef, type MaintenanceStore } from '../functions/src/maintenance-core';
import type { MaintenanceEndpoint } from '@/app/admin/types';

type ClientRef = MaintenanceRef & { native: ReturnType<typeof doc> };
const wrapSnapshot = (snapshot: Awaited<ReturnType<typeof getDoc>>) => ({ exists: snapshot.exists(), data: () => snapshot.data() });
const wrapRef = (native: ReturnType<typeof doc>): ClientRef => ({ native, id: native.id, get: async () => wrapSnapshot(await getDoc(native)) });
const store: MaintenanceStore = {
  collection: name => ({ doc: id => wrapRef(id ? doc(db, name, id) : doc(collection(db, name))) }),
  runTransaction: fn => runTransaction(db, tx => fn({
    get: async ref => wrapSnapshot(await tx.get((ref as ClientRef).native)),
    set: (ref, data, options) => { if (options) tx.set((ref as ClientRef).native, data, options); else tx.set((ref as ClientRef).native, data); },
    update: (ref, data) => { tx.update((ref as ClientRef).native, data); },
  })),
};
const clientFetch: typeof fetch = async (input, init) => {
  if (!Capacitor.isNativePlatform()) {
    try { return await fetch(input, init); }
    catch (error) {
      if (init?.signal?.aborted) throw error;
      throw new Error('Nie udało się odczytać API. Sprawdź adres i połączenie; w przeglądarce API musi zezwalać na CORS dla tej aplikacji.');
    }
  }
  const response = await CapacitorHttp.request({ url: String(input), method: 'GET', headers: { Accept: 'application/json' }, connectTimeout: 9000, readTimeout: 9000 });
  return new Response(typeof response.data === 'string' ? response.data : JSON.stringify(response.data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
};
const service = maintenanceService(store, clientFetch, serverTimestamp);
async function caller(write: boolean) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Zaloguj się ponownie.');
  const profile = (await getDoc(doc(db, 'devices', uid))).data();
  const permissions = profile?.permissions || {};
  const edit = profile?.role === 'owner' || (profile?.role === 'admin' && permissions.globalSettingsEdit === true);
  const read = edit || (profile?.role === 'admin' && permissions.globalSettings === true);
  if (profile?.status === 'banned' || !read || (write && !edit)) throw Object.assign(new Error('Nie masz uprawnień do tej operacji.'), { code: 'permission-denied' });
  return { uid, edit };
}
export async function callInitialize(_: object) {
  const user = await caller(false);
  if (user.edit) await service.initialize(user.uid);
  return { data: { ok: true } };
}
export async function callSaveEndpoint(input: { endpoint: MaintenanceEndpoint }) {
  const user = await caller(true);
  return { data: await service.save(input.endpoint, user.uid) };
}
export async function callTestEndpoint(input: { endpointId?: string; url?: string }) {
  const user = await caller(false);
  if (user.edit) return { data: await service.test(input, user.uid) };
  const saved = input.endpointId ? (await getDoc(doc(db, 'maintenance_endpoints', input.endpointId))).data() : null;
  const result = await probeEndpoint(endpointUrl(input.url || saved?.url), clientFetch);
  return { data: { ok: true, result } };
}
export async function callSetActive(input: { endpointId?: string }) {
  const user = await caller(true);
  return { data: await service.activate(input.endpointId || '', user.uid) };
}
export async function callDisable(input: { endpointId?: string }) {
  const user = await caller(true);
  return { data: await service.disable(input.endpointId || '', user.uid) };
}
export async function callRollback(_: object) {
  const user = await caller(true);
  return { data: await service.rollback(user.uid) };
}
