'use strict';

// Copy only the metadata the old restoration path read from the previous UID.
// Permissions, roles, status, bans, approval and stable identifiers stay untouched.
async function migrateInstallationMetadata(db, profileRef) {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(profileRef);
    const profile = snapshot.data();
    if (!profile || typeof profile.lastUid !== 'string' || !/^[\w-]{6,128}$/.test(profile.lastUid)) return false;
    const previous = (await tx.get(db.doc(`devices/${profile.lastUid}`))).data();
    if (previous && previous.installationId !== snapshot.id) return false;
    const patch = profile.restorationMetadataVersion === 1 ? {} : { restorationMetadataVersion: 1 };
    for (const key of ['firstLogin', 'deviceName']) {
      if (typeof previous?.[key] === 'string' && previous[key] && previous[key] !== profile[key]) patch[key] = previous[key];
    }
    if (!Object.keys(patch).length) return false;
    tx.update(profileRef, patch);
    return true;
  });
}

module.exports = { migrateInstallationMetadata };
