export const BUILTIN_TRANSPORT_URL = 'https://www.mpkrzeszow.pl/pks';
export const BUILTIN_TRANSPORT_ID = 'default-transport-api';
export interface TransportRuntime {
  endpointId: string;
  endpointUrl: string;
  fallbackEnabled: boolean;
}
let config: TransportRuntime | null = null;
export function setTransportRuntime(value: unknown) {
  const data = value as Partial<TransportRuntime> | null;
  if (data?.endpointId === BUILTIN_TRANSPORT_ID && String(data.endpointUrl).replace(/\/+$/, '') === BUILTIN_TRANSPORT_URL) { config = null; return; }
  try {
    const url = new URL(String(data?.endpointUrl || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /transportGateway\/?$/.test(url.pathname)) throw new Error('Invalid endpoint');
    config = { endpointId: String(data?.endpointId || ''), endpointUrl: url.toString().replace(/\/+$/, ''), fallbackEnabled: data?.fallbackEnabled === true };
  } catch { config = null; }
}
export function getTransportRuntime() { return config; }
export function transportApiBase(defaultUrl: string) {
  // Spark has no deployed gateway. Android uses native HTTP; browser endpoints
  // must permit CORS, which is checked from the same client before activation.
  return config?.endpointUrl || defaultUrl;
}
