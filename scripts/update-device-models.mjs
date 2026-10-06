import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = 'https://storage.googleapis.com/play_public/supported_devices.csv';
// Optional local input also supports reproducible/offline regeneration.
const bytes = process.argv[2] ? await readFile(process.argv[2]) : Buffer.from(await (await fetch(source)).arrayBuffer());
const text = new TextDecoder(bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : 'utf-8').decode(bytes).replace(/^\uFEFF/, '');
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const [header, ...rows] = parseCsv(text);
const brandIndex = header.indexOf('Retail Branding'), nameIndex = header.indexOf('Marketing Name'), modelIndex = header.indexOf('Model');
if ([brandIndex, nameIndex, modelIndex].some(index => index < 0) || rows.length < 1000) throw new Error('Invalid Google device catalog');
const candidates = new Map();
const add = (key, name) => { const names = candidates.get(key) || new Set(); names.add(name); candidates.set(key, names); };
for (const row of rows) {
  const brand = (row[brandIndex] || '').trim(), model = (row[modelIndex] || '').trim(), name = (row[nameIndex] || '').trim();
  if (!brand || !model || !name) continue;
  const label = name.toLowerCase().startsWith(brand.toLowerCase()) || /^(POCO|Redmi)\b/i.test(name) ? name : `${brand} ${name}`;
  add(`${brand}:${model}`.toUpperCase(), label);
  add(model.toUpperCase(), label);
}
// Ambiguous model codes remain technical labels instead of guessing a device.
const aliases = Object.fromEntries([...candidates].filter(([key, names]) => {
  if (names.size !== 1) return false;
  // A unique bare model key already covers its manufacturer; omit duplicates.
  const colon = key.indexOf(':');
  return colon < 0 || candidates.get(key.slice(colon + 1))?.size !== 1;
}).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, names]) => [key, [...names][0]]));
await writeFile(new URL('../public/device-models.json', import.meta.url), JSON.stringify({ source, downloadedAt: new Date().toISOString().slice(0, 10), sourceSha256: createHash('sha256').update(bytes).digest('hex'), rows: rows.length, aliases }));
console.log(`${rows.length} rows, ${Object.keys(aliases).length} unambiguous aliases`);
