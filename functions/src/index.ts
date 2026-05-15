import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();

type DeviceRole = 'owner' | 'admin' | 'user';
type DeviceStatus = 'active' | 'banned';
type DevicePermissions = {
  monitor: boolean;
  shield: boolean;
  users: boolean;
  group: boolean;
  logs: boolean;
  ban: boolean;
  canChangeRoles: boolean;
  disableMap: boolean;
  disableStops: boolean;
  globalSettings: boolean;
  globalSettingsEdit: boolean;
  canBan: boolean;
  canViewList: boolean;
};

const requireAuth = (uid?: string) => {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Auth required.');
  }
  return uid;
};

const getCaller = async (uid: string) => {
  const callerSnap = await db.collection('devices').doc(uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller device not registered.');
  }
  return callerSnap.data() as any;
};

const canManageRoles = (caller: any) =>
  caller.role === 'owner' ||
  (caller.role === 'admin' && caller.permissions?.canChangeRoles);

const canManageBans = (caller: any) =>
  caller.role === 'owner' ||
  (caller.role === 'admin' && (caller.permissions?.canBan || caller.permissions?.ban));

const writeAudit = async (title: string, description: string, iconType: string, actorId: string) => {
  await db.collection('admin_logs').add({
    title,
    description,
    iconType,
    category: 'OPERATOR',
    actorId,
    createdAt: FieldValue.serverTimestamp(),
  });
};

const targetLabelForAudit = (id: string, data: any): string => {
  const role = String(data?.role || 'user');
  const displayName = String(data?.displayName || '').trim();
  if ((role === 'owner' || role === 'admin') && displayName) return displayName.slice(0, 120);
  const info = String(data?.deviceInfo || '').trim();
  if (info) {
    const main = info.split(';')[0]?.trim() || info;
    return `${main} (${id.slice(0, 8)})`;
  }
  return `Urzadzenie (${id.slice(0, 8)})`;
};

const hasAnyTrue = (value: unknown, keys: string[]): boolean => {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return keys.some((k) => o[k] === true);
};

const canReadDevicesList = (caller: any): boolean => {
  if (caller?.role === 'owner') return true;
  if (caller?.role !== 'admin') return false;
  const perms = caller?.permissions;
  return hasAnyTrue(perms, ['monitor', 'canViewList']);
};

const PERMISSION_KEYS = [
  'monitor',
  'shield',
  'users',
  'group',
  'logs',
  'ban',
  'canChangeRoles',
  'disableMap',
  'disableStops',
  'globalSettings',
  'globalSettingsEdit',
  'canBan',
  'canViewList',
] as const;

const permissionKeySet = new Set<string>(PERMISSION_KEYS);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertValidDeviceId = (id: string) => {
  if (!id || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpsError('invalid-argument', 'Invalid target device id.');
  }
};

const callerHasPermission = (caller: any, key: string): boolean => {
  if (caller?.role === 'owner') return true;
  if (caller?.role !== 'admin' || !isPlainObject(caller?.permissions)) return false;
  const perms = caller.permissions as Record<string, unknown>;
  if (key === 'canBan') return perms.canBan === true || perms.ban === true;
  if (key === 'canViewList') return perms.canViewList === true || perms.monitor === true;
  return perms[key] === true;
};

const sanitizePermissionsForRole = (
  requested: unknown,
  role: DeviceRole,
  caller: any,
): DevicePermissions => {
  if (requested != null && !isPlainObject(requested)) {
    throw new HttpsError('invalid-argument', 'permissions must be an object.');
  }

  const req = (requested || {}) as Record<string, unknown>;
  for (const key of Object.keys(req)) {
    if (!permissionKeySet.has(key) || typeof req[key] !== 'boolean') {
      throw new HttpsError('invalid-argument', `Invalid permission field: ${key}`);
    }
  }

  if (role === 'owner') {
    if (caller?.role !== 'owner') {
      throw new HttpsError('permission-denied', 'Only owner can assign owner role.');
    }
    return permissionsForRole('owner');
  }

  const base = permissionsForRole(role);

  if (role === 'user') {
    if (caller?.role === 'owner') {
      return {
        ...base,
        disableMap: req.disableMap === true,
        disableStops: req.disableMap === true ? false : req.disableStops === true,
      };
    }
    for (const key of Object.keys(req)) {
      if (req[key] === true) {
        throw new HttpsError('permission-denied', 'Admin cannot grant user restrictions or elevated permissions.');
      }
    }
    return base;
  }

  const result: DevicePermissions = {
    ...base,
    monitor: true,
    canViewList: true,
    disableMap: false,
    disableStops: false,
  };

  for (const key of PERMISSION_KEYS) {
    if (key === 'monitor' || key === 'canViewList' || key === 'disableMap' || key === 'disableStops') continue;
    if (typeof req[key] !== 'boolean') continue;
    if (caller?.role !== 'owner' && req[key] === true && !callerHasPermission(caller, key)) {
      throw new HttpsError('permission-denied', `Cannot grant permission above caller rights: ${key}`);
    }
    (result as unknown as Record<string, boolean>)[key] = req[key] === true;
  }

  result.canBan = result.ban || result.canBan;
  return result;
};

