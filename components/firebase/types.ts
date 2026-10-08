
import {User} from 'firebase/auth';

import {buildDevicePermissions, type DeviceRole} from '@/lib/admin/rbac';


export interface DeviceData {
  deviceInfo: string;
  /** Optional person/operator name set by an admin (stored on `devices/{id}`). */
  displayName?: string;
  /** Optional friendly hardware name shown in the devices list. */
  deviceName?: string;
  role: DeviceRole;
  firstLogin: string;
  status: 'active' | 'banned';
  verified?: boolean;
  permissions?: ReturnType<typeof buildDevicePermissions>;
  banDetails?: {
    expiresAt: string;
    reason: string;
    gifUrl: string;
    silent?: boolean;
    autoBan?: boolean;
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
  deviceName?: string;
  status?: 'active' | 'banned';
  verified?: boolean;
  banDetails?: DeviceData['banDetails'];
}

interface FirebaseContextType {
  user: User | null;
  device: DeviceData | null;
  isBanned: boolean;
  loading: boolean;
  /** Lokalnie Ĺ›ledzony lastSeenAt (ms epoch) â€” nie migocze przy zmianie karty. */
  localLastSeenMs: number | null;
  hiddenProviderIds: string[];
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

export type {InstallationProfile};
export type {FirebaseContextType};
export type {NavigatorWithUAData};
