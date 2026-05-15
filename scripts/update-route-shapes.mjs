import fs from 'fs';
import path from 'path';

const gtfsDir = path.join(process.cwd(), 'tmp_gtfs_pks');
const publicDataDir = path.join(process.cwd(), 'public', 'data');
const shapeOutDir = path.join(publicDataDir, 'route-shapes');

function parseCsvLine(line) {
  return line.split(',');
}

function readLines(filename) {
  return fs.readFileSync(path.join(gtfsDir, filename), 'utf8').trim().split(/\r?\n/);
}

function buildTripShapeIndex() {
  const lines = readLines('trips.txt');
  const header = parseCsvLine(lines.shift());
  const tripIdx = header.indexOf('trip_id');
  const shapeIdx = header.indexOf('shape_id');
  const index = {};

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const baseTripId = String(cols[tripIdx] || '').split('_')[0];
    const shapeId = String(cols[shapeIdx] || '').trim();
    if (baseTripId && shapeId && !index[baseTripId]) {
      index[baseTripId] = shapeId;
    }
  }

  return index;
}

function buildShapePoints() {
  const lines = readLines('shapes.txt');
  const header = parseCsvLine(lines.shift());
  const shapeIdx = header.indexOf('shape_id');
  const latIdx = header.indexOf('shape_pt_lat');
  const lonIdx = header.indexOf('shape_pt_lon');
  const seqIdx = header.indexOf('shape_pt_sequence');
  const grouped = new Map();

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const shapeId = String(cols[shapeIdx] || '').trim();
    if (!shapeId) continue;

    const points = grouped.get(shapeId) || [];
    points.push([
      Number(cols[seqIdx]),
      Number(Number(cols[latIdx]).toFixed(6)),
      Number(Number(cols[lonIdx]).toFixed(6)),
    ]);
    grouped.set(shapeId, points);
  }

  const shapePoints = {};
  for (const [shapeId, points] of grouped) {
    points.sort((a, b) => a[0] - b[0]);
    shapePoints[shapeId] = points.map(([, lat, lon]) => [lat, lon]);
  }

  return shapePoints;
}

function buildRouteStopShapeIndex(tripShapeIndex) {
  const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
  if (!fs.existsSync(stopTimesPath)) return {};

  const lines = readLines('stop_times.txt');
  const header = parseCsvLine(lines.shift());
  const tripIdx = header.indexOf('trip_id');
  const stopIdx = header.indexOf('stop_id');
  const seqIdx = header.indexOf('stop_sequence');
  const grouped = new Map();

  for (const line of lines) {
    const cols = parseCsvLine(line);
    const baseTripId = String(cols[tripIdx] || '').split('_')[0];
    const stopId = String(cols[stopIdx] || '').trim();
    if (!baseTripId || !stopId) continue;
    const stops = grouped.get(baseTripId) || [];
    stops.push([Number(cols[seqIdx]), stopId]);
    grouped.set(baseTripId, stops);
  }

  const index = {};
  for (const [tripId, stops] of grouped) {
    const shapeId = tripShapeIndex[tripId];
    if (!shapeId) continue;
    stops.sort((a, b) => a[0] - b[0]);
    const key = stops.map(([, stopId]) => stopId).join('-');
    if (key && !index[key]) index[key] = shapeId;
  }
  return index;
}

function safeShapeId(shapeId) {
  return String(shapeId || '').trim().replace(/[^a-zA-Z0-9_.+-]/g, '_');
}

fs.mkdirSync(publicDataDir, { recursive: true });
fs.rmSync(shapeOutDir, { recursive: true, force: true });
fs.mkdirSync(shapeOutDir, { recursive: true });

const tripShapeIndex = buildTripShapeIndex();
const shapePoints = buildShapePoints();
const routeStopShapeIndex = buildRouteStopShapeIndex(tripShapeIndex);

fs.writeFileSync(path.join(publicDataDir, 'trip-shape-index.json'), JSON.stringify(tripShapeIndex));
fs.writeFileSync(path.join(publicDataDir, 'route-stop-shape-index.json'), JSON.stringify(routeStopShapeIndex));
for (const [shapeId, points] of Object.entries(shapePoints)) {
  fs.writeFileSync(path.join(shapeOutDir, `${safeShapeId(shapeId)}.json`), JSON.stringify(points));
}

console.log(
  JSON.stringify(
    {
      tripCount: Object.keys(tripShapeIndex).length,
      shapeCount: Object.keys(shapePoints).length,
      routeStopShapeCount: Object.keys(routeStopShapeIndex).length,
      outDir: shapeOutDir,
    },
    null,
    2
  )
);
