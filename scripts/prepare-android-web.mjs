import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';

const root = process.cwd();
const outDir = path.join(root, 'out');
const appDir = path.join(root, '.next', 'server', 'app');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

function cleanDir(dir) {
  fs.rmSync(dir, {recursive: true, force: true});
  ensureDir(dir);
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, fs.readFileSync(src));
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      ensureDir(path.dirname(to));
      fs.writeFileSync(to, fs.readFileSync(from));
    }
  }
}

cleanDir(outDir);

copyIfExists(path.join(appDir, 'index.html'), path.join(outDir, 'index.html'));
copyIfExists(path.join(appDir, 'widget-data.html'), path.join(outDir, 'widget-data', 'index.html'));
copyIfExists(path.join(appDir, 'admin.html'), path.join(outDir, 'admin', 'index.html'));
copyIfExists(path.join(appDir, '_not-found.html'), path.join(outDir, '404.html'));
copyIfExists(path.join(appDir, 'manifest.webmanifest.body'), path.join(outDir, 'manifest.webmanifest'));
copyIfExists(path.join(appDir, 'icon.png.body'), path.join(outDir, 'icon.png'));
copyIfExists(path.join(appDir, 'apple-icon.png.body'), path.join(outDir, 'apple-icon.png'));

copyDir(staticDir, path.join(outDir, '_next', 'static'));
copyDir(publicDir, outDir);

// Ship the exact filenames read by the WebView. Do not rely on aapt's implicit
// gunzip/rename of assets ending in .gz.
for (const provider of ['pks', 'mpk']) {
  const compressed = path.join(outDir, 'data', 'journeys', provider + '.json.gz');
  const payload = gunzipSync(fs.readFileSync(compressed));
  const feed = JSON.parse(payload.toString('utf8'));
  if (feed.version !== 1 || feed.provider !== provider || !feed.trips?.length) throw new Error('Invalid timetable: ' + provider);
  fs.writeFileSync(compressed.slice(0, -3), payload);
  fs.rmSync(compressed);
}

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  throw new Error('Failed to assemble Android web assets: out/index.html is missing.');
}

execFileSync(process.execPath, ['scripts/build-platform-index.cjs'], {stdio:'inherit'});

execFileSync(process.execPath, ['scripts/optimize-provider-png.cjs'], {stdio:'inherit'});
