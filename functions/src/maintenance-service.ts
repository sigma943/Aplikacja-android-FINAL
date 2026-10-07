import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { maintenanceService as createService, type MaintenanceStore } from './maintenance-core';
export { MaintenanceError, DEFAULT_ENDPOINT_ID, DEFAULT_API_URL, endpointUrl, probeEndpoint } from './maintenance-core';
export function maintenanceService(db: Firestore, fetcher: typeof fetch = fetch) {
  return createService(db as unknown as MaintenanceStore, fetcher, () => FieldValue.serverTimestamp());
}
