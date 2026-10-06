const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

test('a selected maintenance endpoint supplies vehicle lists and details for every provider', async () => {
  const runtime = loadTs('lib/transport-runtime.ts');
  const client = loadTs('lib/pks-client.ts', { './transport-runtime': runtime, '@capacitor/core': { Capacitor: { isNativePlatform: () => false } } });
  const previous = global.fetch; const urls = [];
  global.fetch = async url => {
    urls.push(String(url)); const provider = new URL(url).searchParams.get('providers') || 'pks';
    const vehicle = { id: provider+'-1', provider, lat: 50, lng: 22, line: '10' };
    return new Response(JSON.stringify(String(url).includes('/vehicle/') ? { vehicle } : { vehicles: [vehicle] }));
  };
  try {
    runtime.setTransportRuntime({ endpointId: 'backup', endpointUrl: 'https://backup.example/api', fallbackEnabled: false });
    const vehicles = await client.fetchVehiclesClient(true, ['pks', 'mpk_rzeszow', 'marcel']);
    assert.equal(vehicles.length, 3);
    assert.ok(urls.every(url => url.startsWith('https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportGateway/vehicles?')));
    const detail = await client.fetchVehicleDetailsClient('pks', 'pks-1');
    assert.equal(detail.id, 'pks-1');
    assert.ok(urls.at(-1).startsWith('https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportGateway/vehicle/pks/pks-1'));
    global.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(client.fetchVehiclesClient(false, ['pks']), /503/);
    for (const providers of [{pks: 'error'}, {pks: 'unsupported'}, {}]) {
      global.fetch = async () => new Response(JSON.stringify({vehicles: [], providers}));
      await assert.rejects(client.fetchVehiclesClient(false, ['pks']), /nie udostępnia danych/);
    }
    global.fetch = async () => new Response(JSON.stringify({vehicles: [], providers: {pks: 'ok'}}));
    assert.deepEqual(await client.fetchVehiclesClient(false, ['pks']), [], 'a successful empty provider response is retained');
    const fallbackUrls=[];
    runtime.setTransportRuntime({ endpointId: 'backup', endpointUrl: 'https://backup.example/api', fallbackEnabled: true });
    global.fetch = async url => {
      fallbackUrls.push(String(url));
      return new Response(JSON.stringify(String(url).includes('/transportGateway/') ? {vehicles: [], providers: {pks: 'unsupported'}} : String(url).includes('/api/pks/vehicles') ? {items: []} : []));
    };
    assert.deepEqual(await client.fetchVehiclesClient(false, ['pks']), []);
    assert.ok(fallbackUrls.some(url=>url.includes('/api/pks/vehicles')), 'an unsupported provider triggers the enabled carrier fallback');
    runtime.setTransportRuntime(null);
    assert.equal(runtime.transportApiBase('https://default.example'), 'https://default.example');
  } finally { global.fetch = previous; }
});

test('invalid or credential-bearing runtime URLs cannot replace the default API', () => {
  const runtime = loadTs('lib/transport-runtime.ts');
  for (const endpointUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/transportGateway']) {
    runtime.setTransportRuntime({ endpointUrl }); assert.equal(runtime.getTransportRuntime(), null);
  }
});
