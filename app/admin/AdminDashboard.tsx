'use client';

import type { CSSProperties } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { DeviceTable } from './components/DeviceTable';
import { OperatorsView } from './components/OperatorsView';
import { LogsView } from './components/LogsView';
import { BansView } from './components/BansView';
import { RolesModal } from './components/RolesModal';
import { BanModal } from './components/BanModal';
import { BanScreen } from './components/BanScreen';
import { ToastContainer, ToastMessage } from './components/ToastContainer';
import { Device, Ban, Role, Status, IconType, Operator, OperatorRole, Log } from './types';
import { cn } from '@/lib/utils';

import { useFirebase, DeviceData } from '@/components/FirebaseProvider';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  setDoc,
  deleteField,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  buildDevicePermissions,
  normalizeAdminPermissions,
  toLegacyPermissions,
  effectiveAdminPermissionsForDisplay,
  canAccessAdminDashboard,
  type DeviceRole,
} from '@/lib/admin/rbac';
import {
  formatDeviceLabel,
  formatDeviceTechnicalLabel,
  formatDeviceOsSummary,
  formatRelativeTimePl,
  formatWarsawDateTimeParts,
  initialsFromPersonName,
  warsawDateKey,
  extractDeviceModelCode,
  type DeviceModelAliases,
} from '@/lib/format-device-label';
import { agentLog } from '@/lib/debug-agent-log';

type AdminLogRaw = {
  id: string;
  createdAtMs: number;
  title: string;
  description: string;
  category: Log['category'];
  iconType: Log['iconType'];
};

function lastSeenInfoFromMs(ms: number | null | undefined, nowMs = Date.now()): { label: string; online: boolean } {
  if (!ms || Number.isNaN(ms)) return { label: 'Brak sygnału', online: false };
  const diff = Math.max(0, nowMs - ms);
  if (diff <= 60_000) return { label: 'teraz', online: true };
  if (diff < 3600_000) return { label: `${Math.max(1, Math.floor(diff / 60_000))} min temu`, online: false };
  const hours = Math.max(1, Math.floor(diff / 3600_000));
  return { label: `${hours} godz. temu`, online: false };
}

function lastSeenInfoOfflineFromMs(ms: number | null | undefined): { label: string; online: boolean } {
  const info = lastSeenInfoFromMs(ms);
  return { label: info.online ? '1 min temu' : info.label, online: false };
}

function lastSeenLabelFromDevice(d: { lastSeenAt?: { toDate?: () => Date } | null }): string {
  const t = d.lastSeenAt?.toDate?.();
  if (!t || Number.isNaN(t.getTime())) return 'Brak sygnału';
  const { date, time } = formatWarsawDateTimeParts(t.getTime());
  return `${date}, ${time}`;
}

function deviceLabelById(devices: ({ id: string } & DeviceData)[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const d of devices) {
    m[d.id] = formatAdminTargetLabel(d, d.id);
  }
  return m;
}

function formatAdminTargetLabel(d: ({ id: string } & DeviceData) | undefined, fallbackId?: string): string {
  if (!d) return fallbackId ? `Urządzenie (${fallbackId.slice(0, 8)}…)` : 'Urządzenie';
  if ((d.role === 'owner' || d.role === 'admin') && String(d.displayName || '').trim()) {
    return formatDeviceLabel({ displayName: d.displayName, deviceInfo: d.deviceInfo, deviceId: d.id });
  }
  return formatDeviceTechnicalLabel(d.deviceInfo, d.id);
}

function humanizeGlobalSettingsDescription(raw: string): string {
  const s = raw.trim();
  if (!s.startsWith('{')) return raw;
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return raw;
    const bits: string[] = [];
    if ('loginEnabled' in o) bits.push(o.loginEnabled ? 'logowanie włączone' : 'logowanie wyłączone');
    if ('maintenanceMode' in o) bits.push(o.maintenanceMode ? 'tryb konserwacji włączony' : 'tryb konserwacji wyłączony');
    if ('autoBan' in o) bits.push(o.autoBan ? 'auto-ban włączony' : 'auto-ban wyłączony');
    return bits.length ? bits.join(' · ') : raw;
  } catch {
    return raw;
  }
}

function prettifyIdArrowDescription(desc: string, labelFor: (id: string) => string): string {
  const arrow = ' -> ';
  const i = desc.indexOf(arrow);
  if (i <= 0) return desc;
  const left = desc.slice(0, i).trim();
  const right = desc.slice(i + arrow.length).trim();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(left)) return desc;
  return `${labelFor(left)} → ${right}`;
}

function enrichAdminLogsForUi(raw: AdminLogRaw[], devices: ({ id: string } & DeviceData)[]): Log[] {
  const labels = deviceLabelById(devices);
  const labelFor = (id: string) => labels[id] || `Urządzenie (${id.slice(0, 8)}…)`;
  const now = Date.now();

  return raw.map((r) => {
    let description = r.description;
    if (r.title.toLowerCase().includes('ustawienia globalne') || description.trim().startsWith('{')) {
      description = humanizeGlobalSettingsDescription(description);
    }
    if (description.includes(' -> ')) {
      description = prettifyIdArrowDescription(description, labelFor);
    }

    const rel = formatRelativeTimePl(r.createdAtMs, now);
    const { date, time } = formatWarsawDateTimeParts(r.createdAtMs);

    return {
      id: r.id,
      createdAtMs: r.createdAtMs,
      date,
      time,
      timeAgo: rel,
      title: r.title,
      description,
      category: r.category,
      iconType: r.iconType,
    };
  });
}

