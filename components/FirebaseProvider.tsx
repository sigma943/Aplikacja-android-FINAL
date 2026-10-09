'use client';

import {createContext, useContext, useEffect, useState} from 'react';
import {Capacitor, registerPlugin} from '@capacitor/core';
import {auth, db, functions} from '@/lib/firebase';
import {registerRestoredDevice, stableAndroidInstallationId} from '@/lib/device-registration';
import {ensureFirebaseUser, registerDeviceOnce} from '@/lib/firebase-session';
import {setTransportRuntime} from '@/lib/transport-runtime';
import {onAuthStateChanged, User} from 'firebase/auth';
import {httpsCallable} from 'firebase/functions';
import {doc, onSnapshot, updateDoc, serverTimestamp, setDoc, getDoc, deleteField} from 'firebase/firestore';
import {buildDevicePermissions, type DeviceRole} from '@/lib/admin/rbac';
import {agentLog} from '@/lib/debug-agent-log';

export type { DeviceRole };

import {type DeviceData, type FirebaseContextType, type NavigatorWithUAData} from '@/components/firebase/types';
import {LoadingScreen, startupFailureMessage, ConnectionTimeoutScreen, MaintenanceScreen, BanScreen} from '@/components/firebase/StartupScreens';

const StableDeviceId = registerPlugin<{ getId: () => Promise<{ identifier?: string }> }>('StableDeviceId');

const registerDeviceIdentityFn = httpsCallable<
  { installationId: string; deviceInfo: string },
  { ok?: boolean; installationId?: string; status?: string; dedupedPreviousUid?: string }
>(functions, 'registerDeviceIdentity', { timeout: 5000 });

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  device: null,
  isBanned: false,
  loading: true,
  localLastSeenMs: null,
  hiddenProviderIds: [],
});

const HIDDEN_PROVIDERS_CACHE_KEY = 'mks_hidden_provider_ids';

function readHiddenProviderIdsCache() {
  if (typeof window === 'undefined') return [] as string[];
  try {
    const raw = JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_CACHE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value !== 'pkp_intercity')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeHiddenProviderIds(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];
  return [...new Set(
    raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value !== 'pkp_intercity')
      .filter(Boolean),
  )];
}

