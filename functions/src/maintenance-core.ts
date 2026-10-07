export interface MaintenanceSnapshot { exists: boolean; data(): any }
export interface MaintenanceRef { id: string; get(): Promise<MaintenanceSnapshot> }
export interface MaintenanceTransaction {
  get(ref: MaintenanceRef): Promise<MaintenanceSnapshot>;
  set(ref: MaintenanceRef, data: any, options?: { merge: boolean }): void;
  update(ref: MaintenanceRef, data: any): void;
}
export interface MaintenanceStore {
  collection(name: string): { doc(id?: string): MaintenanceRef };
  runTransaction<T>(fn: (tx: MaintenanceTransaction) => Promise<T>): Promise<T>;
}

export const DEFAULT_ENDPOINT_ID = 'default-transport-api';
export const DEFAULT_API_URL = 'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi';
const roles = new Set(['production', 'backup', 'staging', 'legacy', 'test']);
export class MaintenanceError extends Error {
  constructor(public code: 'invalid-argument' | 'not-found' | 'failed-precondition', message: string) { super(message); }
}
export function endpointUrl(value: unknown) {
  let url: URL;
  try { url = new URL(String(value || '').trim()); } catch { throw new MaintenanceError('invalid-argument', 'Podaj poprawny adres HTTPS API.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /transportGateway\/?$/.test(url.pathname)) {
    throw new MaintenanceError('invalid-argument', 'Podaj bazowy adres HTTPS API, bez parametrów, hasła i adresu bramki.');
  }
  if (url.hostname === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.startsWith('[')) {
    throw new MaintenanceError('invalid-argument', 'API musi mieć publiczny adres HTTPS.');
  }
  return url.toString().replace(/\/+$/, '');
}
function sanitize(input: any, previous: any = {}) {
  const priority = Number(input.priority ?? previous.priority ?? 1);
  const role = String(input.role ?? previous.role ?? 'backup');
  const name = String(input.name ?? previous.name ?? '').trim();
  if (!name || name.length > 80 || !roles.has(role) || !Number.isInteger(priority) || priority < 1 || priority > 99) {
    throw new MaintenanceError('invalid-argument', 'Wypełnij nazwę, rolę i priorytet od 1 do 99.');
  }
  if (input.enabled != null && typeof input.enabled !== 'boolean') throw new MaintenanceError('invalid-argument', 'Włączony endpoint musi mieć wartość logiczną.');
  return { name, url: endpointUrl(input.url ?? previous.url), role, priority,
    region: String(input.region ?? previous.region ?? 'PL').trim().slice(0, 24), source: 'Firestore',
    fallbackEnabled: Boolean(input.fallbackEnabled ?? previous.fallbackEnabled ?? true), enabled: input.enabled ?? previous.enabled ?? true };
}

export async function probeEndpoint(url: string, fetcher: typeof fetch = fetch) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  let statusCode = 0;
  try {
    const response = await fetcher(`${endpointUrl(url)}/health/providers`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    statusCode = response.status;
    const body: any = await response.json();
    const providers = body?.providers;
    const valid = providers && typeof providers === 'object' && !Array.isArray(providers) && Object.keys(providers).length > 0;
    const ok = response.ok && Boolean(valid);
    return { ok, status: ok ? 'success' as const : 'error' as const, statusCode, providerCount: valid ? Object.keys(providers).length : 0,
      latencyMs: Date.now() - started, testedAt: new Date().toISOString(), url,
      message: !response.ok ? `HTTP ${statusCode}` : !valid ? 'Odpowiedź nie zawiera stanu przewoźników API.' : 'Połączenie z API działa.' };
  } catch (error) {
    return { ok: false, status: 'error' as const, statusCode, providerCount: 0, latencyMs: Date.now() - started,
      testedAt: new Date().toISOString(), url, message: controller.signal.aborted ? 'Przekroczono czas połączenia (9 s).' : error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timeout); }
}

export function maintenanceService(db: MaintenanceStore, fetcher: typeof fetch = fetch, timestamp: () => unknown = () => new Date(), defaults?: { url: string; name: string }) {
  const endpointRef = (id: string) => db.collection('maintenance_endpoints').doc(id);
  const settingsRef = db.collection('admin_settings').doc('maintenance');
  const runtimeRef = db.collection('admin_settings').doc('transport_runtime');
  const history = (tx: MaintenanceTransaction, action: string, id: string, uid: string, before: any, after: any) => {
    tx.set(db.collection('maintenance_changes').doc(), { action, endpointId: id, actorId: uid,
      summary: `${({ save: 'Zapisano', test: 'Przetestowano', activate: 'Aktywowano', disable: 'Wyłączono', rollback: 'Przywrócono' } as Record<string, string>)[action]}: ${after?.name || before?.name || id}`,
      before: before ?? null, after: after ?? null, createdAt: timestamp() });
    tx.set(db.collection('admin_logs').doc(), { title: `Konserwacja: ${action}`, description: after?.name || before?.name || id,
      iconType: 'edit_role', category: 'OPERATOR', actorId: uid, createdAt: timestamp() });
  };
  const runtime = (id: string, data: any, uid: string) => ({ endpointId: id, endpointUrl: data.url, fallbackEnabled: Boolean(data.fallbackEnabled), updatedBy: uid, updatedAt: timestamp() });
  const idFrom = (input: unknown) => {
    const id = String(input || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new MaintenanceError('invalid-argument', 'Nieprawidłowy identyfikator endpointu.');
    return id;
  };
  async function initialize(uid = 'system') {
    await db.runTransaction(async tx => {
      const [settings, prod, current] = await Promise.all([tx.get(settingsRef), tx.get(endpointRef(DEFAULT_ENDPOINT_ID)), tx.get(runtimeRef)]);
      const defaultData = { name: defaults?.name || 'Główny (PROD)', url: defaults?.url || DEFAULT_API_URL, role: 'production', priority: 1, region: 'PL', source: 'Firestore', fallbackEnabled: true, enabled: true };
      const migrateDefault = Boolean(defaults && prod.exists && prod.data()?.url === DEFAULT_API_URL);
      const effectiveDefault = migrateDefault ? { ...prod.data(), ...defaultData, lastTest: null } : prod.data() || defaultData;
      const activeId = String(settings.data()?.activeEndpointId || DEFAULT_ENDPOINT_ID);
      const active = activeId === DEFAULT_ENDPOINT_ID ? prod : await tx.get(endpointRef(activeId));
      const effectiveId = active.exists && active.data()?.enabled !== false ? activeId : DEFAULT_ENDPOINT_ID;
      const activeData = effectiveId === DEFAULT_ENDPOINT_ID ? effectiveDefault : active.data()!;
      if (!prod.exists || migrateDefault) tx.set(endpointRef(DEFAULT_ENDPOINT_ID), { ...effectiveDefault, active: effectiveId === DEFAULT_ENDPOINT_ID, createdAt: prod.data()?.createdAt || timestamp(), updatedAt: timestamp(), updatedBy: uid });
      if (!settings.data()?.activeEndpointId || effectiveId !== activeId) tx.set(settingsRef, { activeEndpointId: effectiveId, previousEndpointId: '', updatedAt: timestamp(), updatedBy: uid }, { merge: true });
      if (!current.exists || current.data()?.endpointId !== effectiveId || current.data()?.endpointUrl !== activeData.url || current.data()?.fallbackEnabled !== Boolean(activeData.fallbackEnabled)) tx.set(runtimeRef, runtime(effectiveId, activeData, uid));
    });
  }
  async function save(input: any, uid: string) {
    await initialize(uid);
    const id = input.id ? idFrom(input.id) : db.collection('maintenance_endpoints').doc().id;
    await db.runTransaction(async tx => {
      const [previous, settings] = await Promise.all([tx.get(endpointRef(id)), tx.get(settingsRef)]);
      const before = previous.data() || {};
      const data = sanitize(input, before);
      const active = settings.data()?.activeEndpointId === id;
      if (active && (!data.enabled || data.url !== before.url)) throw new MaintenanceError('failed-precondition', 'Najpierw aktywuj inny endpoint, aby zmienić adres lub wyłączyć obecny.');
      tx.set(endpointRef(id), { ...data, active, createdAt: before.createdAt || timestamp(), updatedAt: timestamp(), updatedBy: uid,
        ...(before.url !== data.url ? { lastTest: null } : {}) }, { merge: true });
      if (active) tx.set(runtimeRef, runtime(id, data, uid));
      history(tx, 'save', id, uid, previous.exists ? before : null, data);
    });
    return { ok: true, endpointId: id };
  }
  async function test(input: { endpointId?: string; url?: string }, uid: string) {
    await initialize(uid);
    const id = input.endpointId ? idFrom(input.endpointId) : '';
    const before = id ? await endpointRef(id).get() : null;
    if (id && !before?.exists) throw new MaintenanceError('not-found', 'Endpoint nie istnieje.');
    const url = endpointUrl(input.url || before?.data()?.url);
    const result = await probeEndpoint(url, fetcher);
    if (id) await db.runTransaction(async tx => {
      const latest = await tx.get(endpointRef(id));
      if (!latest.exists || latest.data()?.url !== url) throw new MaintenanceError('failed-precondition', 'Adres zmienił się podczas testu. Uruchom test ponownie.');
      tx.update(endpointRef(id), { lastTest: result, updatedAt: timestamp(), updatedBy: uid });
      history(tx, 'test', id, uid, null, result);
    });
    return { ok: true, result };
  }
  async function activate(id: string, uid: string, action = 'activate', expectedActive?: string) {
    id = idFrom(id);
    const checked = await test({ endpointId: id }, uid);
    if (!checked.result.ok) throw new MaintenanceError('failed-precondition', `Nie można aktywować: ${checked.result.message}`);
    await db.runTransaction(async tx => {
      const [selected, settings] = await Promise.all([tx.get(endpointRef(id)), tx.get(settingsRef)]);
      const previousId = String(settings.data()?.activeEndpointId || DEFAULT_ENDPOINT_ID);
      const previous = previousId === id ? selected : await tx.get(endpointRef(previousId));
      const data = selected.data();
      if (!data || !data.enabled || data.url !== checked.result.url) throw new MaintenanceError('failed-precondition', 'Konfiguracja zmieniła się podczas testu. Spróbuj ponownie.');
      if (expectedActive && (previousId !== expectedActive || settings.data()?.previousEndpointId !== id)) throw new MaintenanceError('failed-precondition', 'Aktywny endpoint zmienił się. Odśwież panel.');
      if (previousId === id) return;
      if (previous.exists) tx.update(endpointRef(previousId), { active: false, updatedAt: timestamp(), updatedBy: uid });
      tx.update(endpointRef(id), { active: true, updatedAt: timestamp(), updatedBy: uid });
      tx.set(settingsRef, { activeEndpointId: id, previousEndpointId: previousId, updatedAt: timestamp(), updatedBy: uid }, { merge: true });
      tx.set(runtimeRef, runtime(id, data, uid));
      history(tx, action, id, uid, { previousEndpointId: previousId }, data);
    });
    return { ok: true, endpointId: id };
  }
  async function disable(id: string, uid: string) {
    id = idFrom(id);
    await db.runTransaction(async tx => {
      const [selected, settings] = await Promise.all([tx.get(endpointRef(id)), tx.get(settingsRef)]);
      if (!selected.exists) throw new MaintenanceError('not-found', 'Endpoint nie istnieje.');
      if (settings.data()?.activeEndpointId === id) throw new MaintenanceError('failed-precondition', 'Najpierw aktywuj inny endpoint.');
      tx.update(endpointRef(id), { enabled: false, active: false, updatedAt: timestamp(), updatedBy: uid });
      history(tx, 'disable', id, uid, selected.data(), { enabled: false });
    });
    return { ok: true };
  }
  async function rollback(uid: string) {
    await initialize(uid);
    const settings = (await settingsRef.get()).data();
    if (!settings?.previousEndpointId) throw new MaintenanceError('failed-precondition', 'Brak poprzedniego endpointu.');
    return activate(settings.previousEndpointId, uid, 'rollback', settings.activeEndpointId);
  }
  return { initialize, save, test, activate, disable, rollback };
}
