// Browser fixture only. The real callable permissions and transactional backend
// are tested separately; this adapter verifies the actual maintenance controls.
export const db = {};
export const functions = {};
export const calls: Array<{name: string; data: any}> = [];
const rows: Record<string, any> = {};
let settings: any = {};
const changes: any[] = [];
const listeners = new Set<() => void>();
export const collection = (_: unknown, name: string) => ({name});
export const doc = (_: unknown, name: string, id: string) => ({name, id});
export const query = (ref: any, ..._: any[]) => ref;
export const orderBy = (..._: any[]) => null;
export const limit = (..._: any[]) => null;
export function onSnapshot(ref: any, callback: (value: any) => void) {
  const send = () => {
    if (ref.name === 'maintenance_endpoints') callback({docs: Object.entries(rows).map(([id, value]) => ({id, data: () => ({...value})}))});
    else if (ref.name === 'maintenance_changes') callback({docs: changes.map((value, i) => ({id: String(i), data: () => value}))});
    else callback({exists: () => Boolean(settings.activeEndpointId), data: () => ({...settings})});
  };
  listeners.add(send);queueMicrotask(send);
  return () => {listeners.delete(send);};
}
const notify = () => listeners.forEach(send => send());
export const httpsCallable = (_: unknown, name: string, __?: unknown) => async (data: any) => {
  calls.push({name, data});
  if (typeof window !== 'undefined') (window as any).__maintenanceCalls = calls;
  let result: any = {ok: true};
  if (name === 'initializeMaintenance') {
    rows['default-transport-api'] = {name: 'Główny (PROD)', url: 'https://primary.example', role: 'production', priority: 1, enabled: true, active: true, fallbackEnabled: true};
    settings = {activeEndpointId: 'default-transport-api'};
  } else if (name === 'saveMaintenanceEndpoint') {
    const id = data.endpoint.id || 'created-endpoint';
    rows[id] = {...data.endpoint, id};result.endpointId = id;
  } else if (name === 'testMaintenanceEndpoint') {
    result.result = {ok: true, status: 'success', statusCode: 200, latencyMs: 12, testedAt: '2026-10-06T12:18:30Z', message: 'Połączenie z API działa.'};
    if (data.endpointId) rows[data.endpointId].lastTest = result.result;
  } else if (name === 'setActiveMaintenanceEndpoint' || name === 'rollbackMaintenanceEndpoint') {
    const id = data.endpointId || settings.previousEndpointId;
    rows[settings.activeEndpointId].active = false;rows[id].active = true;
    settings = {activeEndpointId: id, previousEndpointId: settings.activeEndpointId};
  } else if (name === 'disableMaintenanceEndpoint') rows[data.endpointId].enabled = false;
  else throw new Error(`Unexpected callable ${name}`);
  changes.push({action: name, summary: name, endpointId: result.endpointId || data.endpointId || '', createdAt: {toDate: () => new Date()}});
  notify();return {data: result};
};
