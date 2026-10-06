const { test } = require('node:test');
const assert = require('node:assert/strict');
const { maintenanceService, probeEndpoint, endpointUrl, DEFAULT_ENDPOINT_ID } = require('../lib/maintenance-service');

function memoryDb() {
  const records = new Map(); let sequence = 0; let queue = Promise.resolve();
  const snapshot = ref => ({ exists: records.has(ref.path), data: () => records.has(ref.path) ? { ...records.get(ref.path) } : undefined });
  const ref = path => ({ path, id: path.split('/').pop(), get: async () => snapshot({ path }) });
  const db = {
    collection: name => ({ doc: id => ref(`${name}/${id || `generated-${++sequence}`}`) }),
    runTransaction: fn => {
      const run = queue.then(async () => {
        const writes = []; let wrote = false;
        const tx = {
          get: async target => { assert.equal(wrote, false, 'Firestore requires every read before writes'); return snapshot(target); },
          set: (target, data, options) => { wrote = true; writes.push([target.path, data, options?.merge]); },
          update: (target, data) => { wrote = true; assert.ok(records.has(target.path)); writes.push([target.path, data, true]); },
        };
        const result = await fn(tx);
        for (const [path, data, merge] of writes) records.set(path, merge ? { ...records.get(path), ...data } : data);
        return result;
      });
      queue = run.catch(() => {}); return run;
    }, records,
  };
  return db;
}
const goodFetch = async () => new Response(JSON.stringify({ providers: { pks: { state: 'ok' } } }));
const draft = (name, url = `https://${name}.example/api`) => ({ name, url, priority: 2, role: 'backup', region: 'PL', enabled: true, fallbackEnabled: true });

test('initialization persists the default endpoint and runtime config without pretending a health test happened', async () => {
  const db = memoryDb(); const service = maintenanceService(db, goodFetch);
  await Promise.all([service.initialize(), service.initialize()]);
  assert.equal(db.records.get('admin_settings/maintenance').activeEndpointId, DEFAULT_ENDPOINT_ID);
  const endpoint = db.records.get(`maintenance_endpoints/${DEFAULT_ENDPOINT_ID}`);
  assert.equal(endpoint.lastTest, undefined);
  assert.equal(db.records.get('admin_settings/transport_runtime').endpointUrl, endpoint.url);
  assert.equal([...db.records.keys()].filter(key => key.startsWith('maintenance_endpoints/')).length, 1);
});

test('new endpoints keep generated identity, can be saved, tested, activated, rolled back and disabled', async () => {
  const db = memoryDb(); const service = maintenanceService(db, goodFetch);
  const { endpointId } = await service.save(draft('backup'), 'owner');
  const saved = db.records.get(`maintenance_endpoints/${endpointId}`);
  await service.test({ endpointId }, 'viewer');
  assert.equal(db.records.get(`maintenance_endpoints/${endpointId}`).lastTest.ok, true);
  await service.activate(endpointId, 'owner');
  assert.equal(db.records.get('admin_settings/transport_runtime').endpointUrl, saved.url);
  assert.equal(db.records.get(`maintenance_endpoints/${DEFAULT_ENDPOINT_ID}`).active, false);
  await assert.rejects(service.disable(endpointId, 'owner'), /Najpierw aktywuj/);
  await service.rollback('owner');
  assert.equal(db.records.get('admin_settings/maintenance').activeEndpointId, DEFAULT_ENDPOINT_ID);
  await service.disable(endpointId, 'owner');
  await service.save({ ...draft('backup'), id: endpointId, enabled: true }, 'owner');
  assert.equal(db.records.get(`maintenance_endpoints/${endpointId}`).enabled, true);
  const history = [...db.records].filter(([key]) => key.startsWith('maintenance_changes/')).map(([, value]) => value.action);
  for (const action of ['save', 'test', 'activate', 'rollback', 'disable']) assert.ok(history.includes(action));
});

test('parallel activations serialize endpoint flags, previous endpoint and runtime URL together', async () => {
  const db = memoryDb(); const service = maintenanceService(db, goodFetch);
  const a = (await service.save(draft('a'), 'owner')).endpointId;
  const b = (await service.save(draft('b'), 'owner')).endpointId;
  await Promise.all([service.activate(a, 'owner'), service.activate(b, 'owner')]);
  const active = [...db.records].filter(([key, value]) => key.startsWith('maintenance_endpoints/') && value.active);
  assert.equal(active.length, 1);
  assert.equal(active[0][1].url, db.records.get('admin_settings/transport_runtime').endpointUrl);
  assert.equal(active[0][0].split('/')[1], db.records.get('admin_settings/maintenance').activeEndpointId);
});

test('HTTP 200 with an HTML page or unrelated JSON never passes health checks or activation', async () => {
  for (const body of ['<html>Landing page</html>', '{}', '{"providers":{}}']) {
    const fetcher = async () => new Response(body);
    const result = await probeEndpoint('https://api.example', fetcher);
    assert.equal(result.ok, false);
    const db = memoryDb(); const service = maintenanceService(db, fetcher);
    const id = (await service.save(draft('bad'), 'owner')).endpointId;
    await assert.rejects(service.activate(id, 'owner'), /Nie można aktywować/);
    assert.equal(db.records.get('admin_settings/maintenance').activeEndpointId, DEFAULT_ENDPOINT_ID);
  }
});

test('changing an address during a health test invalidates its result instead of activating a different URL', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const db = memoryDb(); const service = maintenanceService(db, async () => { await wait; return goodFetch(); });
  const id = (await service.save(draft('old'), 'owner')).endpointId;
  const pending = service.test({ endpointId: id }, 'owner');
  await new Promise(resolve => setImmediate(resolve));
  await service.save({ ...draft('new'), id }, 'owner'); release();
  await assert.rejects(pending, /Adres zmienił/);
  assert.equal(db.records.get(`maintenance_endpoints/${id}`).lastTest, null);
});

test('active URL cannot change behind the runtime pointer, and malformed input never saves', async () => {
  const db = memoryDb(); const service = maintenanceService(db, goodFetch); await service.initialize();
  await assert.rejects(service.save({ ...draft('changed'), id: DEFAULT_ENDPOINT_ID }, 'owner'), /Najpierw aktywuj/);
  await assert.rejects(service.save({ ...draft('x'), priority: 1.5 }, 'owner'), /priorytet/);
  for (const url of ['http://api.example', 'https://user:pass@api.example', 'https://127.0.0.1', 'https://api.example?key=x', 'https://api.example/transportGateway']) assert.throws(() => endpointUrl(url));
});
