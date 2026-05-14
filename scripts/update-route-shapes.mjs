import fs from 'fs';
import path from 'path';

const gtfsDir = path.join(process.cwd(), 'tmp_gtfs_pks');
const outDir = path.join(process.cwd(), 'app', 'api', 'route-shape');

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

fs.mkdirSync(outDir, { recursive: true });

const tripShapeIndex = buildTripShapeIndex();
const shapePoints = buildShapePoints();

fs.writeFileSync(path.join(outDir, 'trip-shape-index.json'), JSON.stringify(tripShapeIndex));
fs.writeFileSync(path.join(outDir, 'shape-points.json'), JSON.stringify(shapePoints));

console.log(
  JSON.stringify(
    {
      tripCount: Object.keys(tripShapeIndex).length,
      shapeCount: Object.keys(shapePoints).length,
      outDir,
    },
    null,
    2
  )
);