function persistHiddenProviderIdsCache(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HIDDEN_PROVIDERS_CACHE_KEY, JSON.stringify(ids));
  } catch {
    // ignore persistent cache errors
  }
}

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
  const [startupError,setStartupError]=useState<string|null>(null);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [networkStatusReady, setNetworkStatusReady] = useState(
    () => typeof window === 'undefined' || !Capacitor.isNativePlatform(),
  );
  const [initialRenderReleased, setInitialRenderReleased] = useState(false);
  const [checkingMaintenance, setCheckingMaintenance] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceLatched, setMaintenanceLatched] = useState(false);
  const [autoBanUnverified, setAutoBanUnverified] = useState(false);
  const [localLastSeenMs, setLocalLastSeenMs] = useState<number | null>(null);
  const [hiddenProviderIds, setHiddenProviderIds] = useState<string[]>(() => readHiddenProviderIdsCache());

  useEffect(() => {
    let cancelled = false;
    let nativeListenerPromise: Promise<{ remove: () => Promise<void> }> | null = null;

    const syncOnlineState = async () => {
      let isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

      if (Capacitor.isNativePlatform()) {
        try {
          const { Network } = await import('@capacitor/network');
          const status = await Network.getStatus();
          isOffline = !status.connected;
        } catch (err) {
          console.warn('Native network status unavailable', err);
        }
      }

      if (!cancelled) {
        setBrowserOffline(isOffline);
        setNetworkStatusReady(true);
      }
    };

    syncOnlineState();

    if (Capacitor.isNativePlatform()) {
      nativeListenerPromise = import('@capacitor/network').then(({ Network }) =>
        Network.addListener('networkStatusChange', (status) => {
          setBrowserOffline(!status.connected);
          setNetworkStatusReady(true);
        }),
      );
    }

    window.addEventListener('online', syncOnlineState);
    window.addEventListener('offline', syncOnlineState);
    window.addEventListener('focus', syncOnlineState);
    document.addEventListener('visibilitychange', syncOnlineState);
    return () => {
      cancelled = true;
      nativeListenerPromise?.then((listener) => listener.remove()).catch(() => {});
      window.removeEventListener('online', syncOnlineState);
      window.removeEventListener('offline', syncOnlineState);
      window.removeEventListener('focus', syncOnlineState);
      document.removeEventListener('visibilitychange', syncOnlineState);
    };
  }, []);

  const buildAutoBanDetails = () => ({
    reason: 'Urządzenie niezweryfikowane',
    expiresAt: '',
    gifUrl: '',
    silent: true,
    autoBan: true,
    bannedBy: 'Auto-ban',
    bannedAt: new Date().toISOString(),
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const login = () => {
      if (cancelled) return;
      ensureFirebaseUser(auth).catch((error) => {
        if (cancelled) return;
        console.error('Anonymous sign-in failed', error);
        setStartupError(startupFailureMessage(error));
        // A made-up guest UID has no Firebase credentials and cannot write.
        // Retry with real credentials after temporary network failures.
        retryTimer = setTimeout(login, 10_000);
      });
    };
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (cancelled) return;
      setUser(currentUser);
      if (!currentUser) login();
    });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  const getOrCreateInstallationId = async () => {
    const key = 'pks_installation_id';
    const cookieKey = 'pks_installation_id';
    const isWeb = typeof window !== 'undefined' && !Capacitor.isNativePlatform();

    if (Capacitor.isNativePlatform()) {
      let cached:string|null=null;
      try {cached=localStorage.getItem(key);}catch {}
      const value=await stableAndroidInstallationId(
        async()=>String((await StableDeviceId.getId()).identifier||''),
        async()=>{const {Device}=await import('@capacitor/device');return String((await Device.getId()).identifier||'');},cached);
      try {localStorage.setItem(key,value);}catch {}
      return value;
    }

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
      if (Capacitor.isNativePlatform() && !existing.startsWith('android_')) {
        const normalizedNative = `android_${existing}`;
        localStorage.setItem(key, normalizedNative);
        return normalizedNative;
      }
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
    let cancelled = false;
    let mirroredAccess = '';

    const register = async () => {
      try {
        // Independent native reads run together; registration still waits for
        // both and retains all identity and permission checks.
        const useIdentityFunction = process.env.NEXT_PUBLIC_USE_IDENTITY_FUNCTION === 'true';
        const [instId, deviceInfo, initialDevice] = await Promise.all([
          getOrCreateInstallationId(), getClientDeviceInfo(),
          useIdentityFunction ? Promise.resolve(null) : getDoc(deviceRef),
        ]);
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
        if (process.env.NEXT_PUBLIC_USE_IDENTITY_FUNCTION === 'true') try {
          await registerDeviceIdentityFn({ installationId: instId, deviceInfo });
          agentLog(
            'FirebaseProvider.tsx:registerIdentity:functionOk',
            'Device identity saved via Cloud Function',
            {
              uidPrefix: user.uid.slice(0, 8),
              installationIdPrefix: instId.slice(0, 12),
            },
            'H5',
          );
          return;
        } catch (fnErr) {
          console.warn('Cloud Function device registration unavailable, using Firestore fallback', fnErr);
        }

        const installationRef = doc(db, 'installations', instId);
        const existing = initialDevice || await getDoc(deviceRef);
        if (!existing.exists()) {
          const securitySnap=await getDoc(doc(db,'admin_settings','security')).catch(()=>null);
          await registerRestoredDevice(db,user.uid,instId,deviceInfo,
            Boolean(securitySnap?.exists()?securitySnap.data()?.autoBan:false),buildAutoBanDetails());
        } else {
          // Existing device docs can only update allowed heartbeat fields from client rules.
          await updateDoc(deviceRef, { lastSeenAt: serverTimestamp(), deviceInfo }).catch(async () => {
            await updateDoc(deviceRef, { lastSeenAt: serverTimestamp() });
          });
          const existingData = existing.data() as DeviceData;
          const role = existingData.role === 'owner' || existingData.role === 'admin' ? existingData.role : 'user';
          const verified = role === 'owner' || role === 'admin' || existingData.verified === true;
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
              status: existingData.status || 'active',
              verified,
              ...(existingData.banDetails ? { banDetails: existingData.banDetails } : {}),
              ...(existingData.displayName ? { displayName: existingData.displayName } : {}),
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
              lastUid: user.uid,
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
        throw err;
      }
    };
    let registered = false;
    let running = false;
    const attempt = async () => {
      if (cancelled || registered || running) return;
      running = true;
      try {
        await registerDeviceOnce(user.uid, register);
        registered = true;
        if(!cancelled)setStartupError(null);
      } catch(error) {
        if(!cancelled)setStartupError(startupFailureMessage(error));
        // Keep the same UID and installation ID when retrying.
      } finally {
        running = false;
      }
    };
    void attempt();
    const retryTimer = window.setInterval(attempt, 10_000);
    window.addEventListener('online', attempt);

    const unsub = onSnapshot(deviceRef, async (snapshot) => {
      if (cancelled) return;
      if (snapshot.exists()) {
        const data = snapshot.data() as DeviceData;
        // Persist access changes from the admin UI AND Firebase Console. Heartbeats
        // must not rewrite the saved profile, and UI defaults must not alter grants.
        if(data.installationId&&data.permissions) {
          const access={installationId:data.installationId,role:data.role,permissions:data.permissions,status:data.status||'active',verified:data.verified===true,
            ...(data.banDetails?{banDetails:data.banDetails}:{}),...(data.displayName?{displayName:data.displayName}:{}),...(data.deviceName?{deviceName:data.deviceName}:{}),...(typeof data.firstLogin==='string'?{firstLogin:data.firstLogin}:{})};
          const signature=JSON.stringify(access);
          if(signature!==mirroredAccess) {
            mirroredAccess=signature;
            void setDoc(doc(db,'installations',data.installationId),{...access,banDetails:data.banDetails||deleteField(),displayName:data.displayName||deleteField(),updatedBy:user.uid,lastUid:user.uid,updatedAt:serverTimestamp()},{merge:true}).catch(error=>console.warn('Access profile mirror failed',error));
          }
        }
        if ((data.role === 'owner' || data.role === 'admin') && data.verified !== true) {
          data.verified = true;
        }
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
        setStartupError(null);
        setLoading(false);
      } else {
        setDevice(null);
        // A missing record is not a successful registration. Wait for the
        // write/retry to finish before releasing the initial loading screen.
        setLoading(true);
        // Deletion revokes the current access immediately. Re-register from
        // server records rather than the previous role held in React state.
        if(registered && snapshot.metadata?.fromCache!==true) {
          registered=false;
          mirroredAccess='';
          void attempt();
        }
      }
    }, (err) => {
      console.error("Snapshot error", err);
      const code = String((err as any)?.code || '').toLowerCase();
      const message = String((err as any)?.message || '').toLowerCase();
      const isNetworkProblem =
        code.includes('unavailable') ||
        code.includes('deadline') ||
        message.includes('network') ||
        message.includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);
      if (isNetworkProblem) {
        setBrowserOffline(true);
        return;
      }
      setDevice(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.removeEventListener('online', attempt);
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
    const interval = window.setInterval(ping, 30_000);
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
        setAutoBanUnverified(Boolean(data.autoBan));
        const hiddenIds = normalizeHiddenProviderIds((data as any).hiddenProviderIds);
        setHiddenProviderIds(hiddenIds);
        persistHiddenProviderIdsCache(hiddenIds);
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

  useEffect(() => {
    setTransportRuntime(null);
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'admin_settings', 'transport_runtime'),
      snapshot => setTransportRuntime(snapshot.exists() ? snapshot.data() : null),
      () => setTransportRuntime(null));
    return () => { unsubscribe(); setTransportRuntime(null); };
  }, [user]);

  useEffect(() => {
    if (!user?.uid || !device || !autoBanUnverified) return;
    if (device.role !== 'user' || device.verified === true || device.status === 'banned') return;

    const banDetails = buildAutoBanDetails();
    const deviceRef = doc(db, 'devices', user.uid);
    const instId = String(device.installationId || '').trim();
    updateDoc(deviceRef, {
      status: 'banned',
      verified: false,
      banDetails,
    }).catch((err) => console.error('Auto-ban update failed', err));
    if (instId) {
      setDoc(
        doc(db, 'installations', instId),
        {
          installationId: instId,
          role: 'user',
          permissions: buildDevicePermissions('user'),
          status: 'banned',
          verified: false,
          banDetails,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          lastUid: user.uid,
        },
        { merge: true },
      ).catch(() => {});
    }
  }, [autoBanUnverified, device, user?.uid]);

  const isBanned = device?.status === 'banned';
  const isPrivilegedDevice = device?.role === 'owner' || device?.role === 'admin';
  const shouldShowMaintenance = (maintenanceMode || maintenanceLatched) && device?.role === 'user';
  const shouldShowInitialOffline = !initialRenderReleased && networkStatusReady && browserOffline;
  const shouldHoldInitialRender =
    !initialRenderReleased && (!networkStatusReady || browserOffline || loading || (!isPrivilegedDevice && settingsLoading));

  useEffect(() => {
    if (!shouldHoldInitialRender && !initialRenderReleased) {
      const releaseTimer = window.setTimeout(() => setInitialRenderReleased(true), 0);
      return () => window.clearTimeout(releaseTimer);
    }
  }, [connectionTimedOut, initialRenderReleased, shouldHoldInitialRender]);

  useEffect(() => {
    if (!shouldHoldInitialRender) {
      setConnectionTimedOut(false);
      return;
    }
    if (connectionTimedOut) return;

    const timer = window.setTimeout(() => {
      setConnectionTimedOut(true);
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [connectionTimedOut, shouldHoldInitialRender]);

  const refreshMaintenanceStatus = async () => {
    if (checkingMaintenance) return;
    setCheckingMaintenance(true);
    try {
      const snap = await getDoc(doc(db, 'admin_settings', 'security'));
      const data = snap.exists() ? snap.data() : {};
      const enabled = Boolean(data.maintenanceMode);
      setMaintenanceMode(enabled);
      setMaintenanceLatched(enabled);
      const hiddenIds = normalizeHiddenProviderIds((data as any).hiddenProviderIds);
      setHiddenProviderIds(hiddenIds);
      persistHiddenProviderIdsCache(hiddenIds);
    } catch (err) {
      console.error('Manual maintenance status check failed', err);
    } finally {
      setCheckingMaintenance(false);
    }
  };

  return (
    <FirebaseContext.Provider value={{ user, device, isBanned, loading, localLastSeenMs, hiddenProviderIds }}>
      {startupError && !device && !shouldShowInitialOffline ? (
        <ConnectionTimeoutScreen errorMessage={startupError} />
      ) : connectionTimedOut && shouldHoldInitialRender ? (
        <ConnectionTimeoutScreen timeout />
      ) : shouldShowInitialOffline ? (
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

export type {DeviceData} from '@/components/firebase/types';
