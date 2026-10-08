
import {Role, Status, IconType, Log} from '@/app/admin/types';

import {DeviceData} from '@/components/FirebaseProvider';

import {type DeviceRole} from '@/lib/admin/rbac';
import {formatDeviceLabel, formatDeviceTechnicalLabel, formatRelativeTimePl, formatWarsawDateTimeParts, warsawDateKey} from '@/lib/format-device-label';

type AdminLogRaw = {
  id: string;
  createdAtMs: number;
  title: string;
  description: string;
  category: Log['category'];
  iconType: Log['iconType'];
};

const ONLINE_GRACE_MS = 5 * 60_000;

function formatElapsedAgoPl(diffMs: number): string {
  const diff = Math.max(0, diffMs);
  if (diff < 60_000) return '1 min temu';
  if (diff < 3600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min temu`;
  if (diff < 86400_000) return `${Math.max(1, Math.floor(diff / 3600_000))} godz. temu`;

  const days = Math.max(1, Math.floor(diff / 86400_000));
  if (days < 7) {
    if (days === 1) return '1 dzień temu';
    return `${days} dni temu`;
  }
  if (days < 30) return `${Math.max(1, Math.floor(days / 7))} tyg. temu`;
  if (days < 365) return `${Math.max(1, Math.floor(days / 30))} mies. temu`;

  const years = Math.max(1, Math.floor(days / 365));
  if (years === 1) return '1 rok temu';
  if (years < 5) return `${years} lata temu`;
  return `${years} lat temu`;
}

function lastSeenInfoFromMs(ms: number | null | undefined, nowMs = Date.now()): { label: string; online: boolean } {
  if (!ms || Number.isNaN(ms)) return { label: 'Brak sygnału', online: false };
  const diff = Math.max(0, nowMs - ms);
  if (diff <= ONLINE_GRACE_MS) return { label: 'teraz', online: true };
  return { label: formatElapsedAgoPl(diff), online: false };
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

function deviceLastSeenMs(d: { lastSeenAt?: { toDate?: () => Date } | null }): number {
  const t = d.lastSeenAt?.toDate?.();
  return t && !Number.isNaN(t.getTime()) ? t.getTime() : 0;
}

function roleRank(role?: DeviceRole): number {
  if (role === 'owner') return 3;
  if (role === 'admin') return 2;
  return 1;
}

function dedupeDevicesByInstallation(devices: ({ id: string } & DeviceData)[]): ({ id: string } & DeviceData)[] {
  const byInstallation = new Map<string, { id: string } & DeviceData>();
  const withoutInstallation: ({ id: string } & DeviceData)[] = [];

  for (const device of devices) {
    const installationId = String(device.installationId || '').trim();
    if (!installationId) {
      withoutInstallation.push(device);
      continue;
    }

    const current = byInstallation.get(installationId);
    if (!current) {
      byInstallation.set(installationId, device);
      continue;
    }

    const currentLastSeen = deviceLastSeenMs(current);
    const nextLastSeen = deviceLastSeenMs(device);
    const isClearlyNewerDevice = nextLastSeen > 0 && nextLastSeen > currentLastSeen + 60_000;
    const currentRoleRank = roleRank(current.role);
    const nextRoleRank = roleRank(device.role);
    const shouldReplace =
      isClearlyNewerDevice ||
      (Math.abs(nextLastSeen - currentLastSeen) <= 60_000 &&
        (nextRoleRank > currentRoleRank || (nextRoleRank === currentRoleRank && nextLastSeen >= currentLastSeen)));

    if (shouldReplace) byInstallation.set(installationId, device);
  }

  return [...withoutInstallation, ...byInstallation.values()];
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

export type {AdminLogRaw};
export {ONLINE_GRACE_MS};
export {formatElapsedAgoPl};
export {lastSeenInfoFromMs};
export {lastSeenInfoOfflineFromMs};
export {lastSeenLabelFromDevice};
export {deviceLastSeenMs};
export {roleRank};
export {dedupeDevicesByInstallation};
export {deviceLabelById};
export {formatAdminTargetLabel};
export {humanizeGlobalSettingsDescription};
export {prettifyIdArrowDescription};
export {enrichAdminLogsForUi};
export {mapRole};
export {mapStatus};
export {determineIconType};
export {computeBanStats};
