import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, Timestamp, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { auth, db } from './firebase';
import { maintenanceService, probeEndpoint, endpointUrl, type MaintenanceRef, type MaintenanceStore } from '../functions/src/maintenance-core';
import { BUILTIN_TRANSPORT_URL } from './transport-runtime';
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
const httpFetch: typeof fetch = async (input, init) => {
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
// The built-in profile uses the existing provider adapters, not a hosted function.
// Its health check reads the real PKS feed; an empty array is a valid idle fleet.
const clientFetch: typeof fetch = async (input, init) => {
  if (String(input) !== `${BUILTIN_TRANSPORT_URL}/health/providers`) return httpFetch(input, init);
  const response = await httpFetch(`${BUILTIN_TRANSPORT_URL}/get_vehicles.php`, init);
  const body: unknown = await response.json();
  const valid = response.ok && Array.isArray(body);
  return new Response(JSON.stringify(valid ? { providers: { pks: { state: 'ok', vehicleCount: body.length } } } : { error: 'Nieprawidłowa odpowiedź źródła PKS.' }), { status: valid ? 200 : 502 });
};
const service = maintenanceService(store, clientFetch, serverTimestamp, { url: BUILTIN_TRANSPORT_URL, name: 'Źródła przewoźników' });
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

/** Clear entries that existed at confirmation time; new events remain intact. */
export async function callClearHistory(_:object) {
  await caller(true);
  const cutoff=Timestamp.now();
  let deletedCount=0;
  try {
  while(true) {
    const snapshot=await getDocs(query(collection(db,'maintenance_changes'),where('createdAt','<=',cutoff),orderBy('createdAt'),limit(200)));
    if(snapshot.empty)break;
    const batch=writeBatch(db);
    snapshot.docs.forEach(entry=>batch.delete(entry.ref));
    await batch.commit();
    deletedCount+=snapshot.size;
  }
  }catch(error){throw Object.assign(new Error(`Usunięto ${deletedCount} wpisów. Pozostała historia nie została usunięta; ponów operację.`,{cause:error}),{deletedCount});}
  return {data:{ok:true,deletedCount}};
}
