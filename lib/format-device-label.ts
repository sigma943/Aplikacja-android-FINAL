/** Calendar day in Europe/Warsaw as YYYY-MM-DD (for comparisons). */
export function warsawDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function pickBrowser(ua: string): string {
  const u = ua.toLowerCase();
  if (u.includes('edg/')) return 'Edge';
  if (u.includes('opr/') || u.includes('opera')) return 'Opera';
  if (u.includes('firefox')) return 'Firefox';
  if (u.includes('safari') && !u.includes('chrome')) return 'Safari';
  if (u.includes('chrome')) return 'Chrome';
  return 'Przeglądarka';
}

function pickOs(ua: string): string {
  const u = ua.toLowerCase();
  if (u.includes('android')) return 'Android';
  if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) return 'iOS';
  if (u.includes('mac os') || u.includes('macintosh')) return 'macOS';
  if (u.includes('windows')) return 'Windows';
  if (u.includes('linux')) return 'Linux';
  return 'System';
}

/** One short line for subtitle (device table second line), not full UA. */
export function formatDeviceOsSummary(deviceInfo: string): string {
  const ua = (deviceInfo || '').trim();
  if (!ua) return '—';
  const bracket = /\(([^)]+)\)/.exec(ua)?.[1]?.trim();
  if (bracket && bracket.length <= 80) return bracket;
  return `${pickBrowser(ua)} · ${pickOs(ua)}`;
}

export interface FormatDeviceLabelInput {
  displayName?: string | null;
  deviceInfo: string;
  deviceId: string;
}

/**
 * Prefer Firestore `displayName`, else parenthetical hint from UA, else short browser/OS + short id.
 */
/** Data i godzina w strefie Europe/Warsaw (spójne z filtrowaniem logów). */
export function formatWarsawDateTimeParts(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return { date, time };
}

/** Krótki opis „ile temu” po polsku (dla logów — bez mylącego stałego „teraz”). */
export function formatRelativeTimePl(fromMs: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - fromMs);
  if (diff < 45_000) return 'przed chwilą';
  if (diff < 3600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min temu`;
  if (diff < 86400_000) return `${Math.max(1, Math.floor(diff / 3600_000))} godz. temu`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} dni temu`;
  return '';
}

/** Inicjały z imienia i nazwiska (2 litery). */
export function initialsFromPersonName(name: string, fallback: string): string {
  const fb = (fallback || '??').slice(0, 2).toUpperCase();
  const t = (name || '').trim();
  if (!t) return fb;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[parts.length - 1][0] || '';
    const out = (a + b).toUpperCase();
    return out.length >= 2 ? out : fb;
  }
  if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return fb;
}

export function formatDeviceLabel(input: FormatDeviceLabelInput): string {
  const name = String(input.displayName ?? '')
    .trim()
    .slice(0, 120);
  if (name) return name;

  const ua = (input.deviceInfo || '').trim();
  const fromParen = ua ? /\(([^)]+)\)/.exec(ua)?.[1]?.trim() : '';
  if (fromParen && fromParen.length <= 60 && !/win64|wow64|nt \d/i.test(fromParen)) {
    return fromParen;
  }

  const shortId = (input.deviceId || '').slice(0, 8);
  if (!ua) return shortId ? `Urządzenie ${shortId}` : 'Nieznane';

  return `${pickBrowser(ua)} · ${pickOs(ua)}${shortId ? ` · ${shortId}` : ''}`;
}

/** Technical device label used in device tables and admin actions. */
export function formatDeviceTechnicalLabel(deviceInfo: string, deviceId: string): string {
  const ua = (deviceInfo || '').trim();
  const shortId = (deviceId || '').slice(0, 8);
  if (!ua) return shortId ? `Urządzenie ${shortId}` : 'Nieznane';
  return `${pickBrowser(ua)} · ${pickOs(ua)}${shortId ? ` · ${shortId}` : ''}`;
}
