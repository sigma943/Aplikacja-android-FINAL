'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '@/lib/firebase';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { buildDevicePermissions, type DeviceRole } from '@/lib/admin/rbac';
import { agentLog } from '@/lib/debug-agent-log';
import { ClockAlert, RefreshCw, Wrench } from 'lucide-react';

export type { DeviceRole };

export interface DeviceData {
  deviceInfo: string;
  /** Optional friendly name set by an admin (stored on `devices/{id}`). */
  displayName?: string;
  role: DeviceRole;
  firstLogin: string;
  status: 'active' | 'banned';
  permissions?: ReturnType<typeof buildDevicePermissions>;
  banDetails?: {
    expiresAt: string;
    reason: string;
    gifUrl: string;
    silent?: boolean;
    bannedBy?: string;
    bannedAt?: string;
  };
  /** Ostatnia aktywnoĹ›Ä‡ klienta (heartbeat); tylko wĹ‚aĹ›ciciel dokumentu moĹĽe je aktualizowaÄ‡ (reguĹ‚y Firestore). */
  lastSeenAt?: { toDate?: () => Date } | null;
  installationId?: string;
  identityVersion?: number;
}

interface InstallationProfile {
  installationId?: string;
  role?: DeviceRole;
  permissions?: ReturnType<typeof buildDevicePermissions>;
  displayName?: string;
}

interface FirebaseContextType {
  user: User | null;
  device: DeviceData | null;
  isBanned: boolean;
  loading: boolean;
  /** Lokalnie Ĺ›ledzony lastSeenAt (ms epoch) â€” nie migocze przy zmianie karty. */
  localLastSeenMs: number | null;
}

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{
      model?: string;
      platform?: string;
      platformVersion?: string;
      uaFullVersion?: string;
    }>;
  };
};

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  device: null,
  isBanned: false,
  loading: true,
  localLastSeenMs: null,
});

export function useFirebase() {
  return useContext(FirebaseContext);
}

