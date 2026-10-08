

const TRANSPORT_API_BASE_URL = (
  process.env.NEXT_PUBLIC_TRANSPORT_API_BASE_URL ||
  'https://us-central1-aplikacja-b20fa.cloudfunctions.net/transportApi'
).replace(/\/$/, '');

const MPK_RZESZOW_VEHICLES_JSON_URL = 'https://www.mpkrzeszow.pl/ztm/new/api.php?type=mpk';

const MPK_RZESZOW_VEHICLES_XML_URL = 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';

export const MPK_RZESZOW_MYBUS_VEHICLES_URL = 'http://84.38.160.220/myBusServices/SchedulesService.svc/GetVehicles?cNbLst=&cTrackLst=&cDirLst=&cIdLst=&cKrsLst=&cRouteLst=';

const MPK_RZESZOW_VEHICLES_DETAILS_URL = 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';

const MPK_RZESZOW_TRIP_STOPS_URL = 'https://www.mpkrzeszow.pl/brygady/get_trip_stops_advanced.php';

const MARCEL_API_BASE_URL = (process.env.NEXT_PUBLIC_MARCEL_API_BASE_URL || 'https://api-site.marcel-bus.pl').replace(/\/$/, '');

const MARCEL_DIRECT_VEHICLES_URL =
  process.env.NEXT_PUBLIC_MARCEL_VEHICLES_URL ||
  `${MARCEL_API_BASE_URL}/client/api/trasy/lokalizacjaBusow?appVersion=v1.67`;

const MPK_RZESZOW_STOPS_URL = 'https://www.mpkrzeszow.pl/przystanki/stopscache';

const MPK_RZESZOW_STOP_SCHEDULE_URL = 'https://www.mpkrzeszow.pl/przystanki/offline_schedule.php';

const PKP_INTERCITY_GPS_PROXY_URL =
  process.env.NEXT_PUBLIC_PKP_INTERCITY_GPS_PROXY_URL ||
  '/api/pkp-intercity/gps';

const PKP_STATIONS_DATASET_URL =
  process.env.NEXT_PUBLIC_PKP_STATIONS_DATASET_URL ||
  'https://cdn.jsdelivr.net/gh/trainline-eu/stations/stations.csv';

const PKP_DEFAULT_CENTER: [number, number] = [50.0429, 22.0069]; // Rzeszow Glowny

const PKP_MAX_DISTANCE_KM = Number(process.env.NEXT_PUBLIC_PKP_INTERCITY_MAX_DISTANCE_KM || 120);

const PKP_METADATA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const PKP_METADATA_LOOKUP_LIMIT = 80;

export {TRANSPORT_API_BASE_URL};
export {MPK_RZESZOW_VEHICLES_JSON_URL};
export {MPK_RZESZOW_VEHICLES_XML_URL};
export {MPK_RZESZOW_VEHICLES_DETAILS_URL};
export {MPK_RZESZOW_TRIP_STOPS_URL};
export {MARCEL_API_BASE_URL};
export {MARCEL_DIRECT_VEHICLES_URL};
export {MPK_RZESZOW_STOPS_URL};
export {MPK_RZESZOW_STOP_SCHEDULE_URL};
export {PKP_INTERCITY_GPS_PROXY_URL};
export {PKP_STATIONS_DATASET_URL};
export {PKP_DEFAULT_CENTER};
export {PKP_MAX_DISTANCE_KM};
export {PKP_METADATA_CACHE_TTL_MS};
export {PKP_METADATA_LOOKUP_LIMIT};