const mapRole = (role: DeviceRole): Role => {
  if (role === 'owner') return 'Właściciel' as Role;
  if (role === 'admin') return 'Administrator' as Role;
  return 'Użytkownik' as Role;
};

const mapStatus = (status: string): Status => {
  return status === 'banned' ? 'Zablokowany' : 'Aktywny';
};

const determineIconType = (deviceInfo: string): IconType => {
  const info = deviceInfo.toLowerCase();
  if (info.includes('iphone') || info.includes('android') || info.includes('mobile')) return 'mobile';
  if (info.includes('ipad') || info.includes('tablet')) return 'tablet';
  return 'desktop';
};

function computeBanStats(devices: ({ id: string } & DeviceData)[]) {
  const now = Date.now();
  const todayKey = warsawDateKey(now);
  const activeBans = devices.filter((d) => d.status === 'banned').length;

  const expireToday = devices.filter((d) => {
    if (d.status !== 'banned' || !d.banDetails?.expiresAt) return false;
    const exp = new Date(d.banDetails.expiresAt).getTime();
    if (Number.isNaN(exp)) return false;
    return warsawDateKey(exp) === todayKey && exp > now;
  }).length;

  const everWithBanDetails = devices.filter(
    (d) => d.banDetails != null && typeof d.banDetails === 'object',
  ).length;

  return {
    activeBans,
    expireToday,
    everWithBanDetails,
  };
}

export interface AdminDashboardProps {
  embedded?: boolean;
  onExit?: () => void;
  /** Kolor akcentu z ustawień mapy (kolorystyka) */
  themeColor?: string;
  isDarkTheme?: boolean;
}