async function getClientDeviceInfo(): Promise<string> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  if (Capacitor.isNativePlatform()) {
    try {
      const { Device } = await import('@capacitor/device');
      const info = await Device.getInfo();
      const model = [info.manufacturer, info.model]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      const os = [info.operatingSystem, info.osVersion]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
      const label = [model, os].filter(Boolean).join(' | ');
      if (label) return label.slice(0, 200);
    } catch (err) {
      console.warn('Native device info unavailable', err);
    }
  }

  try {
    const uaData = (navigator as NavigatorWithUAData).userAgentData;
    const high = uaData?.getHighEntropyValues
      ? await uaData.getHighEntropyValues(['model', 'platform', 'platformVersion', 'uaFullVersion'])
      : null;
    const model = String(high?.model || '').trim();
    const platform = String(high?.platform || uaData?.platform || '').trim();
    const version = String(high?.platformVersion || '').trim();
    const label = [model, [platform, version].filter(Boolean).join(' ')].filter(Boolean).join(' | ');
    if (label) return label.slice(0, 200);
  } catch {}

  return ua.substring(0, 200);
}

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [connectionTimedOut, setConnectionTimedOut] = useState(false);
  const [checkingMaintenance, setCheckingMaintenance] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLatched, setMaintenanceLatched] = useState(false);
  const [localLastSeenMs, setLocalLastSeenMs] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          console.error("Anonymous sign-in failed", e);
          // Fallback for testing if Anonymous Auth is disabled in Firebase Console
          if (e.code === 'auth/admin-restricted-operation' || e.message?.includes('admin-restricted-operation')) {
            console.warn("Anonymous Auth is disabled in Firebase Console. Using fallback guest ID for testing.");
            let guestId = localStorage.getItem('guest_uid');
            if (!guestId) {
              guestId = 'guest_' + Math.random().toString(36).substring(2, 15);
              localStorage.setItem('guest_uid', guestId);
            }
            // Mock user object for context
            setUser({ uid: guestId, isAnonymous: true } as User);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const getOrCreateInstallationId = () => {
    const key = 'pks_installation_id';
    const cookieKey = 'pks_installation_id';
    const isWeb = typeof window !== 'undefined' && !Capacitor.isNativePlatform();

    const readCookie = () => {
      const m = document.cookie.match(new RegExp(`(?:^|; )${cookieKey}=([^;]*)`));
      return m ? decodeURIComponent(m[1]) : '';
    };
    const writeCookie = (val: string) => {
      // cookie without Domain binds to current host; cookies are NOT port-scoped -> persists across localhost ports.
      document.cookie = `${cookieKey}=${encodeURIComponent(val)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    };

    if (isWeb) {
      const existingCookie = readCookie();
      if (existingCookie) return existingCookie;
    }

    const existing = localStorage.getItem(key);
    if (existing) {
      if (isWeb) writeCookie(existing);
      return existing;
    }

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `inst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(key, generated);
    if (isWeb) writeCookie(generated);
    return generated;
  };

  useEffect(() => {
    if (!user) return;

    const deviceRef = doc(db, 'devices', user.uid);
    const installationRef = doc(db, 'installations', getOrCreateInstallationId());
    let cancelled = false;

    (async () => {
      const instId = getOrCreateInstallationId();
      // #region agent log
      agentLog(
        'FirebaseProvider.tsx:registerIdentity:before',
        'Registering device identity via Firestore',
        {
          uidPrefix: user.uid.slice(0, 8),
          installationIdPrefix: instId.slice(0, 12),
        },
        'H5',
      );
      // #endregion
      try {
        const deviceInfo = await getClientDeviceInfo();
        const existing = await getDoc(deviceRef);
        if (!existing.exists()) {
          const installationSnap = await getDoc(installationRef);
          const installationProfile = (installationSnap.exists()
            ? installationSnap.data()
            : {}) as InstallationProfile;
          const roleFromProfile: DeviceRole =
            installationProfile.role === 'owner' || installationProfile.role === 'admin'
              ? installationProfile.role
              : 'user';
          const permissionsFromProfile =
            installationProfile.permissions && typeof installationProfile.permissions === 'object'
              ? installationProfile.permissions
              : buildDevicePermissions(roleFromProfile);
          const displayNameFromProfile =
            typeof installationProfile.displayName === 'string' && installationProfile.displayName.trim()
              ? installationProfile.displayName.trim().slice(0, 120)
              : undefined;

          const createPayload: Record<string, unknown> = {
            installationId: instId,
            identityVersion: 2,
            deviceInfo,
            role: roleFromProfile,
            firstLogin: new Date().toISOString(),
            status: 'active',
            permissions: permissionsFromProfile,
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (displayNameFromProfile) createPayload.displayName = displayNameFromProfile;
          await setDoc(deviceRef, createPayload, { merge: true });
          // Ensure installation profile exists even for first-time user.
          await setDoc(
            installationRef,
            {
              installationId: instId,
              role: roleFromProfile,
              permissions: permissionsFromProfile,
              ...(displayNameFromProfile ? { displayName: displayNameFromProfile } : {}),
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            },
            { merge: true },
          );
        } else {
          // Existing device docs can only update allowed heartbeat fields from client rules.
          await updateDoc(deviceRef, { lastSeenAt: serverTimestamp(), deviceInfo }).catch(async () => {
            await updateDoc(deviceRef, { lastSeenAt: serverTimestamp() });
          });
          const existingData = existing.data() as DeviceData;
          const role = existingData.role === 'owner' || existingData.role === 'admin' ? existingData.role : 'user';
          const perms =
            existingData.permissions && typeof existingData.permissions === 'object'
              ? existingData.permissions
              : buildDevicePermissions(role);
          await setDoc(
            installationRef,
            {
              installationId: instId,
              role,
              permissions: perms,
              ...(existingData.displayName ? { displayName: existingData.displayName } : {}),
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            },
            { merge: true },
          ).catch(() => {});
        }
        // #region agent log
        agentLog(
          'FirebaseProvider.tsx:registerIdentity:ok',
          'Device identity saved',
          { uidPrefix: user.uid.slice(0, 8) },
          'H5',
        );
        // #endregion
      } catch (err: unknown) {
        console.error('Failed to register device identity', err);
        const e = err as any;
        // #region agent log
        agentLog(
          'FirebaseProvider.tsx:registerIdentity:err',
          'Device identity save failed',
          {
            code: String(e?.code ?? 'unknown'),
            message: String(e?.message ?? String(err)).slice(0, 200),
            detailsType: typeof e?.details,
          },
          'H5',
        );
        // #endregion
      }
    })();

    const unsub = onSnapshot(deviceRef, async (snapshot) => {
      if (cancelled) return;
      if (snapshot.exists()) {
        const data = snapshot.data() as DeviceData;
        data.permissions = buildDevicePermissions(data.role, data.permissions);
        // #region agent log
        const p = data.permissions as Record<string, unknown> | undefined;
        agentLog(
          'FirebaseProvider.tsx:deviceSnapshot',
          'devices/{uid} loaded',
          {
            uidPrefix: user.uid.slice(0, 8),
            role: data.role,
            monitor: Boolean(p?.monitor),
            canViewList: Boolean(p?.canViewList),
          },
          'H1',
        );
        // #endregion
        setDevice(data);
        setLoading(false);
      } else {
        setDevice(null);
        setLoading(false);
      }
    }, (err) => {
      console.error("Snapshot error", err);
      setDevice(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  // Heartbeat â€žostatnio onlineâ€ť â€” wymaga prawdziwego konta Firebase (nie trybu guest_*).
  useEffect(() => {
    if (!user?.uid || user.uid.startsWith('guest_')) return;

    const deviceRef = doc(db, 'devices', user.uid);
    const ping = () => {
      setLocalLastSeenMs(Date.now());
      updateDoc(deviceRef, { lastSeenAt: serverTimestamp() }).catch(() => {});
    };

    ping();
    const interval = window.setInterval(ping, 120_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setSettingsLoading(true);
    const timeout = window.setTimeout(() => setSettingsLoading(false), 1500);

    const unsub = onSnapshot(
      doc(db, 'admin_settings', 'security'),
      (snapshot) => {
        window.clearTimeout(timeout);
        const data = snapshot.exists() ? snapshot.data() : {};
        const enabled = Boolean(data.maintenanceMode);
        setMaintenanceMode(enabled);
        if (enabled) setMaintenanceLatched(true);
        setSettingsLoading(false);
      },
      (err) => {
        window.clearTimeout(timeout);
        console.error('Global settings snapshot error', err);
        setMaintenanceMode(false);
        setSettingsLoading(false);
      },
    );

    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, [user]);

  const isBanned = device?.status === 'banned';
  const isPrivilegedDevice = device?.role === 'owner' || device?.role === 'admin';
  const shouldShowMaintenance = (maintenanceMode || maintenanceLatched) && device?.role === 'user';
  const shouldHoldInitialRender = loading || (!isPrivilegedDevice && settingsLoading);

  useEffect(() => {
    if (!shouldHoldInitialRender) {
      setConnectionTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setConnectionTimedOut(true);
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [shouldHoldInitialRender]);

  const refreshMaintenanceStatus = async () => {
    if (checkingMaintenance) return;
    setCheckingMaintenance(true);
    try {
      const snap = await getDoc(doc(db, 'admin_settings', 'security'));
      const data = snap.exists() ? snap.data() : {};
      const enabled = Boolean(data.maintenanceMode);
      setMaintenanceMode(enabled);
      setMaintenanceLatched(enabled);
    } catch (err) {
      console.error('Manual maintenance status check failed', err);
    } finally {
      setCheckingMaintenance(false);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, device, isBanned, loading, localLastSeenMs }}>
      {connectionTimedOut ? (
        <ConnectionTimeoutScreen />
      ) : shouldHoldInitialRender ? (
        <LoadingScreen />
      ) : isBanned && device ? (
        <BanScreen device={device} />
      ) : shouldShowMaintenance ? (
        <MaintenanceScreen onRefresh={refreshMaintenanceStatus} checking={checkingMaintenance} />
      ) : (
        children
      )}
    </FirebaseContext.Provider>
  );
}

function getStoredThemeMode() {
  if (typeof window === 'undefined') return 'dark';
  const savedTheme = localStorage.getItem('mks_app_theme') || 'system';
  if (savedTheme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return savedTheme;
}

function themeShell() {
  const themeMode = getStoredThemeMode();
  const isWarm = themeMode === 'light-warm';
  const isLight = themeMode === 'light' || isWarm;
  const isOled = themeMode === 'dark-oled';
  const isAurora = themeMode === 'dark-aurora';

  if (isWarm) {
    return {
      page: 'bg-[#f2ede1] text-[#272116]',
      glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(0,163,162,0.09),transparent_34%)]',
      grid: 'bg-[linear-gradient(rgba(93,79,50,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(93,79,50,0.045)_1px,transparent_1px)]',
      card: 'border-[#d8cdb2] bg-[#faf7ef]/86 shadow-[0_24px_70px_rgba(93,79,50,0.16)]',
      main: 'text-[#272116]',
      sub: 'text-[#746a58]',
      spinner: '#00A3A2',
    };
  }

  if (isLight) {
    return {
      page: 'bg-slate-50 text-slate-950',
      glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(99,102,241,0.10),transparent_34%)]',
      grid: 'bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)]',
      card: 'border-slate-200 bg-white/86 shadow-[0_24px_70px_rgba(15,23,42,0.12)]',
      main: 'text-slate-950',
      sub: 'text-slate-500',
      spinner: '#00A3A2',
    };
  }

  if (isOled) {
    return {
      page: 'bg-black text-white',
      glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%)]',
      grid: 'bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)]',
      card: 'border-white/10 bg-[#050505]/86 shadow-[0_24px_70px_rgba(0,0,0,0.55)]',
      main: 'text-white',
      sub: 'text-slate-500',
      spinner: '#22d3ee',
    };
  }

  if (isAurora) {
    return {
      page: 'bg-[#06130f] text-white',
      glow: 'bg-[radial-gradient(circle_at_44%_10%,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(59,130,246,0.16),transparent_36%)]',
      grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
      card: 'border-emerald-300/10 bg-[#0b1b16]/82 shadow-[0_24px_70px_rgba(0,0,0,0.42)]',
      main: 'text-white',
      sub: 'text-emerald-100/55',
      spinner: '#34d399',
    };
  }

  return {
    page: 'bg-[#111027] text-white',
    glow: 'bg-[radial-gradient(circle_at_50%_15%,rgba(129,107,255,0.18),transparent_38%),radial-gradient(circle_at_18%_78%,rgba(0,163,162,0.08),transparent_34%)]',
    grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
    card: 'border-white/10 bg-[#17162f]/80 shadow-black/30',
    main: 'text-white',
    sub: 'text-slate-400',
    spinner: '#22d3ee',
  };
}

function LoadingScreen() {
  const [theme] = useState(themeShell);

  return (
    <div className={`min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      <div className={`absolute inset-0 ${theme.glow}`} />
      <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div
          className="h-14 w-14 rounded-full border-4 animate-spin"
          style={{ borderColor: `${theme.spinner}35`, borderTopColor: theme.spinner }}
        />
        <p className={`text-base font-black tracking-tight ${theme.main}`}>Ładowanie</p>
      </div>
    </div>
  );
}

function ConnectionTimeoutScreen() {
  const [theme] = useState(themeShell);

  return (
    <div className={`min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      <div className={`absolute inset-0 ${theme.glow}`} />
      <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />
      <div className={`relative z-10 w-full max-w-md rounded-3xl border ${theme.card} p-8 text-center shadow-2xl backdrop-blur-2xl`}>
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-400/20 bg-red-500/12 text-red-400 shadow-[0_0_45px_rgba(248,113,113,0.18)]">
          <ClockAlert size={38} strokeWidth={2.4} />
        </div>
        <h1 className={`text-2xl font-black tracking-tight ${theme.main}`}>Przekroczono czas połączenia</h1>
        <p className={`mx-auto mt-5 max-w-xs text-sm leading-6 ${theme.sub}`}>
          Wystąpił błąd podczas łączenia z serwerem.
          <br />
          Szczegóły błędu:
        </p>
        <p className="mt-5 font-mono text-base font-bold text-red-400">Invalid Time Error</p>
        <div className="my-7 h-px w-full bg-white/10" />
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mx-auto inline-flex h-12 min-w-56 items-center justify-center gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-6 text-sm font-black text-emerald-50 shadow-[0_0_26px_rgba(16,185,129,0.18)] transition-all hover:bg-emerald-500/25 active:scale-95"
        >
          <RefreshCw size={20} />
          Załaduj ponownie
        </button>
      </div>
    </div>
  );
}

function MaintenanceScreen({ onRefresh, checking }: { onRefresh: () => void | Promise<void>; checking: boolean }) {
  const [themeMode] = useState(getStoredThemeMode);
  const isWarm = themeMode === 'light-warm';
  const isLight = themeMode === 'light' || isWarm;
  const isOled = themeMode === 'dark-oled';
  const isAurora = themeMode === 'dark-aurora';

  const theme = isWarm
    ? {
        page: 'bg-[#f2ede1] text-[#272116]',
        glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(245,158,11,0.18),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(0,163,162,0.09),transparent_34%)]',
        grid: 'bg-[linear-gradient(rgba(93,79,50,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(93,79,50,0.045)_1px,transparent_1px)]',
        card: 'border-[#d8cdb2] bg-[#faf7ef]/86 shadow-[0_24px_70px_rgba(93,79,50,0.16)]',
        icon: 'border-amber-500/20 bg-amber-500/10 text-amber-600 shadow-[0_0_45px_rgba(245,158,11,0.18)]',
        sub: 'text-[#746a58]',
        button: 'border-[#00A3A2]/35 bg-[#00A3A2]/8 text-[#008f8e] shadow-[0_0_26px_rgba(0,163,162,0.10)] hover:bg-[#00A3A2]/12',
      }
    : isLight
      ? {
          page: 'bg-slate-50 text-slate-950',
          glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%),radial-gradient(circle_at_16%_80%,rgba(99,102,241,0.10),transparent_34%)]',
          grid: 'bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)]',
          card: 'border-slate-200 bg-white/86 shadow-[0_24px_70px_rgba(15,23,42,0.12)]',
          icon: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600 shadow-[0_0_45px_rgba(0,163,162,0.16)]',
          sub: 'text-slate-500',
          button: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-700 shadow-[0_0_26px_rgba(0,163,162,0.10)] hover:bg-cyan-500/10',
        }
      : isOled
        ? {
            page: 'bg-black text-white',
            glow: 'bg-[radial-gradient(circle_at_50%_12%,rgba(0,163,162,0.14),transparent_38%)]',
            grid: 'bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)]',
            card: 'border-white/10 bg-[#050505]/86 shadow-[0_24px_70px_rgba(0,0,0,0.55)]',
            icon: 'border-white/10 bg-white/5 text-cyan-300 shadow-[0_0_45px_rgba(0,163,162,0.18)]',
            sub: 'text-slate-500',
            button: 'border-cyan-400/35 bg-cyan-400/5 text-cyan-300 shadow-[0_0_26px_rgba(34,211,238,0.10)] hover:bg-cyan-400/10',
          }
        : isAurora
          ? {
              page: 'bg-[#06130f] text-white',
              glow: 'bg-[radial-gradient(circle_at_44%_10%,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_78%_72%,rgba(59,130,246,0.16),transparent_36%)]',
              grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
              card: 'border-emerald-300/10 bg-[#0b1b16]/82 shadow-[0_24px_70px_rgba(0,0,0,0.42)]',
              icon: 'border-emerald-300/15 bg-emerald-400/10 text-emerald-300 shadow-[0_0_45px_rgba(16,185,129,0.20)]',
              sub: 'text-emerald-100/55',
              button: 'border-emerald-300/30 bg-emerald-400/5 text-emerald-300 shadow-[0_0_26px_rgba(16,185,129,0.10)] hover:bg-emerald-400/10',
            }
          : {
              page: 'bg-[#111027] text-white',
              glow: 'bg-[radial-gradient(circle_at_50%_15%,rgba(129,107,255,0.18),transparent_38%),radial-gradient(circle_at_18%_78%,rgba(0,163,162,0.08),transparent_34%)]',
              grid: 'bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]',
              card: 'border-white/10 bg-[#17162f]/80 shadow-black/30',
              icon: 'border-white/10 bg-white/5 text-violet-300 shadow-[0_0_45px_rgba(129,107,255,0.18)]',
              sub: 'text-slate-400',
              button: 'border-cyan-400/35 bg-cyan-400/5 text-cyan-300 shadow-[0_0_26px_rgba(34,211,238,0.10)] hover:bg-cyan-400/10',
            };

  return (
    <div className={`min-h-screen overflow-hidden ${theme.page} flex items-center justify-center p-6 font-sans relative`}>
      <div className={`absolute inset-0 ${theme.glow}`} />
      <div className={`absolute inset-0 ${theme.grid} bg-[size:64px_64px] opacity-50`} />

      <div className={`relative z-10 w-full max-w-md rounded-3xl border ${theme.card} p-8 text-center shadow-2xl backdrop-blur-2xl`}>
        <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border ${theme.icon}`}>
          <Wrench size={28} strokeWidth={2.4} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Przerwa techniczna</h1>
        <p className={`mx-auto mt-7 max-w-xs text-sm leading-6 ${theme.sub}`}>
          Trwa przerwa techniczna.
          <br />
          Aplikacja będzie dostępna wkrótce.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={checking}
          className={`mx-auto mt-6 inline-flex h-10 min-w-44 items-center justify-center gap-3 rounded-2xl border px-6 text-sm font-black transition-all active:scale-95 disabled:cursor-wait disabled:opacity-70 ${theme.button}`}
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Sprawdzanie' : 'Odśwież'}
        </button>
      </div>
    </div>
  );
}

function BanScreen({ device }: { device: DeviceData }) {
  const { banDetails } = device;
  const expireDate = banDetails?.expiresAt ? new Date(banDetails.expiresAt).toLocaleString('pl-PL') : 'Nigdy';
  const [silentError] = useState(() => {
    const codes = ['ERR_0x', 'E', 'APP-', 'SYS-'];
    const prefix = codes[Math.floor(Math.random() * codes.length)] || 'ERR_';
    return `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
  });
  const silentMessage = 'Wystąpił błąd. Spróbuj ponownie później.';
  const [silentIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const theme = localStorage.getItem('mks_app_theme') || 'system';
    if (theme.startsWith('dark')) return true;
    if (theme.startsWith('light')) return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  });
  const gifUrl =
    banDetails?.gifUrl && !String(banDetails.gifUrl).startsWith('blob:')
      ? banDetails.gifUrl
      : '';

  if (banDetails?.silent) {
    return (
      <div className={[
        'min-h-screen flex items-center justify-center p-6 font-sans',
        silentIsDark ? 'bg-[#05070b] text-slate-100' : 'bg-slate-50 text-slate-900'
      ].join(' ')}>
        <div className="w-full max-w-md text-center">
          <div className={[
            'mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border text-2xl font-black',
            silentIsDark ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
          ].join(' ')}>
            !
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Błąd</h1>
          <p className={['mt-3 text-sm leading-6', silentIsDark ? 'text-slate-400' : 'text-slate-600'].join(' ')}>
            {silentMessage}
          </p>
          <div className={[
            'mx-auto mt-6 inline-flex rounded-xl border px-4 py-2 font-mono text-xs font-bold tracking-wide',
            silentIsDark ? 'border-slate-800 bg-slate-900/70 text-slate-500' : 'border-slate-200 bg-white text-slate-500'
          ].join(' ')}>
            {silentError}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0c1b] text-white flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[400px] bg-red-600/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-5xl rounded-3xl border border-red-500/20 bg-slate-950/60 backdrop-blur-3xl p-8 md:p-12 shadow-2xl relative z-10 flex flex-col md:flex-row gap-8 items-center border-t-red-500/40">
        <div className="flex-1 space-y-8">
          <div>
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-red-600 tracking-tight leading-tight">
              ZOSTAŁEŚ
              <br />
              ZBANOWANY!
            </h1>
            <p className="text-slate-400 text-lg mt-4 font-medium">Twoje urządzenie zostało zablokowane.</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-4 flex gap-4 items-center">
              <div className="p-3 rounded-full bg-red-500/10 text-red-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Blokada wygasa</p>
                <p className="text-lg font-medium text-slate-200">{expireDate}</p>
              </div>
            </div>

            {banDetails?.reason && (
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 flex gap-4 items-center">
                <div className="p-3 rounded-full bg-red-500/10 text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Powód blokady</p>
                  <p className="text-lg font-medium text-slate-200">{banDetails.reason}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm text-slate-500">Jeśli uważasz, że to błąd - skontaktuj się z administratorem.</p>
        </div>

        {gifUrl && (
          <div className="flex-1 w-full max-w-md shrink-0">
            <div className="aspect-video sm:aspect-square w-full rounded-2xl overflow-hidden shadow-xl">
              <img src={gifUrl} alt="Ban GIF" className="h-full w-full object-cover object-center opacity-90" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
