

import {type PersistentCacheEnvelope} from '../transport/types';

const CLIENT_STOP_CACHE_VERSION = 4;

const CLIENT_STOP_CACHE_TTL_MS = 15 * 60 * 1000;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheSignature(value: unknown) {
  const normalized = stableStringify(value);
  const size = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>).length
      : 0;
  return `${size}:${hashString(normalized)}`;
}

function readPersistentClientCache<T>(key: string): PersistentCacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null') as PersistentCacheEnvelope<T> | null;
    if (!parsed || parsed.version !== CLIENT_STOP_CACHE_VERSION || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistentClientCache<T>(key: string, data: T) {
  if (typeof window === 'undefined') return cacheSignature(data);
  const signature = cacheSignature(data);

  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: CLIENT_STOP_CACHE_VERSION,
      savedAt: Date.now(),
      signature,
      data,
    } satisfies PersistentCacheEnvelope<T>));
  } catch {
    // The in-memory/network result is still used if persistent storage is full.
  }
  return signature;
}

export {CLIENT_STOP_CACHE_VERSION};
export {CLIENT_STOP_CACHE_TTL_MS};
export {stableStringify};
export {hashString};
export {cacheSignature};
export {readPersistentClientCache};
export {writePersistentClientCache};