const sanitizeDisplayName = (raw: unknown): string | null => {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new HttpsError('invalid-argument', 'displayName must be a string.');
  const value = raw.trim().slice(0, 120);
  return value || null;
};

const normalizeInstallationId = (raw: unknown): string => {
  const v = String(raw || '').trim().slice(0, 128);
  if (!v) return '';
  return v.replace(/[^a-zA-Z0-9_-]/g, '');
};

const normalizeDeviceInfo = (raw: unknown): string => String(raw || '').trim().slice(0, 200);

const blockedInstallationRef = (installationId: string) =>
  db.collection('blocked_installations').doc(installationId);

const permissionsForRole = (role: DeviceRole): DevicePermissions => {
  if (role === 'owner') {
    return {
      monitor: true,
      shield: true,
      users: true,
      group: true,
      logs: true,
      ban: true,
      canChangeRoles: true,
      disableMap: false,
      disableStops: false,
      globalSettings: true,
      globalSettingsEdit: true,
      canBan: true,
      canViewList: true,
    };
  }
  if (role === 'admin') {
    return {
      monitor: true,
      shield: false,
      users: false,
      group: false,
      logs: false,
      ban: true,
      canChangeRoles: false,
      disableMap: false,
      disableStops: false,
      globalSettings: false,
      globalSettingsEdit: false,
      canBan: true,
      canViewList: true,
    };
  }
  return {
    monitor: false,
    shield: false,
    users: false,
    group: false,
    logs: false,
    ban: false,
    canChangeRoles: false,
    disableMap: false,
    disableStops: false,
    globalSettings: false,
    globalSettingsEdit: false,
    canBan: false,
    canViewList: false,
  };
};

const isAllFalsePermissions = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return true;
  const keys = [
    'monitor',
    'shield',
    'users',
    'group',
    'logs',
    'ban',
    'globalSettings',
    'globalSettingsEdit',
    'canBan',
    'canViewList',
    'canChangeRoles',
  ] as const;
  return keys.every((k) => (value as Record<string, unknown>)[k] !== true);
};