export default function AdminDashboard({ embedded = false, onExit, themeColor = '#00A3A2', isDarkTheme = true }: AdminDashboardProps) {
  const { device: currentDevice, loading, user, localLastSeenMs } = useFirebase();
  const [devicesData, setDevicesData] = useState<({ id: string } & DeviceData)[]>([]);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [adminLogRaws, setAdminLogRaws] = useState<AdminLogRaw[]>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [modelAliases, setModelAliases] = useState<DeviceModelAliases>({});
  const [globalSettings, setGlobalSettings] = useState({
    loginEnabled: true,
    maintenanceMode: false,
    autoBan: true,
  });

  const [activeView, setActiveView] = useState('devices');
  const [selectedDeviceForRole, setSelectedDeviceForRole] = useState<Device | null>(null);
  const [selectedDeviceForBan, setSelectedDeviceForBan] = useState<Device | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileValue, setEditProfileValue] = useState('');
  const [editProfileSaving, setEditProfileSaving] = useState(false);

  useEffect(() => {
    if (loading || !currentDevice) return;
    if (!canAccessAdminDashboard(currentDevice.role, currentDevice.permissions)) return;

    const caps = effectiveAdminPermissionsForDisplay(currentDevice.role, currentDevice.permissions);
    // #region agent log
    agentLog(
      'AdminDashboard.tsx:devicesSub:start',
      'Subscribing to devices collection',
      {
        uidPrefix: (user?.uid ?? '').slice(0, 8),
        role: currentDevice.role,
        monitor: caps.monitor,
        canViewList: Boolean(
          (currentDevice.permissions as Record<string, unknown> | undefined)?.canViewList,
        ),
      },
      'H1',
    );
    // #endregion

    const q = query(collection(db, 'devices'), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const data: ({ id: string } & DeviceData)[] = snap.docs.map((d) => {
        const raw = d.data() as any;
        return { id: d.id, ...(raw as DeviceData) };
      });
      setDevicesError(null);
      setDevicesData(data);
    }, (e: unknown) => {
      console.error('[AdminDashboard] Firestore list devices failed', e);
      const ex = e as any;
      const code = String(ex?.code ?? '');
      const message = String(ex?.message ?? String(e));
      const denied = code.includes('permission-denied') || message.toLowerCase().includes('insufficient permissions');
      setDevicesError(
        denied
          ? 'Brak uprawnień do listy urządzeń albo reguły Firestore odrzuciły zapytanie.'
          : 'Nie udało się pobrać listy urządzeń.',
      );
      // #region agent log
      agentLog(
        'AdminDashboard.tsx:devicesFirestore:err',
        'Firestore devices fetch failed',
        {
          code,
          message: message.slice(0, 240),
          detailsType: typeof ex?.details,
        },
        'H2',
      );
      // #endregion
    });

    return () => unsub();
  }, [currentDevice, loading]);

  useEffect(() => {
    if (loading || !currentDevice) return;
    if (!canAccessAdminDashboard(currentDevice.role, currentDevice.permissions)) return;

    const unsub = onSnapshot(
      collection(db, 'device_model_aliases'),
      (snap) => {
        const next: DeviceModelAliases = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { code?: string; label?: string };
          const code = String(data.code || d.id || '').trim().toUpperCase();
          const label = String(data.label || '').trim().slice(0, 80);
          if (code && label) next[code] = label;
        });
        setModelAliases(next);
      },
      (err) => console.error('[device_model_aliases]', err),
    );

    return () => unsub();
  }, [currentDevice, loading]);

  useEffect(() => {
    if (loading || !currentDevice) return;
    const caps = effectiveAdminPermissionsForDisplay(currentDevice.role, currentDevice.permissions);
    if (!caps.globalSettings && !caps.globalSettingsEdit) return;

    const unsub = onSnapshot(doc(db, 'admin_settings', 'security'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      setGlobalSettings({
        loginEnabled: Boolean(data.loginEnabled),
        maintenanceMode: Boolean(data.maintenanceMode),
        autoBan: Boolean(data.autoBan),
      });
    });
    return () => unsub();
  }, [currentDevice, loading]);

  useEffect(() => {
    if (loading || !currentDevice) return;
    const caps = effectiveAdminPermissionsForDisplay(currentDevice.role, currentDevice.permissions);
    const canReadLogs = currentDevice.role === 'owner' || caps.logs;
    if (!canReadLogs || activeView !== 'logs') {
      setAdminLogRaws([]);
      setLogsError(null);
      return;
    }

    setLogsError(null);
    const logsQuery = query(collection(db, 'admin_logs'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      logsQuery,
      (snap) => {
        setLogsError(null);
        const next: AdminLogRaw[] = snap.docs.map((d) => {
          const data = d.data() as { createdAt?: { toDate?: () => Date } };
          const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
          const createdAtMs = date.getTime();
          return {
            id: d.id,
            createdAtMs,
            title: (data as { title?: string }).title || 'Akcja administracyjna',
            description: (data as { description?: string }).description || '',
            category: ((data as { category?: string }).category || 'OPERATOR') as Log['category'],
            iconType: ((data as { iconType?: Log['iconType'] }).iconType || 'edit_role') as Log['iconType'],
          };
        });
        setAdminLogRaws(next);
      },
      (err) => {
        console.error('[admin_logs]', err);
        setAdminLogRaws([]);
        setLogsError(err?.message || String(err));
      },
    );

    return () => unsub();
  }, [activeView, currentDevice, loading]);

  useEffect(() => {
    if (loading || !currentDevice) return;
    const caps = effectiveAdminPermissionsForDisplay(currentDevice.role, currentDevice.permissions);
    if (activeView === 'logs' && !caps.logs) setActiveView('devices');
    if (activeView === 'operators' && !caps.shield) setActiveView('devices');
    if (activeView === 'bans' && currentDevice.role !== 'owner' && !caps.group) setActiveView('devices');
  }, [activeView, currentDevice, loading]);

  const logsData = useMemo(() => enrichAdminLogsForUi(adminLogRaws, devicesData), [adminLogRaws, devicesData]);

  const banStats = computeBanStats(devicesData);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#040609] flex items-center justify-center text-white">Ładowanie...</div>
    );
  }

  if (!currentDevice || !canAccessAdminDashboard(currentDevice.role, currentDevice.permissions)) {
    return (
      <div className="min-h-screen bg-[#040609] flex items-center justify-center font-sans text-slate-500">
        Brak uprawnień
      </div>
    );
  }

  const uid = user?.uid ?? '';

  const myCaps = effectiveAdminPermissionsForDisplay(currentDevice.role, currentDevice.permissions);
  const globalSettingsSectionVisible =
    currentDevice.role === 'owner' || myCaps.globalSettings || myCaps.globalSettingsEdit;
  const globalSettingsCanSave = currentDevice.role === 'owner' || myCaps.globalSettingsEdit;
  const allowedNavIds: string[] = ['devices'];
  if (currentDevice.role === 'owner' || myCaps.shield) allowedNavIds.push('operators');
  if (currentDevice.role === 'owner' || myCaps.group) allowedNavIds.push('bans');
  if (currentDevice.role === 'owner' || myCaps.logs) allowedNavIds.push('logs');

  const canBanUi = currentDevice.role === 'owner' || myCaps.ban;
  const canChangeRolesUi = currentDevice.role === 'owner' || myCaps.canChangeRoles;

  const lastSeenInfoFor = (d: { id: string; role?: DeviceRole; status?: DeviceData['status']; lastSeenAt?: { toDate?: () => Date } | null }) => {
    const firestoreMs = d.lastSeenAt?.toDate?.()?.getTime();
    if (d.status === 'banned') return lastSeenInfoOfflineFromMs(firestoreMs);
    if (globalSettings.maintenanceMode && d.role === 'user') return lastSeenInfoOfflineFromMs(firestoreMs);
    if (d.id === uid && localLastSeenMs) {
      const bestMs = Math.max(localLastSeenMs, firestoreMs ?? 0);
      return lastSeenInfoFromMs(bestMs);
    }
    return lastSeenInfoFromMs(firestoreMs);
  };

  const devices: Device[] = devicesData.map((d) => ({
    id: d.id,
    name: formatDeviceTechnicalLabel(d.deviceInfo, d.id, modelAliases),
    deviceInfo: d.deviceInfo,
    modelCode: extractDeviceModelCode(d.deviceInfo),
    os: formatDeviceOsSummary(d.deviceInfo, modelAliases),
    displayName: d.displayName,
    deviceId: d.id,
    firstLogin: new Date(d.firstLogin).toLocaleString('pl-PL'),
    role: mapRole(d.role),
    rawRole: d.role,
    status: mapStatus(d.status),
    iconType: determineIconType(d.deviceInfo),
    lastSeenLabel: lastSeenInfoFor(d).label,
    lastSeenOnline: lastSeenInfoFor(d).online,
    permissions: effectiveAdminPermissionsForDisplay(d.role, d.permissions),
  }));

  const operators: Operator[] = devicesData
    .filter((d) => d.status !== 'banned' && (d.role === 'owner' || d.role === 'admin'))
    .map((d) => {
      const role = (
        d.role === 'owner' ? 'WŁAŚCICIEL' : d.role === 'admin' ? 'ADMIN' : 'UŻYTKOWNIK'
      ) as OperatorRole;
      const permissions = effectiveAdminPermissionsForDisplay(d.role, d.permissions);
      const lastSeenInfo = lastSeenInfoFor(d);
      return {
        id: d.id,
        name: formatDeviceLabel({
          displayName: d.displayName,
          deviceInfo: d.deviceInfo,
          deviceId: d.id,
        }),
        role,
        innerId: d.id.slice(0, 8),
        lastActive: lastSeenInfo.label,
        lastActiveOnline: lastSeenInfo.online,
        permissions,
      };
    });

  const bans: Ban[] = devicesData
    .filter((d) => d.status === 'banned')
    .map((d) => {
      const expiresAt = d.banDetails?.expiresAt ? String(d.banDetails.expiresAt) : '';
      const hasExpiry = Boolean(expiresAt);
      const bannedAt = d.banDetails && typeof (d.banDetails as any).bannedAt === 'string'
        ? String((d.banDetails as any).bannedAt)
        : '';
      return {
        id: d.id,
        deviceName: formatDeviceTechnicalLabel(d.deviceInfo, d.id, modelAliases),
        deviceId: d.id,
        location: 'Nieznana',
        status: 'AKTYWNY' as const,
        kind: hasExpiry ? 'CZASOWY' as const : 'PERMANENTNY' as const,
        expireIn: hasExpiry ? new Date(expiresAt).toLocaleString('pl-PL') : 'Na zawsze',
        reason: d.banDetails?.reason || 'Naruszenie regulaminu',
        bannedBy: String((d.banDetails as any)?.bannedBy || '').trim() || 'Administrator',
        date: bannedAt ? new Date(bannedAt).toLocaleString('pl-PL') : 'Brak danych',
      };
    });

  const currentUser = {
    name: formatDeviceLabel({
      displayName: currentDevice.displayName,
      deviceInfo: currentDevice.deviceInfo,
      deviceId: uid,
    }),
    role: mapRole(currentDevice.role),
    initials: initialsFromPersonName(
      (currentDevice.displayName || '').trim(),
      currentDevice.role === 'owner' ? 'OW' : currentDevice.role === 'admin' ? 'AD' : 'UŻ',
    ),
  };

  const saveOwnDisplayName = async () => {
    if (!uid || editProfileSaving) return;
    const trimmed = editProfileValue.trim();
    setEditProfileSaving(true);
    try {
      await updateDoc(doc(db, 'devices', uid), { displayName: trimmed });
      setIsEditProfileOpen(false);
    } catch (e: any) {
      console.error('Błąd zapisu displayName', e);
    } finally {
      setEditProfileSaving(false);
    }
  };

  const addToast = (title: string, message: string, type: 'ban' | 'unban' | 'role_change') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const writeAuditLog = async (payload: Partial<Log> & { title: string; description: string; iconType: Log['iconType'] }) => {
    await addDoc(collection(db, 'admin_logs'), {
      ...payload,
      category: payload.category || 'OPERATOR',
      createdAt: serverTimestamp(),
      actorId: user?.uid || null,
    });
  };

  const clearAdminLogs = async () => {
    if (currentDevice.role !== 'owner') {
      throw new Error('Tylko właściciel może czyścić wszystkie logi.');
    }

    let deleted = 0;
    for (;;) {
      const snap = await getDocs(query(collection(db, 'admin_logs'), limit(400)));
      if (snap.empty) break;

      const batch = writeBatch(db);
      for (const logDoc of snap.docs) {
        batch.delete(logDoc.ref);
      }
      await batch.commit();
      deleted += snap.size;

      if (snap.size < 400) break;
    }

    if (deleted === 0) return;
  };

  const syncInstallationProfile = async (
    installationId: string | undefined,
    role: DeviceRole,
    permissions: Record<string, boolean>,
    displayName?: string,
  ) => {
    const inst = String(installationId || '').trim();
    if (!inst) return;
    const patch: Record<string, unknown> = {
      installationId: inst,
      role,
      permissions,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || null,
    };
    if (typeof displayName === 'string' && displayName.trim()) {
      patch.displayName = displayName.trim().slice(0, 120);
    } else {
      patch.displayName = deleteField();
    }
    await setDoc(doc(db, 'installations', inst), patch, { merge: true });
  };

  const saveDeviceModelAlias = async (device: Device, label: string) => {
    if (currentDevice.role !== 'owner') {
      throw new Error('Tylko właściciel może zmieniać nazwy urządzeń.');
    }
    const code = String(device.modelCode || extractDeviceModelCode(device.deviceInfo || '')).trim().toUpperCase();
    const cleanLabel = label.trim().slice(0, 80);
    if (!code) throw new Error('Nie udało się wykryć kodu modelu tego urządzenia.');
    if (!cleanLabel) throw new Error('Nazwa modelu nie może być pusta.');

    await setDoc(doc(db, 'device_model_aliases', code), {
      code,
      label: cleanLabel,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || null,
    }, { merge: true });

    await writeAuditLog({
      title: 'Zmieniono nazwę modelu urządzenia',
      description: `${code} → ${cleanLabel}`,
      iconType: 'edit_role',
    });
  };

  const assertNotSelf = (targetId: string) => {
    if (!uid || targetId !== uid) return true;
    alert('Nie możesz zmieniać ról ani uprawnień własnego urządzenia z aplikacji. Poproś innego właściciela lub użyj konsoli Firebase.');
    return false;
  };

  const handleUpdateUser = async (_name: string, role: string, permissions: Record<string, boolean>, displayName?: string) => {
    if (!selectedDeviceForRole) return;
    if (!assertNotSelf(selectedDeviceForRole.id)) return;

    if (!canChangeRolesUi) {
      alert('Brak uprawnień do zmiany ról.');
      return;
    }

    const targetRow = devicesData.find((x) => x.id === selectedDeviceForRole.id);
    if ((targetRow?.role === 'owner' || targetRow?.role === 'admin') && currentDevice.role !== 'owner') {
      alert('Nie masz uprawnień aby wykonać tę akcję.');
      return;
    }

    let fbRole: DeviceRole = 'user';
    if (role.includes('CICIEL') || role === 'Właściciel' || role === 'WŁAŚCICIEL') fbRole = 'owner';
    if (role === 'Administrator' || role === 'ADMIN') fbRole = 'admin';

    if (fbRole === 'owner' && currentDevice.role !== 'owner') {
      alert('Tylko właściciel może nadać rolę właściciela.');
      return;
    }

    const trimmedDisplay = (displayName ?? '').trim().slice(0, 120);

    try {
      const normalized = normalizeAdminPermissions(permissions, fbRole);
      if (fbRole === 'owner' || fbRole === 'admin') normalized.monitor = true;
      const patch: Record<string, unknown> = {
        role: fbRole,
        permissions: {
          ...normalized,
          ...toLegacyPermissions({ ...permissions, ...normalized }),
        },
      };
      if (trimmedDisplay) {
        patch.displayName = trimmedDisplay;
      } else {
        patch.displayName = deleteField();
      }

      await updateDoc(doc(db, 'devices', selectedDeviceForRole.id), patch);
      await syncInstallationProfile(
        targetRow?.installationId,
        fbRole,
        {
          ...normalized,
          ...toLegacyPermissions({ ...permissions, ...normalized }),
        },
        trimmedDisplay || targetRow?.displayName,
      );
      const whoLabel = formatDeviceLabel({
        displayName: trimmedDisplay || selectedDeviceForRole.displayName,
        deviceInfo: targetRow?.deviceInfo ?? '',
        deviceId: selectedDeviceForRole.id,
      });
      const previousPermissions = targetRow
        ? effectiveAdminPermissionsForDisplay(targetRow.role, targetRow.permissions)
        : selectedDeviceForRole.permissions;
      const tabAccessChanged =
        Boolean(previousPermissions?.disableMap) !== Boolean(normalized.disableMap) ||
        Boolean(previousPermissions?.disableStops) !== Boolean(normalized.disableStops);
      const roleChanged = targetRow?.role !== fbRole;
      const tabAccessDescription = normalized.disableMap
        ? `${whoLabel} → wyłączono mapę`
        : normalized.disableStops
          ? `${whoLabel} → wyłączono przystanki`
          : `${whoLabel} → przywrócono dostęp do zakładek`;
      await writeAuditLog({
        title: tabAccessChanged && !roleChanged ? 'Zmieniono dostęp do zakładek' : 'Zmieniono rolę operatora',
        description: tabAccessChanged && !roleChanged ? tabAccessDescription : `${whoLabel} → ${role}`,
        iconType: 'role_change',
      });
      addToast('Zaktualizowano uprawnienia', `Zmieniono uprawnienia dla ${selectedDeviceForRole.name}.`, 'role_change');
      setSelectedDeviceForRole(null);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert('Błąd podczas aktualizacji: ' + msg);
    }
  };

  const handleBlockDevice = async (device: Device, reason: string, expiryDate: string, gifUrl: string, silent = false) => {
    if (!assertNotSelf(device.id)) return;
    if (!canBanUi) {
      alert('Brak uprawnień do blokowania urządzeń.');
      return;
    }
    const targetDevice = devicesData.find((x) => x.id === device.id);
    if ((targetDevice?.role === 'owner' || targetDevice?.role === 'admin') && currentDevice.role !== 'owner') return;

    try {
      const targetRef = doc(db, 'devices', device.id);
      const freshTargetSnap = await getDoc(targetRef);
      const freshTarget = freshTargetSnap.exists()
        ? ({ id: freshTargetSnap.id, ...(freshTargetSnap.data() as DeviceData) })
        : targetDevice;
      const deviceLabel = formatAdminTargetLabel(freshTarget, device.id);

      if (freshTarget?.status === 'banned') {
        await updateDoc(targetRef, {
          status: 'banned',
          banDetails: {
            reason: String(reason || freshTarget.banDetails?.reason || 'Naruszenie regulaminu').trim(),
            expiresAt: freshTarget.banDetails?.expiresAt || (expiryDate ? new Date(expiryDate).toISOString() : ''),
            gifUrl: freshTarget.banDetails?.gifUrl || gifUrl || '',
            silent: Boolean(freshTarget.banDetails?.silent ?? silent),
            bannedBy: currentUser.name,
            bannedAt: freshTarget.banDetails?.bannedAt || new Date().toISOString(),
          },
        });
        addToast('Blokada utrwalona', `${deviceLabel}.`, 'ban');
        setSelectedDeviceForBan(null);
        return;
      }

      const reasonText = String(reason || 'Naruszenie regulaminu').trim();

      await updateDoc(targetRef, {
        status: 'banned',
        banDetails: {
          reason: reasonText,
          expiresAt: expiryDate ? new Date(expiryDate).toISOString() : '',
          gifUrl: gifUrl || '',
          silent: Boolean(silent),
          bannedBy: currentUser.name,
          bannedAt: new Date().toISOString(),
        },
      });
      await writeAuditLog({
        title: 'Zablokowano urządzenie',
        description: deviceLabel,
        iconType: 'ban',
        category: 'SYSTEM',
      });
      addToast('Blokada nadana', `${deviceLabel}.`, 'ban');
      setSelectedDeviceForBan(null);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert('Błąd blokowania: ' + msg);
    }
  };

  const handleUnblockDevice = async (banId: string) => {
    if (!assertNotSelf(banId)) return;
    if (!canBanUi) {
      alert('Brak uprawnień do odblokowywania urządzeń.');
      return;
    }
    try {
      const target = devicesData.find((x) => x.id === banId);
      await updateDoc(doc(db, 'devices', banId), {
        status: 'active',
        banDetails: deleteField(),
      });
      await writeAuditLog({
        title: 'Zdjęto blokadę urządzenia',
        description: formatAdminTargetLabel(target, banId),
        iconType: 'edit_role',
        category: 'SYSTEM',
      });
      addToast('Urządzenie odblokowane', `Urządzenie zostało odblokowane.`, 'unban');
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      alert('Błąd odblokowania: ' + msg);
    }
  };

  const saveOperatorPatch = async (operatorId: string, role: OperatorRole, permissions: Operator['permissions']) => {
    if (!assertNotSelf(operatorId)) return;
    if (!canChangeRolesUi) {
      alert('Brak uprawnień do edycji operatorów.');
      return;
    }
    const operatorRole = String(role);
    const fbRole: DeviceRole = operatorRole.includes('CICIEL') ? 'owner' : operatorRole === 'ADMIN' ? 'admin' : 'user';
    const target = devicesData.find((d) => d.id === operatorId);
    if ((target?.role === 'owner' || target?.role === 'admin') && currentDevice.role !== 'owner') {
      alert('Nie masz uprawnień aby wykonać tę akcję.');
      return;
    }
    if (fbRole === 'owner' && currentDevice.role !== 'owner') {
      alert('Tylko właściciel może nadać rolę właściciela.');
      return;
    }
    if (fbRole === 'owner' && target && target.role !== 'owner' && currentDevice.role !== 'owner') {
      alert('Tylko właściciel może awansować użytkownika na właściciela.');
      return;
    }
    try {
      const normalized = normalizeAdminPermissions(permissions, fbRole);
      if (fbRole === 'owner' || fbRole === 'admin') normalized.monitor = true;
      await updateDoc(doc(db, 'devices', operatorId), {
        role: fbRole,
        permissions: {
          ...normalized,
          ...toLegacyPermissions({ ...permissions, ...normalized }),
        },
      });
      const opRow = devicesData.find((x) => x.id === operatorId);
      await syncInstallationProfile(
        opRow?.installationId,
        fbRole,
        {
          ...normalized,
          ...toLegacyPermissions({ ...permissions, ...normalized }),
        },
        opRow?.displayName,
      );
      const opLabel = formatDeviceLabel({
        displayName: opRow?.displayName,
        deviceInfo: opRow?.deviceInfo ?? '',
        deviceId: operatorId,
      });
      await writeAuditLog({
        title: 'Edycja uprawnień operatora',
        description: `${opLabel} → ${role}`,
        iconType: 'edit_role',
      });
    } catch (e: unknown) {
      console.error(e);
      alert('Błąd zapisu: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (activeView === 'banned') {
    return (
      <div className="relative">
        <BanScreen />
        <button
          onClick={() => setActiveView('devices')}
          className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm transition-colors border border-white/10"
        >
          [Wróć do Dashboardu]
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? cn('flex h-full min-h-0 flex-1 flex-row bg-[#040609] overflow-hidden font-sans text-slate-300', !isDarkTheme && 'admin-light')
          : cn('flex h-screen min-h-0 flex-row bg-[#040609] overflow-hidden font-sans text-slate-300', !isDarkTheme && 'admin-light')
      }
      style={{ ['--pks-accent' as string]: themeColor } as CSSProperties}
    >
      {!isDarkTheme && (
        <style>{`
          .admin-light,
          .admin-light .bg-\\[\\#040609\\] {
            background-color: #f8fafc !important;
            color: #334155 !important;
          }
          .admin-light .admin-topbar {
            background-color: rgba(248, 250, 252, 0.94) !important;
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
          }
          .admin-light .bg-\\[\\#080B12\\],
          .admin-light .bg-\\[\\#080b12\\],
          .admin-light .bg-\\[\\#0d1117\\],
          .admin-light .bg-\\[\\#0F131D\\],
          .admin-light .bg-\\[\\#0f131d\\],
          .admin-light .bg-\\[\\#111623\\],
          .admin-light .bg-\\[\\#151B28\\],
          .admin-light .bg-\\[\\#0a0f18\\] {
            background-color: #ffffff !important;
          }
          .admin-light .bg-white\\/5,
          .admin-light .bg-white\\/\\[0\\.06\\] {
            background-color: rgba(15, 23, 42, 0.045) !important;
          }
          .admin-light .bg-white\\/10 {
            background-color: rgba(15, 23, 42, 0.075) !important;
          }
          .admin-light .bg-black\\/50,
          .admin-light .bg-black\\/60 {
            background-color: rgba(15, 23, 42, 0.35) !important;
          }
          .admin-light .border-white\\/5,
          .admin-light .border-white\\/10,
          .admin-light .border-white\\/15,
          .admin-light .border-t-white\\/10,
          .admin-light .border-t-white\\/20 {
            border-color: rgba(15, 23, 42, 0.12) !important;
          }
          .admin-light .text-white,
          .admin-light .hover\\:text-white:hover {
            color: #0f172a !important;
          }
          .admin-light .text-slate-200,
          .admin-light .text-slate-300 {
            color: #334155 !important;
          }
          .admin-light .text-slate-400 {
            color: #64748b !important;
          }
          .admin-light .text-slate-500,
          .admin-light .text-slate-600 {
            color: #64748b !important;
          }
          .admin-light .text-rose-100 {
            color: #9f1239 !important;
          }
          .admin-light .text-rose-200 {
            color: #be123c !important;
          }
          .admin-light .text-rose-400,
          .admin-light .hover\\:text-rose-400:hover {
            color: #e11d48 !important;
          }
          .admin-light .hover\\:text-white:hover {
            color: #0f172a !important;
          }
          .admin-light input,
          .admin-light textarea,
          .admin-light select {
            color: #0f172a !important;
            background-color: #ffffff !important;
          }
          .admin-light input::placeholder,
          .admin-light textarea::placeholder {
            color: #94a3b8 !important;
          }
          .admin-light .shadow-2xl,
          .admin-light .shadow-xl,
          .admin-light .shadow-lg {
            box-shadow: 0 16px 42px rgba(15, 23, 42, 0.10) !important;
          }
          .theme-warm .admin-light,
          .theme-warm .admin-light .bg-\\[\\#040609\\] {
            background-color: #f2ede1 !important;
            color: #4b4334 !important;
          }
          .theme-warm .admin-light .admin-topbar {
            background-color: rgba(242, 237, 225, 0.94) !important;
            border-bottom-color: rgba(93, 79, 50, 0.14);
          }
          .theme-warm .admin-light .bg-\\[\\#080B12\\],
          .theme-warm .admin-light .bg-\\[\\#080b12\\],
          .theme-warm .admin-light .bg-\\[\\#0d1117\\],
          .theme-warm .admin-light .bg-\\[\\#0F131D\\],
          .theme-warm .admin-light .bg-\\[\\#0f131d\\],
          .theme-warm .admin-light .bg-\\[\\#111623\\],
          .theme-warm .admin-light .bg-\\[\\#151B28\\],
          .theme-warm .admin-light .bg-\\[\\#0a0f18\\] {
            background-color: #faf7ef !important;
          }
          .theme-warm .admin-light .bg-white\\/5,
          .theme-warm .admin-light .bg-white\\/\\[0\\.06\\] {
            background-color: rgba(93, 79, 50, 0.055) !important;
          }
          .theme-warm .admin-light .bg-white\\/10 {
            background-color: rgba(93, 79, 50, 0.09) !important;
          }
          .theme-warm .admin-light .border-white\\/5,
          .theme-warm .admin-light .border-white\\/10,
          .theme-warm .admin-light .border-white\\/15,
          .theme-warm .admin-light .border-t-white\\/10,
          .theme-warm .admin-light .border-t-white\\/20 {
            border-color: rgba(93, 79, 50, 0.18) !important;
          }
          .theme-warm .admin-light .text-white,
          .theme-warm .admin-light .hover\\:text-white:hover {
            color: #272116 !important;
          }
          .theme-warm .admin-light .text-slate-200,
          .theme-warm .admin-light .text-slate-300 {
            color: #4b4334 !important;
          }
          .theme-warm .admin-light .text-slate-400,
          .theme-warm .admin-light .text-slate-500,
          .theme-warm .admin-light .text-slate-600 {
            color: #746a58 !important;
          }
          .theme-warm .admin-light .text-rose-100 {
            color: #9f1239 !important;
          }
          .theme-warm .admin-light .text-rose-200 {
            color: #be123c !important;
          }
          .theme-warm .admin-light .text-rose-400,
          .theme-warm .admin-light .hover\\:text-rose-400:hover {
            color: #e11d48 !important;
          }
          .theme-warm .admin-light .hover\\:text-white:hover {
            color: #272116 !important;
          }
          .theme-warm .admin-light input,
          .theme-warm .admin-light textarea,
          .theme-warm .admin-light select {
            color: #272116 !important;
            background-color: #fffaf0 !important;
          }
          .theme-warm .admin-light input::placeholder,
          .theme-warm .admin-light textarea::placeholder {
            color: #9b907a !important;
          }
          .theme-warm .admin-light .shadow-2xl,
          .theme-warm .admin-light .shadow-xl,
          .theme-warm .admin-light .shadow-lg {
            box-shadow: 0 16px 42px rgba(93, 79, 50, 0.12) !important;
          }
        `}</style>
      )}
      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Modal: edycja własnej nazwy (imię i nazwisko) */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d1117] p-6 shadow-2xl flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-black text-white">Twoja nazwa</h2>
              <p className="text-xs text-slate-400 mt-1">Wpisz imię i nazwisko, które będzie widoczne w panelu zamiast nazwy urządzenia.</p>
            </div>
            <input
              type="text"
              maxLength={120}
              value={editProfileValue}
              onChange={(e) => setEditProfileValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveOwnDisplayName(); }}
              placeholder="np. Jan Kowalski"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-white/20"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsEditProfileOpen(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={saveOwnDisplayName}
                disabled={editProfileSaving || !editProfileValue.trim()}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: themeColor }}
              >
                {editProfileSaving ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={currentUser}
        activeView={activeView}
        onViewChange={setActiveView}
        embedded={embedded}
        onExit={onExit}
        accentColor={themeColor}
        allowedNavIds={allowedNavIds}
        onEditProfile={() => {
          setEditProfileValue(currentDevice.displayName || '');
          setIsEditProfileOpen(true);
        }}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {embedded && onExit && (
          <div className="admin-topbar sticky top-0 z-30 hidden justify-end bg-[#040609]/90 px-4 py-4 backdrop-blur md:flex md:px-6">
            <button
              type="button"
              aria-label="Zamknij panel administratora"
              onClick={onExit}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={22} strokeWidth={2.25} />
            </button>
          </div>
        )}

        {activeView === 'devices' && (
          <DeviceTable
            devices={devices}
            devicesError={devicesError}
            currentUserId={uid}
            currentDeviceRole={currentDevice.role}
            canBan={canBanUi}
            canChangeRoles={canChangeRolesUi}
            onOpenRolesModal={(device) => setSelectedDeviceForRole(device)}
            onOpenBanModal={(device) => setSelectedDeviceForBan(device)}
            onNavigateToBanScreen={() => setActiveView('banned')}
            onMenuClick={() => setIsSidebarOpen(true)}
            onRenameDevice={currentDevice.role === 'owner' ? saveDeviceModelAlias : undefined}
          />
        )}

        {activeView === 'operators' && (
          <OperatorsView
          operators={operators}
          currentUserId={uid}
          canPromoteOwner={currentDevice.role === 'owner'}
          currentDeviceRole={currentDevice.role}
          globalSettingsSectionVisible={globalSettingsSectionVisible}
          globalSettingsReadOnly={globalSettingsSectionVisible && !globalSettingsCanSave}
          onMenuClick={() => setIsSidebarOpen(true)}
          onSaveOperator={saveOperatorPatch}
          onRemoveOperator={async (operatorId) => {
            if (!assertNotSelf(operatorId)) return;
            if (!canChangeRolesUi) {
              alert('Brak uprawnień do usuwania operatorów.');
              return;
            }
            const target = devicesData.find((x) => x.id === operatorId);
            if ((target?.role === 'owner' || target?.role === 'admin') && currentDevice.role !== 'owner') {
              alert('Nie masz uprawnień aby wykonać tę akcję.');
              return;
            }
            await updateDoc(doc(db, 'devices', operatorId), {
              role: 'user',
              permissions: buildDevicePermissions('user'),
            });
            await syncInstallationProfile(
              target?.installationId,
              'user',
              buildDevicePermissions('user'),
              target?.displayName,
            );
            await writeAuditLog({
              title: 'Usunięto operatora',
              description: `Operator ${operatorId} został zdegradowany do użytkownika`,
              iconType: 'role_change',
            });
          }}
          globalSettings={globalSettings}
          onSaveGlobalSettings={async (settings) => {
            if (!globalSettingsCanSave) return;
            if (
              globalSettings.loginEnabled === settings.loginEnabled &&
              globalSettings.maintenanceMode === settings.maintenanceMode &&
              globalSettings.autoBan === settings.autoBan
            ) {
              return;
            }
            await setDoc(doc(db, 'admin_settings', 'security'), settings, { merge: true });
            const desc = [
              settings.loginEnabled ? 'logowanie włączone' : 'logowanie wyłączone',
              settings.maintenanceMode ? 'konserwacja włączona' : 'konserwacja wyłączona',
              settings.autoBan ? 'auto-ban włączony' : 'auto-ban wyłączony',
            ].join(' · ');
            await writeAuditLog({
              title: 'Zmieniono ustawienia globalne',
              description: desc,
              iconType: 'edit_role',
            });
          }}
        />
      )}

      {activeView === 'logs' && (
        <LogsView
          logs={logsData}
          subscriptionError={logsError}
          canClearLogs={currentDevice.role === 'owner'}
          onClearLogs={clearAdminLogs}
          onMenuClick={() => setIsSidebarOpen(true)}
        />
      )}

      {activeView === 'bans' && (
        <BansView
          bans={bans}
          canBan={canBanUi}
          stats={{
            activeBans: banStats.activeBans,
            expireToday: banStats.expireToday,
            everWithBanDetails: banStats.everWithBanDetails,
          }}
          onUnblock={handleUnblockDevice}
          onMenuClick={() => setIsSidebarOpen(true)}
        />
        )}
      </div>

      {selectedDeviceForRole && (
        <RolesModal
          device={selectedDeviceForRole}
          canAssignOwner={currentDevice.role === 'owner'}
          canManageTabAccess={currentDevice.role === 'owner'}
          isSelfTarget={Boolean(uid && selectedDeviceForRole.id === uid)}
          onClose={() => setSelectedDeviceForRole(null)}
          onUpdateUser={() => {}}
          onSave={(r, perms, dn) => handleUpdateUser('Admin', r, perms, dn)}
        />
      )}

      {selectedDeviceForBan && (
        <BanModal
          device={selectedDeviceForBan}
          onClose={() => setSelectedDeviceForBan(null)}
          onConfirm={handleBlockDevice}
        />
      )}
    </div>
  );
}

