/** A fallback router can share its in-flight work by stop pattern, but persisted
 * operator geometry must not leak between courses taking different streets. */
export function routeGeometryKey(mode: string, provider: string, line: string, direction: string,
  stops: Array<{lat: number; lon: number}>, variant?: string) {
  const geometry = stops.map(stop => `${Number(stop.lat).toFixed(6)},${Number(stop.lon).toFixed(6)}`).join('|');
  let hash = 2166136261;
  for (let i=0;i<geometry.length;i++) { hash ^= geometry.charCodeAt(i); hash = Math.imul(hash,16777619); }
  const parts=[mode,provider,line,direction].map(value => String(value).trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_.-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).toLowerCase());
  return parts.concat((hash>>>0).toString(36),...(variant?[encodeURIComponent(variant)]:[])).join(':');
}
