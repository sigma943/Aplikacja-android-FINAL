export interface TransportRuntime {
  endpointId: string;
  endpointUrl: string;
  fallbackEnabled: boolean;
}
let config: TransportRuntime | null = null;
export function setTransportRuntime(value: unknown) {
  const data = value as Partial<TransportRuntime> | null;
  try {
    const url = new URL(String(data?.endpointUrl || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /transportGateway\/?$/.test(url.pathname)) throw new Error('Invalid endpoint');
    config = { endpointId: String(data?.endpointId || ''), endpointUrl: url.toString().replace(/\/+$/, ''), fallbackEnabled: data?.fallbackEnabled === true };
  } catch { config = null; }
}
export function getTransportRuntime() { return config; }
export function transportApiBase(defaultUrl: string) {
  // The server gateway applies the active configuration and avoids depending on
  // custom endpoints granting CORS access to browsers and Android WebViews.
  return config && config.endpointUrl !== defaultUrl
    ? (process.env.NEXT_PUBLIC_TRANSPORT_GATEWAY_URL || 'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportGateway').replace(/\/+$/, '')
    : defaultUrl;
}
