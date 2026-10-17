'use strict';

const backendRequire = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = backendRequire('firebase-admin/app');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
const { migrateStatisticsAccess } = require('./lib/migrate-statistics-access.cjs');
const { migrateInstallationMetadata } = require('./lib/migrate-installation-metadata.cjs');

// Intentional explicit project: never infer a production target from local defaults.
const projectId = process.argv[2];
if (!projectId || (projectId !== 'aplikacja-b20fa' &&
    !(process.env.FIRESTORE_EMULATOR_HOST && projectId.startsWith('demo-')))) {
  throw new Error('Specify the approved Firebase project or a demo emulator project.');
}
initializeApp({ projectId, credential: applicationDefault() });
async function migrate() {
  const db = getFirestore();
  const result = await migrateStatisticsAccess(db, () => FieldValue.delete());
  // Bounded pages avoid reading every installation into memory or one huge transaction.
  let cursor;
  let changed = 0;
  while (true) {
    let query = db.collection('installations').orderBy('__name__').limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const profile of page.docs) if (await migrateInstallationMetadata(db, profile.ref)) changed++;
    if (page.size < 200) break;
    cursor = page.docs[page.docs.length - 1];
  }
  console.info(result.migrated ? 'Statistics access moved to private settings.' : 'Statistics access migration already complete.');
  console.info(`Installation metadata synchronized: ${changed}.`);
}
migrate()
  .catch(() => { console.error('Statistics access migration failed; rules deployment must stop.'); process.exitCode = 1; });
