
import {type TransportProviderId} from '@/lib/pks-client';

const DEFAULT_ACTIVE_PROVIDERS: TransportProviderId[] = ['pks'];

const AVAILABLE_TRANSPORT_PROVIDERS = new Set<TransportProviderId>(['pks', 'mpk_rzeszow', 'marcel']);

const PKP_INTERCITY_REFRESH_MS = 60_000;

const NETWORK_REACHABILITY_URL = 'https://www.gstatic.com/generate_204';

async function hasInternetReachability(timeoutMs = 2500) {
  if (typeof window === 'undefined') return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${NETWORK_REACHABILITY_URL}?ts=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const sanitizeProvidersWithVisibility = (
  providers: TransportProviderId[],
  hiddenProviders: Set<TransportProviderId>,
) => {
  const unique = providers
    .filter((providerId, index, values) => values.indexOf(providerId) === index)
    .filter((providerId) => AVAILABLE_TRANSPORT_PROVIDERS.has(providerId))
    .filter((providerId) => !hiddenProviders.has(providerId));
  return unique;
};

const readStoredTransportProviders = (): TransportProviderId[] => {
  if (typeof window === 'undefined') return DEFAULT_ACTIVE_PROVIDERS;
  try {
    const parsed = JSON.parse(localStorage.getItem('mks_transport_providers') || 'null');
    if (!Array.isArray(parsed)) return DEFAULT_ACTIVE_PROVIDERS;
    const storedProviders = parsed.filter(
      (provider): provider is TransportProviderId =>
        typeof provider === 'string' && AVAILABLE_TRANSPORT_PROVIDERS.has(provider as TransportProviderId),
    );
    return storedProviders;
  } catch {
    return DEFAULT_ACTIVE_PROVIDERS;
  }
};

const sameTransportProviders = (left: TransportProviderId[], right: TransportProviderId[]) => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((provider) => rightSet.has(provider));
};

const VEHICLE_PROVIDER_STALE_GRACE_MS = 90_000;

export {DEFAULT_ACTIVE_PROVIDERS};
export {AVAILABLE_TRANSPORT_PROVIDERS};
export {PKP_INTERCITY_REFRESH_MS};
export {NETWORK_REACHABILITY_URL};
export {hasInternetReachability};
export {sanitizeProvidersWithVisibility};
export {readStoredTransportProviders};
export {sameTransportProviders};
export {VEHICLE_PROVIDER_STALE_GRACE_MS};
