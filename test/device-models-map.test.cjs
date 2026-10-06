const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const loadTs = require('./load-ts.cjs');
const { formatDeviceLabel, formatDeviceOsSummary } = loadTs('lib/format-device-label.ts');
const { runFrameBatch } = loadTs('lib/map-frame-batch.ts');
const catalog = JSON.parse(fs.readFileSync('public/device-models.json', 'utf8'));
const label = (deviceInfo, aliases = catalog.aliases, displayName) => formatDeviceLabel({deviceInfo, aliases, displayName, deviceId: 'abcd'});

test('official catalog resolves phones, tablets and complete model strings from many brands', () => {
  assert.ok(catalog.rows > 50000);
  assert.equal(label('Xiaomi 2510DPC44G | android 16'), 'POCO F8 Pro');
  assert.match(label('samsung SM-S928B | android 14'), /Samsung Galaxy S24 Ultra/i);
  assert.match(label('samsung SM-X710 | android 14'), /Samsung Galaxy Tab S9/i);
  assert.match(label('Google Pixel 9 Pro | android 15'), /Pixel 9 Pro/);
  assert.equal(label('motorola XT2427-4 | android 14'), 'Motorola moto g85 5G');
  assert.equal(formatDeviceOsSummary('Xiaomi 2510DPC44G | android 16', catalog.aliases), 'android 16');
});

test('custom labels override catalog names while unknown codes stay honest', () => {
  assert.equal(label('Xiaomi 2510DPC44G | android 16', {...catalog.aliases, '2510DPC44G': 'Mój model'}), 'Mój model');
  assert.equal(label('Xiaomi 2510DPC44G | android 16', catalog.aliases, 'Telefon Tomka'), 'Telefon Tomka');
  assert.equal(label('Example UNKNOWN123 | android 16'), 'Example UNKNOWN123');
  assert.equal(label('General Mobile GM 99 | android 16', {'GM 99':'General Mobile GM 99'}), 'General Mobile GM 99');
  assert.match(label('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0'), /Chrome - Windows/);
});

function frames() {
  const pending = new Map(); let next = 0, time = 0;
  return { pending, options: { request: callback => {pending.set(++next, callback); return next;}, cancel: id => pending.delete(id), now: () => time },
    spend: ms => {time += ms;}, tick: () => {const entries = [...pending]; pending.clear(); entries.forEach(([, callback]) => callback());} };
}

test('large marker update batches respect the frame budget and finish in order', () => {
  const clock = frames(), visited = [];
  runFrameBatch(Array.from({length: 1000}, (_, index) => index), item => {visited.push(item); clock.spend(1);}, {...clock.options, budgetMs: 6});
  assert.equal(visited.length, 0);
  clock.tick(); assert.equal(visited.length, 6);
  while(clock.pending.size) clock.tick();
  assert.deepEqual(visited, Array.from({length: 1000}, (_, index) => index));
});

test('map interaction and unmount cancel pending position writes', () => {
  const clock = frames(), visited = [];
  const cancel = runFrameBatch([1,2,3,4], item => visited.push(item), {...clock.options, batchSize: 1});
  clock.tick(); cancel(); clock.tick(); assert.deepEqual(visited, [1]);
  runFrameBatch([5], item => visited.push(item), {...clock.options, paused: () => true});
  clock.tick(); assert.deepEqual(visited, [1]); assert.equal(clock.pending.size, 0);
});
