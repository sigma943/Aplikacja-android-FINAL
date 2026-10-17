'use strict';

// Admin SDK in production; emulator adapter in tests. Never touches identities.
async function migrateStatisticsAccess(db, deleteField) {
  const security = db.doc('admin_settings/security');
  const access = db.doc('admin_settings/statistics_access');
  return db.runTransaction(async tx => {
    const source = await tx.get(security);
    const target = await tx.get(access);
    const legacy = source.data()?.statisticsAccess;
    if (legacy === undefined) return { migrated: false };
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy) ||
        Object.values(legacy).some(flag => typeof flag !== 'boolean')) {
      throw new Error('Invalid legacy statistics access; migration stopped without writes.');
    }
    const current = target.data()?.statisticsAccess ?? {};
    if (!current || typeof current !== 'object' || Array.isArray(current) ||
        Object.values(current).some(flag => typeof flag !== 'boolean')) {
      throw new Error('Invalid private statistics access; migration stopped without writes.');
    }
    // Restrictive decisions win if an old and a new APK wrote different copies.
    const merged = { ...legacy, ...current };
    for (const key of new Set([...Object.keys(legacy), ...Object.keys(current)])) {
      if (legacy[key] === false || current[key] === false) merged[key] = false;
    }
    tx.set(access, { statisticsAccess: merged });
    tx.update(security, { statisticsAccess: deleteField() });
    return { migrated: true };
  });
}

module.exports = { migrateStatisticsAccess };
