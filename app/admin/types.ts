export type Role = 'Właściciel' | 'Administrator' | 'Użytkownik';
export type Status = 'Aktywny' | 'Zablokowany';
export type IconType = 'mobile' | 'desktop' | 'tablet';

export interface Device {
  id: string;
  name: string;
  /** Short UA / OS line for table subtitle */
  os: string;
  displayName?: string;
  deviceId: string;
  firstLogin: string;
  role: Role;
  rawRole?: 'owner' | 'admin' | 'user';
  status: Status;
  iconType: IconType;
  /** Tekst „ostatnio online” (Europe/Warsaw) lub brak danych */
  lastSeenLabel?: string;
  lastSeenOnline?: boolean;
  permissions?: AdminPermissions;
}

export type OperatorRole = 'WŁAŚCICIEL' | 'ADMIN' | 'UŻYTKOWNIK';
export interface AdminPermissions {
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
}

export interface Operator {
  id: string;
  name: string;
  role: OperatorRole;
  innerId: string;
  lastActive: string;
  lastActiveOnline?: boolean;
  permissions: AdminPermissions;
}

export type LogCategory = 'SYSTEM' | 'OPERATOR';

export interface Log {
  id: string;
  /** Epoch ms for filtering (Europe/Warsaw boundaries in UI). */
  createdAtMs?: number;
  date?: string;
  time: string;
  timeAgo: string;
  title: string;
  description: string;
  location?: string;
  category: LogCategory;
  iconType: 'connect' | 'login' | 'gps_lost' | 'ban' | 'role_change' | 'disconnect' | 'gps_spoof' | 'edit_role';
}

export type BanStatus = 'AKTYWNY' | 'ZAKOŃCZONY';

export interface Ban {
  id: string;
  deviceName: string;
  deviceId: string;
  location: string;
  status: BanStatus;
  /** "PERMANENTNY" when no expiry date, otherwise "CZASOWY". */
  kind?: 'PERMANENTNY' | 'CZASOWY';
  expireIn: string;
  reason: string;
  bannedBy: string;
  /** Fixed ban issue datetime (formatted once from stored timestamp). */
  date: string;
}
