import { writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

const datasetUrl = 'https://otwartedane.erzeszow.pl/v1/datasets/slug_full_view/?slug=rozklady-jazdy-gtfs';
async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}
const dataset = await (await request(datasetUrl)).json();
const resource = dataset.resources.find((item) => item.extension === 'ZIP' && item.file);
if (!resource) throw new Error('No official GTFS archive available');
const archive = unzipSync(new Uint8Array(await (await request(resource.file)).arrayBuffer()), {
  filter: (entry) => /(^|\/)calendar(?:_dates)?\.txt$/.test(entry.name),
});
function rows(name) {
  const bytes = Object.entries(archive).find(([key]) => key.endsWith(name))?.[1];
  if (!bytes) return [];
  const [header, ...lines] = strFromU8(bytes).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const keys = header.split(',');
  return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(',').map((value, index) => [keys[index], value])));
}
const calendar = rows('calendar.txt');
const exceptions = rows('calendar_dates.txt');
if (!calendar.length && !exceptions.length) throw new Error('GTFS contains no service calendar');
await writeFile(new URL('../public/data/mpk-service-calendar.json', import.meta.url), JSON.stringify({
  source: resource.file, fetchedAt: new Date().toISOString(), calendar, exceptions,
}, null, 2) + '\n');
console.log(`Saved official MPK calendar: ${calendar.length} services, ${exceptions.length} exceptions`);
