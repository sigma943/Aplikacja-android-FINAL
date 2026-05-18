"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mpkRzeszowProvider = void 0;
const cache_1 = require("./cache");
const VEHICLES_XML_URL = process.env.MPK_RZESZOW_VEHICLES_XML_URL || 'https://www.mpkrzeszow.pl/mpk/vehicles_proxy.php';
const VEHICLES_DETAILS_URL = process.env.MPK_RZESZOW_VEHICLES_DETAILS_URL || 'https://www.mpkrzeszow.pl/mpk/get_vehicles.php';
const STOPS_URL = 'http://einfo.zgpks.rzeszow.pl/api/stop-point';
const REQUEST_HEADERS = {
    Accept: 'application/json',
    'Accept-Language': 'pl,en;q=0.9',
    Referer: 'http://einfo.zgpks.rzeszow.pl/',
    Origin: 'http://einfo.zgpks.rzeszow.pl',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};
function parseJsonDate(value, fallbackMs) {
    const raw = String(value || '').trim();
    if (!raw)
        return fallbackMs;
    const parsed = new Date(raw.replace(' ', 'T')).getTime();
    return Number.isFinite(parsed) ? parsed : fallbackMs;
}
async function fetchJsonWithRetry(url, init, retries = 1) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
            });
            const text = await response.text();
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
            }
            return JSON.parse(text);
        }
        catch (error) {
            lastError = error;
            if (attempt === retries)
                break;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function fetchTextWithRetry(url, init, retries = 1) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
            });
            const text = await response.text();
            if (!response.ok)
                throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
            return text;
        }
        catch (error) {
            lastError = error;
            if (attempt === retries)
                break;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
function decodeXmlEntity(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}
function parseVehicleXml(xml) {
    const vehicles = [];
    const vehicleRegex = /<V\s+([\s\S]*?)\/>/g;
    let vehicleMatch;
    while ((vehicleMatch = vehicleRegex.exec(xml))) {
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(vehicleMatch[1]))) {
            attrs[attrMatch[1]] = decodeXmlEntity(attrMatch[2]);
        }
        vehicles.push(attrs);
    }
    return vehicles;
}
async function loadRawVehicles() {
    return (0, cache_1.getCachedValue)('mpk_rzeszow:raw_xml_vehicles', {
        ttlMs: 10000,
        staleMs: 50000,
        loader: async () => {
            const xml = await fetchTextWithRetry(VEHICLES_XML_URL, { headers: REQUEST_HEADERS });
            return parseVehicleXml(xml);
        },
    });
}
async function loadVehicleDetails() {
    return (0, cache_1.getCachedValue)('mpk_rzeszow:vehicle_details', {
        ttlMs: 15000,
        staleMs: 60000,
        loader: async () => {
            const data = await fetchJsonWithRetry(VEHICLES_DETAILS_URL, { headers: REQUEST_HEADERS });
            return Array.isArray(data) ? data : [];
        },
    });
}
async function loadStopsDictionary() {
    return (0, cache_1.getCachedValue)('mpk_rzeszow:stops_dictionary', {
        ttlMs: 24 * 60 * 60 * 1000,
        staleMs: 24 * 60 * 60 * 1000,
        loader: async () => {
            const data = await fetchJsonWithRetry(STOPS_URL, {
                headers: REQUEST_HEADERS,
            });
            const dictionary = {};
            for (const stop of data.items || []) {
                const stopId = String(stop.stop_point_id || '').trim();
                const stopName = String(stop.name || '').trim();
                if (!stopId || !stopName)
                    continue;
                dictionary[stopId] = stopName;
            }
            return dictionary;
        },
    });
}
function buildSchedule(nextStopPoints, stopsDictionary) {
    return (nextStopPoints || []).map((stopPoint) => {
        const stopId = Number(stopPoint.stop_point_id);
        return {
            id: stopId,
            name: stopsDictionary[String(stopId)] || `Przystanek ${stopId}`,
            planned: stopPoint.planned_departure_time ? String(stopPoint.planned_departure_time).replace(' ', 'T') : null,
            real: stopPoint.real_departure_time ? String(stopPoint.real_departure_time).replace(' ', 'T') : null,
        };
    });
}
function buildRoutePath(route) {
    const fromStopPoints = Array.isArray(route?.stop_points)
        ? route.stop_points
            .map((stopPoint) => Number(typeof stopPoint === 'object' && stopPoint !== null ? stopPoint.stop_point_id : stopPoint))
            .filter((stopPointId) => Number.isFinite(stopPointId))
        : [];
    if (fromStopPoints.length > 1)
        return fromStopPoints;
    const links = Array.isArray(route?.route_links)
        ? [...route.route_links].sort((a, b) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
        : [];
    const routePath = [];
    for (const link of links) {
        const from = Number(link?.from);
        const to = Number(link?.to);
        if (!Number.isFinite(from) || !Number.isFinite(to))
            continue;
        if (routePath.length === 0)
            routePath.push(from);
        if (routePath[routePath.length - 1] !== to)
            routePath.push(to);
    }
    return routePath;
}
function inferVehicleStatus(vehicle, ageSec, speed, now, hasLine) {
    const nextStops = Array.isArray(vehicle.next_stop_points) ? vehicle.next_stop_points : [];
    const firstNextStop = nextStops[0];
    const plannedMs = firstNextStop?.planned_departure_time
        ? new Date(String(firstNextStop.planned_departure_time).replace(' ', 'T')).getTime()
        : Number.NaN;
    const lastStopNumber = Number(vehicle.position?.last_stop_point_number);
    const lastStopDistance = Number(vehicle.position?.last_stop_point_distance);
    const isAtTripStart = lastStopNumber === 0 && (lastStopDistance === 0 || Number.isNaN(lastStopDistance));
    const waitMs = plannedMs - now;
    if (!hasLine) {
        return {
            status: 'inactive',
            statusText: ageSec > 90 ? 'Ukryty pojazd z ostatnia pozycja' : 'Ukryty pojazd bez linii',
        };
    }
    if (vehicle.journey?.route?.is_technical) {
        return { status: 'technical', statusText: 'Przejazd techniczny' };
    }
    if (isAtTripStart && Number.isFinite(waitMs) && waitMs > 120000 && speed <= 5) {
        const plannedClock = new Date(plannedMs).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        return {
            status: 'break',
            statusText: `Przerwa do ${plannedClock}`,
        };
    }
    if (speed <= 1 && nextStops.length === 0) {
        return { status: 'inactive', statusText: 'Postoj po kursie' };
    }
    if (speed <= 1) {
        return { status: 'active', statusText: 'Postoj na trasie' };
    }
    return { status: 'active', statusText: 'W trasie' };
}
function inBoundingBox(lat, lng, bbox) {
    if (!bbox)
        return true;
    const [south, west, north, east] = bbox;
    return lat >= south && lat <= north && lng >= west && lng <= east;
}
function normalizeVehicleId(rawVehicleId) {
    return String(rawVehicleId ?? '').trim() || 'unknown';
}
function toCleanLine(value) {
    const raw = String(value || '').trim();
    return raw || '?';
}
function getMpkStatusText(status, speed) {
    if (status === '2')
        return 'Postoj na przystanku';
    if (status === '3' || status === '6' || status === '7' || status === '10')
        return 'Postoj na petli';
    if (speed <= 1)
        return 'Postoj na trasie';
    return 'W trasie';
}
function isMpkBreakStatus(status) {
    return status === '3' || status === '6' || status === '7' || status === '10';
}
function isMpkWaitingStatus(status) {
    return status === '2' || isMpkBreakStatus(status);
}
function getEffectiveMpkDelay(rawDelay, status) {
    if (!Number.isFinite(rawDelay) || Math.abs(rawDelay) > 18000)
        return 0;
    return isMpkWaitingStatus(status) ? 0 : rawDelay;
}
function toTransportVehicle(rawVehicle, now, includeInactive, stopsDictionary, details) {
    const lat = Number(rawVehicle.y);
    const lng = Number(rawVehicle.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    const rawVehicleNumber = normalizeVehicleId(rawVehicle.nb || rawVehicle.id);
    const line = toCleanLine(rawVehicle.nr || rawVehicle.nnr || details?.nr);
    const hasLine = line !== '?';
    const secondsFromSignal = Number(rawVehicle.is || 0);
    const ageSec = Number.isFinite(secondsFromSignal) ? Math.max(0, secondsFromSignal) : 0;
    if (!includeInactive && !hasLine)
        return null;
    if (ageSec > 30 * 60)
        return null;
    const previousLat = Number(rawVehicle.py);
    const previousLng = Number(rawVehicle.px);
    const movedDistance = Number.isFinite(previousLat) && Number.isFinite(previousLng)
        ? Math.hypot(lat - previousLat, lng - previousLng)
        : 0;
    const speed = movedDistance > 0 ? Math.min(55, Math.round(movedDistance * 100000)) : 0;
    const statusCode = String(rawVehicle.s || details?.status || '');
    const statusText = getMpkStatusText(statusCode, speed);
    const direction = String(rawVehicle.op || details?.op || rawVehicle.nop || '').trim() || (speed > 3 ? 'W trasie' : 'Postoj');
    const delaySeconds = getEffectiveMpkDelay(Number(rawVehicle.o ?? details?.delay ?? 0), statusCode);
    const prefixedId = `mpk_rzeszow_${rawVehicleNumber}`;
    const nextStopId = Number(rawVehicle.nk || details?.end_stop_id);
    const nextStopName = String(rawVehicle.nop || details?.end_stop_name || '').trim() ||
        stopsDictionary[String(nextStopId)] ||
        (Number.isFinite(nextStopId) ? `Przystanek ${nextStopId}` : '');
    return {
        id: prefixedId,
        provider: 'mpk_rzeszow',
        operatorName: 'MPK Rzeszów',
        type: 'bus',
        iconVariant: 'mpk_rzeszow',
        vehicleNumber: rawVehicleNumber,
        line,
        displayName: line,
        name: `MPK ${line !== '?' ? line : rawVehicleNumber}`,
        routeId: line !== '?' ? line : undefined,
        lat,
        lng,
        bearing: undefined,
        speed,
        direction,
        delaySeconds,
        delayMinutes: Math.round(delaySeconds / 60),
        dataAgeSec: ageSec,
        schedule: Number.isFinite(nextStopId) && nextStopName
            ? [{
                    id: nextStopId,
                    name: nextStopName,
                    planned: null,
                    real: null,
                }]
            : [],
        routePath: [],
        model: details?.bus,
        lastStopDistance: Number.isFinite(Number(rawVehicle.dp)) ? Number(rawVehicle.dp) : undefined,
        lastStopId: Number.isFinite(Number(rawVehicle.ik)) ? Number(rawVehicle.ik) : undefined,
        lastUpdate: new Date(now - ageSec * 1000).toISOString(),
        journeyId: details?.rawBrygada ?? rawVehicle.kwi?.trim() ?? undefined,
        serviceId: rawVehicle.kwi?.trim() || details?.brygada,
        tripId: details?.trip_id ?? rawVehicle.ik ?? undefined,
        brigadeName: rawVehicle.kwi?.trim() || details?.brygada,
        status: isMpkBreakStatus(statusCode) ? 'break' : 'active',
        statusText,
    };
}
function parseLookupVehicleId(vehicleId) {
    const raw = String(vehicleId || '').trim();
    if (!raw)
        return '';
    return raw.startsWith('mpk_rzeszow_') ? raw.slice('mpk_rzeszow_'.length) : raw;
}
exports.mpkRzeszowProvider = {
    id: 'mpk_rzeszow',
    operatorName: 'MPK Rzeszów',
    implemented: true,
    async getVehicles(options) {
        const [{ value: rawVehicles, cache }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
            loadRawVehicles(),
            loadStopsDictionary(),
            loadVehicleDetails(),
        ]);
        const now = Date.now();
        const detailsByVehicle = new Map(vehicleDetails.map((detail) => [normalizeVehicleId(detail?.nb), detail]));
        const vehicles = rawVehicles
            .map((rawVehicle) => toTransportVehicle(rawVehicle, now, options.includeInactive, stopsDictionary, detailsByVehicle.get(normalizeVehicleId(rawVehicle.nb || rawVehicle.id))))
            .filter((vehicle) => Boolean(vehicle))
            .filter((vehicle) => inBoundingBox(vehicle.lat, vehicle.lng, options.bbox));
        return { vehicles, cache };
    },
    async getVehicleDetails(vehicleId, options) {
        const lookupVehicleId = parseLookupVehicleId(vehicleId);
        const [{ value: rawVehicles }, { value: stopsDictionary }, { value: vehicleDetails }] = await Promise.all([
            loadRawVehicles(),
            loadStopsDictionary(),
            loadVehicleDetails(),
        ]);
        const rawVehicle = rawVehicles.find((candidate) => normalizeVehicleId(candidate?.nb || candidate?.id) === lookupVehicleId);
        if (!rawVehicle)
            return null;
        const detail = vehicleDetails.find((candidate) => normalizeVehicleId(candidate?.nb) === lookupVehicleId);
        return toTransportVehicle(rawVehicle, Date.now(), options?.includeInactive ?? true, stopsDictionary, detail);
    },
};