const toHttpsError = (err: unknown, fallbackMessage: string): HttpsError => {
  if (err instanceof HttpsError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new HttpsError('internal', `${fallbackMessage}: ${message}`);
};

const toClientDeviceItem = (id: string, data: any) => {
  const lastSeenMs =
    typeof data.lastSeenAt?.toMillis === 'function'
      ? data.lastSeenAt.toMillis()
      : typeof data.lastSeenAt?._seconds === 'number'
        ? data.lastSeenAt._seconds * 1000
        : null;

  return {
    id,
    deviceInfo: typeof data.deviceInfo === 'string' ? data.deviceInfo : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    role: (data.role || 'user') as DeviceRole,
    firstLogin: typeof data.firstLogin === 'string' ? data.firstLogin : '',
    status: data.status === 'banned' ? 'banned' : 'active',
    permissions: data.permissions && typeof data.permissions === 'object' ? data.permissions : {},
    banDetails: data.banDetails && typeof data.banDetails === 'object' ? data.banDetails : undefined,
    installationId: typeof data.installationId === 'string' ? data.installationId : undefined,
    identityVersion: typeof data.identityVersion === 'number' ? data.identityVersion : undefined,
    lastSeenAtMs: lastSeenMs,
  };
};

export const registerDeviceIdentity = onCall(async (request) => {
  try {
    const uid = requireAuth(request.auth?.uid);
    const installationId = normalizeInstallationId(request.data?.installationId);
    const deviceInfo = normalizeDeviceInfo(request.data?.deviceInfo);

    if (!installationId) {
      throw new HttpsError('invalid-argument', 'installationId is required.');
    }

    const deviceRef = db.collection('devices').doc(uid);
    const now = FieldValue.serverTimestamp();

    const installationRef = db.collection('installations').doc(installationId);
    const [existingSnap, blockedSnap, installationSnap] = await Promise.all([
      deviceRef.get(),
      blockedInstallationRef(installationId).get(),
      installationRef.get(),
    ]);

    const blocked = blockedSnap.exists ? blockedSnap.data() as any : null;
    const isBlocked = blocked?.active === true;
    const status: DeviceStatus = isBlocked ? 'banned' : 'active';
    const patch: Record<string, unknown> = {
      installationId,
      identityVersion: 2,
      deviceInfo,
      lastSeenAt: now,
      status,
      updatedAt: now,
    };

    const installation = installationSnap.exists ? (installationSnap.data() as any) : null;
    const lastUid = String(installation?.lastUid || '').trim();

  // If UID changed (e.g. different web port / fresh install), inherit role/permissions/displayName
  // from the last known UID for this installationId to avoid losing access.
    if (!existingSnap.exists && lastUid && lastUid !== uid) {
      const prevSnap = await db.collection('devices').doc(lastUid).get();
      if (prevSnap.exists) {
        const prev = prevSnap.data() as any;
        const prevRole = (prev?.role || 'user') as DeviceRole;
        patch.role = prevRole;
        patch.permissions = prev?.permissions && typeof prev.permissions === 'object'
          ? prev.permissions
          : permissionsForRole(prevRole);
        if (typeof prev.displayName === 'string' && prev.displayName.trim()) {
          patch.displayName = prev.displayName.trim().slice(0, 120);
        }
      }
    }

    if (!existingSnap.exists) {
      if (!('role' in patch)) patch.role = 'user';
      patch.firstLogin = new Date().toISOString();
      if (!('permissions' in patch)) patch.permissions = permissionsForRole(patch.role as DeviceRole);
    } else {
      const existing = existingSnap.data() as any;
      const existingRole = (existing?.role || 'user') as DeviceRole;
      if (
        (existingRole === 'admin' || existingRole === 'owner') &&
        isAllFalsePermissions(existing?.permissions)
      ) {
        patch.permissions = permissionsForRole(existingRole);
      }
    }

    if (isBlocked) {
      patch.banDetails = {
        reason: String(blocked?.reason || 'Blokada instalacji'),
        expiresAt: String(blocked?.expiresAt || ''),
        gifUrl: 'https://media.giphy.com/media/3oEjI67Egb8G9jqs3m/giphy.gif',
      };
    }

    await deviceRef.set(patch, { merge: true });

    await installationRef.set(
      {
        installationId,
        knownUids: FieldValue.arrayUnion(uid),
        lastUid: uid,
        lastSeenAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    return { ok: true, installationId, status };
  } catch (err: unknown) {
    throw toHttpsError(err, 'registerDeviceIdentity failed');
  }
});

export const listDevicesForAdmin = onCall(async (request) => {
  try {
    const uid = requireAuth(request.auth?.uid);
    const caller = await getCaller(uid);
    if (!canReadDevicesList(caller)) {
      throw new HttpsError('permission-denied', 'Insufficient permissions to list devices.');
    }

    const snap = await db.collection('devices').limit(500).get();
    const items = snap.docs.map((d) => toClientDeviceItem(d.id, d.data() as any));
    return { ok: true, items };
  } catch (err: unknown) {
    throw toHttpsError(err, 'listDevicesForAdmin failed');
  }
});

const UPSTREAM = 'http://einfo.zgpks.rzeszow.pl/api';
const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Language': 'pl,en;q=0.9',
  Referer: 'http://einfo.zgpks.rzeszow.pl/',
  Origin: 'http://einfo.zgpks.rzeszow.pl',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export const einfoProxyGet = onCall(async (request) => {
  const path = String(request.data?.path || '').replace(/^\//, '');
  const query = String(request.data?.query || '');
  if (!path) throw new HttpsError('invalid-argument', 'path is required');
  if (path.includes('..')) throw new HttpsError('invalid-argument', 'invalid path');

  const url = `${UPSTREAM}/${path}${query && query.startsWith('?') ? query : query ? `?${query}` : ''}`;
  const res = await fetch(url, { headers: UPSTREAM_HEADERS });
  const text = await res.text();
  if (!res.ok) {
    throw new HttpsError('unavailable', `Upstream ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    throw new HttpsError('unavailable', `Invalid JSON: ${text.slice(0, 300)}`);
  }
});

export const setOperatorRole = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const caller = await getCaller(uid);
  if (!canManageRoles(caller)) {
    throw new HttpsError('permission-denied', 'Insufficient permissions.');
  }

  const targetDeviceId = String(request.data?.targetDeviceId || '');
  const role = request.data?.role as DeviceRole;
  const requestedPermissions = request.data?.permissions || {};
  if (!targetDeviceId || !['owner', 'admin', 'user'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Invalid role update payload.');
  }
  assertValidDeviceId(targetDeviceId);
  if (targetDeviceId === uid) {
    throw new HttpsError('permission-denied', 'Cannot change own role or permissions.');
  }
  const targetRef = db.collection('devices').doc(targetDeviceId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Target device not found.');
  }
  const target = targetSnap.data() as any;
  if (caller.role !== 'owner' && target.role !== 'user') {
    throw new HttpsError('permission-denied', 'Only owner can manage owners and admins.');
  }
  if (caller.role !== 'owner' && role === 'owner') {
    throw new HttpsError('permission-denied', 'Admin cannot assign owner role.');
  }

  const permissions = sanitizePermissionsForRole(requestedPermissions, role, caller);
  const displayName = sanitizeDisplayName(request.data?.displayName);
  const patch: Record<string, unknown> = {
    role,
    permissions,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
  if (displayName) patch.displayName = displayName;

  await targetRef.set(patch, { merge: true });

  const installationId = normalizeInstallationId(target.installationId);
  if (installationId) {
    await db.collection('installations').doc(installationId).set(
      {
        installationId,
        role,
        permissions,
        ...(displayName ? { displayName } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }

  await writeAudit('Zmieniono role operatora', `${targetLabelForAudit(targetDeviceId, target)} -> ${role}`, 'role_change', uid);
  return { ok: true };
});

export const blockDevice = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const caller = await getCaller(uid);
  if (!canManageBans(caller)) {
    throw new HttpsError('permission-denied', 'Insufficient permissions.');
  }

  const targetDeviceId = String(request.data?.targetDeviceId || '');
  const reason = String(request.data?.reason || 'Naruszenie regulaminu').trim().slice(0, 300);
  const expiresAt = request.data?.expiresAt ? String(request.data.expiresAt) : '';
  if (!targetDeviceId) {
    throw new HttpsError('invalid-argument', 'targetDeviceId is required.');
  }
  assertValidDeviceId(targetDeviceId);
  if (targetDeviceId === uid) {
    throw new HttpsError('permission-denied', 'Cannot ban own device.');
  }
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid expiresAt.');
  }

  const targetRef = db.collection('devices').doc(targetDeviceId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Target device not found.');
  }
  const target = targetSnap.data() as any;
  if (caller.role !== 'owner' && target.role !== 'user') {
    throw new HttpsError('permission-denied', 'Only owner can ban owners and admins.');
  }
  const targetLabel = targetLabelForAudit(targetDeviceId, target);
  const installationId = normalizeInstallationId(target.installationId);
  const gifUrl = typeof request.data?.gifUrl === 'string' ? request.data.gifUrl.trim().slice(0, 500) : '';
  const silent = request.data?.silent === true;

  if (target.status === 'banned') {
    if (installationId) {
      await blockedInstallationRef(installationId).set(
        {
          active: true,
          reason,
          expiresAt,
          gifUrl,
          silent,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        },
        { merge: true },
      );
    }
    return { ok: true, alreadyBanned: true };
  }

  await targetRef.set(
    {
      status: 'banned',
      banDetails: {
        reason,
        expiresAt,
        gifUrl,
        silent,
        bannedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );

  if (installationId) {
    await blockedInstallationRef(installationId).set(
      {
        active: true,
        reason,
        expiresAt,
        gifUrl,
        silent,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }

  await writeAudit('Nadano bana urzadzeniu', `${targetLabel}. Powod: ${reason}`, 'ban', uid);
  return { ok: true };
});


export const unblockDevice = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const caller = await getCaller(uid);
  if (!canManageBans(caller)) {
    throw new HttpsError('permission-denied', 'Insufficient permissions.');
  }

  const targetDeviceId = String(request.data?.targetDeviceId || '');
  if (!targetDeviceId) {
    throw new HttpsError('invalid-argument', 'targetDeviceId is required.');
  }
  assertValidDeviceId(targetDeviceId);
  if (targetDeviceId === uid) {
    throw new HttpsError('permission-denied', 'Cannot unblock own device.');
  }

  const targetRef = db.collection('devices').doc(targetDeviceId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'Target device not found.');
  }
  const target = targetSnap.data() as any;
  if (caller.role !== 'owner' && target.role !== 'user') {
    throw new HttpsError('permission-denied', 'Only owner can unblock owners and admins.');
  }
  const targetLabel = targetLabelForAudit(targetDeviceId, target);
  const installationId = normalizeInstallationId(target.installationId);

  await targetRef.set(
    {
      status: 'active',
      banDetails: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );

  if (installationId) {
    await blockedInstallationRef(installationId).set(
      {
        active: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true },
    );
  }

  await writeAudit('Zdjeto blokade urzadzenia', `Odblokowano: ${targetLabel}`, 'edit_role', uid);
  return { ok: true };
});

export const clearAdminLogs = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const caller = await getCaller(uid);
  if (caller.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only owner can clear logs.');
  }

  let deleted = 0;
  for (;;) {
    const snap = await db.collection('admin_logs').limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((logDoc) => batch.delete(logDoc.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < 400) break;
  }

  return { ok: true, deleted };
});
