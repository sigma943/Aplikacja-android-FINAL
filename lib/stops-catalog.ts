import {mpkPassengerStop} from './mpk-passenger-lines';
import {sanitizeBusStop,readBusCoordinates} from './bus-coordinates';
import {correctPksStop} from './pks-stop-corrections';
import {mergePhysicalStopAliases} from './physical-stop-aliases';
import type { Carrier, Stop } from '@/Panel/src/types';
import { getSimilarity } from '@/lib/rzeszow-stop-consolidation';
import { RawStop, PKS_CARRIER, MARCEL_CARRIER, MPK_CARRIER, MarcelIndexedStop, InternalStop, MERGED_STOPS_RUNTIME_CACHE, MERGED_STOPS_RUNTIME_CACHE_LIMIT, stopDisplayName, ensureMpkCityPrefix, preferredStopDisplayName, stopBaseNameKey, mergeTokens, numericTokens, nameSimilarityScore, sharedStopTokenCount, hasConflictingCityToken, mergeCsvValues, mergeDebugNames, distanceMeters, geoBucketKeys, normalizeStopMergeName, hasConflictingStopNumbers, mergeStopsByGpsAndName, mergeMpkStopsForList, canExposeStandaloneMarcelStop, isWeakMarcelName, sortedLines } from '@/components/stops-panel/stop-domain';
export function buildStopsCatalog(stops: RawStop[], mpkStops: Array<{id:string;name:string;lat?:number;lon?:number;lines:string[]}>,marcelStops:MarcelIndexedStop[],mergedStopsCacheKey:string,physicalPoints=false): Stop[] {
    const stableOrder=(a:{id:string},b:{id:string})=>String(a.id).localeCompare(String(b.id),'en',{numeric:true});
    stops = stops.map(stop => correctPksStop(sanitizeBusStop(stop), String(stop.id))).sort(stableOrder);
    mpkStops = mpkStops.map(mpkPassengerStop).map(sanitizeBusStop).sort(stableOrder);
    marcelStops = marcelStops.map(sanitizeBusStop).sort(stableOrder);
    const cacheKey = (physicalPoints ? 'physical:' : 'list:') + mergedStopsCacheKey;
    const cached = MERGED_STOPS_RUNTIME_CACHE.get(cacheKey);
    if (cached) return cached;

    // Both surfaces use one canonical identity pipeline. The map only chooses
    // the surveyed platform coordinate; it must never rebuild separate groups.
    if (physicalPoints) {
      const mpkById = new Map(mpkStops.map(stop => [stop.id, stop]));
      const canonical = buildStopsCatalog(stops, mpkStops, marcelStops, mergedStopsCacheKey);
      const points = canonical.map(stop => {
        const precise = String(stop.providerStopIds?.mpk_rzeszow || '').split(',')
          .map(id => mpkById.get(id.trim())).find(point => readBusCoordinates(point?.lat, point?.lon));
        return precise ? {...stop, lat: precise.lat, lon: precise.lon} : stop;
      });
      MERGED_STOPS_RUNTIME_CACHE.set(cacheKey, points);
      if (MERGED_STOPS_RUNTIME_CACHE.size > MERGED_STOPS_RUNTIME_CACHE_LIMIT) {
        const oldest = MERGED_STOPS_RUNTIME_CACHE.keys().next().value;
        if (oldest) MERGED_STOPS_RUNTIME_CACHE.delete(oldest);
      }
      return points;
    }

    // Provider coordinates can differ along the same numbered platform. Match
    // its full name/code, never just proximity (opposite directions stay apart).
    const platformKey = (name: string) => normalizeStopMergeName(name).split(' ')
      .map(token => /^\d+[a-z]?$/.test(token) ? token.replace(/^0+(?=\d)/, '') : token)
      .filter(Boolean).sort().join(' ');
    const sameNumberedPlatform = (a: string, b: string) =>
      /\b\d{1,3}[a-z]?$/.test(normalizeStopMergeName(a)) && platformKey(a) === platformKey(b);

    const byTechnical = new Map<string, InternalStop>();
    const platformBuckets = new Map<string, Set<InternalStop>>();
    const baseBuckets = new Map<string, InternalStop[]>();
    const tokenBuckets = new Map<string, Set<InternalStop>>();
    const geoBuckets = new Map<string, Set<InternalStop>>();
    const crossMatchCache = new Map<string, InternalStop | null>();

    const technicalKey = (provider: string, id: string) => `${provider}:${String(id).trim()}`;

    const registerBucket = (stop: InternalStop) => {
      const identity = platformKey(stop.name);
      const platforms = platformBuckets.get(identity) || new Set<InternalStop>();
      platforms.add(stop); platformBuckets.set(identity, platforms);
      const list = baseBuckets.get(stop.baseNameKey) || [];
      if (!list.includes(stop)) list.push(stop);
      baseBuckets.set(stop.baseNameKey, list);

      const textTokens = mergeTokens(stop.name);
      textTokens.forEach((token) => {
        const bucket = tokenBuckets.get(token) || new Set<InternalStop>();
        bucket.add(stop);
        tokenBuckets.set(token, bucket);
      });
      const numbers = numericTokens(stop.name);
      numbers.forEach((token) => {
        const bucket = tokenBuckets.get(`num:${token}`) || new Set<InternalStop>();
        bucket.add(stop);
        tokenBuckets.set(`num:${token}`, bucket);
      });
      geoBucketKeys(stop.lat, stop.lon).forEach((key) => {
        const bucket = geoBuckets.get(key) || new Set<InternalStop>();
        bucket.add(stop);
        geoBuckets.set(key, bucket);
      });
    };

    const attachProvider = (
      target: InternalStop,
      raw: {
        id: string;
        name: string;
        areaId?: string;
        code?: string;
        lat?: number;
        lon?: number;
        provider: string;
        carrier: Carrier;
      },
    ) => {
      target.providerStopIds = {
        ...(target.providerStopIds || {}),
        [raw.provider]: mergeCsvValues(target.providerStopIds?.[raw.provider], String(raw.id)),
        [`${raw.provider}Names`]: mergeDebugNames(target.providerStopIds?.[`${raw.provider}Names`], raw.name),
      };
      if (raw.provider === 'pks') {
        target.pksStopPoints = [...(target.pksStopPoints || []).filter((point) => point.id !== raw.id), { id: raw.id, areaId: raw.areaId, code: raw.code }];
        target.providerStopIds.pksAreaIds = mergeCsvValues(target.providerStopIds.pksAreaIds, raw.areaId);
        target.providerStopIds.pksCodes = mergeCsvValues(target.providerStopIds.pksCodes, raw.code);
      }
      target.sourceProviderIds = [...new Set([...(target.sourceProviderIds || []), raw.provider])];
      target.displayNamesByProvider = {
        ...(target.displayNamesByProvider || {}),
        [raw.provider]: target.displayNamesByProvider?.[raw.provider] || stopDisplayName(raw.name),
      };
      target.name = preferredStopDisplayName(target.displayNamesByProvider) || target.name;
      target.baseNameKey = stopBaseNameKey(target.name);
      registerBucket(target);
      target.carrierMap.set(raw.carrier.id, raw.carrier);
      if (target.lat === undefined && raw.lat !== undefined) target.lat = raw.lat;
      if (target.lon === undefined && raw.lon !== undefined) target.lon = raw.lon;
      if (!target.areaId && raw.areaId) target.areaId = raw.areaId;
      if (!target.code && raw.code) target.code = raw.code;
    };

    const createStop = (raw: {
      id: string;
      name: string;
      areaId?: string;
      code?: string;
      lat?: number;
      lon?: number;
      provider: string;
      carrier: Carrier;
    }) => {
      const displayName = stopDisplayName(raw.name);
      const baseNameKey = stopBaseNameKey(displayName);
      const publicId = raw.provider === 'pks' ? String(raw.id) : `${raw.provider}:${String(raw.id)}`;
      const next: InternalStop = {
        id: publicId,
        name: displayName,
        type: 'bus',
        carriers: [raw.carrier],
        carrierMap: new Map([[raw.carrier.id, raw.carrier]]),
        lines: [],
        lineSet: new Set<string>(),
        displayNamesByProvider: { [raw.provider]: displayName },
        isFavorite: false,
        areaId: raw.areaId,
        code: raw.code,
        lat: raw.lat,
        lon: raw.lon,
        sourceProviderIds: [raw.provider],
        providerStopIds: {
          [raw.provider]: String(raw.id),
          [`${raw.provider}Names`]: displayName,
          ...(raw.provider === 'pks' ? { pksAreaIds: String(raw.areaId || ''), pksCodes: String(raw.code || '') } : {}),
        },
        pksStopPoints: raw.provider === 'pks' ? [{ id: raw.id, areaId: raw.areaId, code: raw.code }] : [],
        baseNameKey,
      };
      byTechnical.set(technicalKey(raw.provider, raw.id), next);
      registerBucket(next);
      return next;
    };

    const ensureTechnicalStop = (raw: {
      id: string;
      name: string;
      areaId?: string;
      code?: string;
      lat?: number;
      lon?: number;
      provider: string;
      carrier: Carrier;
    }) => {
      const key = technicalKey(raw.provider, raw.id);
      const current = byTechnical.get(key);
      if (current) {
        attachProvider(current, raw);
        return current;
      }
      return createStop(raw);
    };

    const findSafeCrossProviderMatch = (
      raw: { name: string; lat?: number; lon?: number },
      candidateProviders = new Set(['pks', 'mpk_rzeszow']),
      exactIdentity = false,
    ) => {
      const baseNameKey = stopBaseNameKey(raw.name);
      if (!baseNameKey) return null;
      if (exactIdentity) {
        let best: InternalStop | null = null, bestDistance = Infinity;
        for (const candidate of platformBuckets.get(platformKey(raw.name)) || []) {
          if (!(candidate.sourceProviderIds || []).some(provider => candidateProviders.has(provider))) continue;
          if (platformKey(candidate.name) !== platformKey(raw.name)) continue;
          const distance = distanceMeters(raw.lat, raw.lon, candidate.lat, candidate.lon);
          if (distance <= (sameNumberedPlatform(raw.name, candidate.name) ? 40 : 8) && distance < bestDistance) {best = candidate; bestDistance = distance;}
        }
        return best;
      }
      const latKey = Number.isFinite(raw.lat) ? Number(raw.lat).toFixed(4) : 'x';
      const lonKey = Number.isFinite(raw.lon) ? Number(raw.lon).toFixed(4) : 'x';
      const providerKey = [...candidateProviders].sort().join('+');
      const cacheKey = `${providerKey}|${exactIdentity}|${normalizeStopMergeName(raw.name)}|${latKey}|${lonKey}`;
      // A same-provider lookup runs while its catalog is still growing. A miss
      // cannot be reused after another physical stop has been registered.
      if (!exactIdentity && crossMatchCache.has(cacheKey)) return crossMatchCache.get(cacheKey) || null;

      const localGpsSet = new Set<InternalStop>();
      geoBucketKeys(raw.lat, raw.lon).forEach((key) => {
        const bucket = geoBuckets.get(key);
        if (bucket) bucket.forEach((candidate) => localGpsSet.add(candidate));
      });
      const lexicalSet = new Set<InternalStop>();
      const rawTokens = mergeTokens(raw.name).slice(0, 4);
      rawTokens.forEach((token) => {
        const bucket = tokenBuckets.get(token);
        if (bucket) bucket.forEach((candidate) => lexicalSet.add(candidate));
      });
      const rawNumbers = numericTokens(raw.name);
      rawNumbers.forEach((token) => {
        const bucket = tokenBuckets.get(`num:${token}`);
        if (bucket) bucket.forEach((candidate) => lexicalSet.add(candidate));
      });
      const exactCandidates = (baseBuckets.get(baseNameKey) || []).filter((candidate) => {
        const providers = candidate.sourceProviderIds || [];
        return providers.some((provider) => candidateProviders.has(provider));
      });

      const candidateSet = new Set<InternalStop>([...localGpsSet, ...lexicalSet, ...exactCandidates]);
      const pool = [...candidateSet].filter((candidate) => {
        const providers = candidate.sourceProviderIds || [];
        return providers.some((provider) => candidateProviders.has(provider));
      });
      if (pool.length === 0) return null;

      const weakName = isWeakMarcelName(raw.name);
      let bestCandidate: InternalStop | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestScore = -1;

      for (const candidate of pool) {
        if (exactIdentity && platformKey(raw.name) !== platformKey(candidate.name)) continue;
        const distance = distanceMeters(raw.lat, raw.lon, candidate.lat, candidate.lon);
        const hasGeo = Number.isFinite(distance);
        // Reject a geographically impossible match before costly text scoring.
        if (hasGeo && distance > 550) continue;
        if (hasConflictingCityToken(raw.name, candidate.name)) continue;
        if (hasConflictingStopNumbers(raw.name, candidate.name)) continue;
        if (weakName && hasGeo && distance > 120) continue;
        const similarity = Math.max(nameSimilarityScore(raw.name, candidate.name), getSimilarity(raw.name, candidate.name));
        const sharedTokens = sharedStopTokenCount(raw.name, candidate.name);
        const exactBaseBoost = candidate.baseNameKey === baseNameKey ? 0.34 : 0;
        if (!hasGeo && candidate.baseNameKey !== baseNameKey && similarity < 0.92) continue;
        const distanceScore = hasGeo
          ? distance <= 35
            ? 1
            : distance <= 70
              ? 0.8
              : distance <= 140
                ? 0.56
                : distance <= 240
                  ? 0.2
                  : 0
          : 0;
        const gpsDominantBoost = hasGeo && sharedTokens > 0 && distance <= 35 ? 0.5 : 0;
        const score = similarity * 0.52 + distanceScore * 0.48 + exactBaseBoost + gpsDominantBoost;
        if (score > bestScore || (score === bestScore && distance < bestDistance)) {
          bestScore = score;
          bestDistance = distance;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) {
        crossMatchCache.set(cacheKey, null);
        return null;
      }

      const sharedTokens = sharedStopTokenCount(raw.name, bestCandidate.name);
      if (weakName) {
        const weakMatch = Number.isFinite(bestDistance) && bestDistance <= 90 ? bestCandidate : null;
        crossMatchCache.set(cacheKey, weakMatch);
        return weakMatch;
      }

      if (Number.isFinite(bestDistance) && bestDistance <= 35 && (sharedTokens > 0 || bestScore >= 0.35)) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (Number.isFinite(bestDistance) && bestScore >= 0.72 && bestDistance <= 70 && sharedTokens >= 2) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (Number.isFinite(bestDistance) && bestDistance <= 140 && getSimilarity(raw.name, bestCandidate.name) >= 0.78 && sharedTokens >= 1) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }
      if (!Number.isFinite(bestDistance) && (bestCandidate.baseNameKey === baseNameKey || getSimilarity(raw.name, bestCandidate.name) >= 0.92)) {
        crossMatchCache.set(cacheKey, bestCandidate);
        return bestCandidate;
      }

      crossMatchCache.set(cacheKey, null);
      return null;
    };

    const mergeMarcelMetadata = (target: InternalStop, routeIds: string[], matchKey: string, cityMatchKey?: string) => {
      target.providerStopIds = {
        ...(target.providerStopIds || {}),
        marcelRouteIds: mergeCsvValues(target.providerStopIds?.marcelRouteIds, routeIds.join(',')),
        marcelMatchKey: target.providerStopIds?.marcelMatchKey || matchKey,
        marcelMatchKeys: mergeCsvValues(target.providerStopIds?.marcelMatchKeys, matchKey),
        marcelCityMatchKeys: mergeCsvValues(target.providerStopIds?.marcelCityMatchKeys, cityMatchKey),
      };
    };

    stops.forEach((stop) => {
      const raw = {
        ...stop,
        id: String(stop.id),
        name: stopDisplayName(stop.name),
        provider: 'pks',
        carrier: PKS_CARRIER,
      };
      const matched = findSafeCrossProviderMatch(raw, new Set(['pks']), true);
      const pksStop = matched || ensureTechnicalStop(raw);
      if (matched) attachProvider(matched, raw);
      (stop.lines || []).forEach((line) => pksStop.lineSet.add(line));
    });

    mpkStops.forEach((mpkStop) => {
      const raw = {
        ...mpkStop,
        id: String(mpkStop.id),
        name: ensureMpkCityPrefix(mpkStop.name, mpkStop.lat, mpkStop.lon),
        provider: 'mpk_rzeszow',
        carrier: MPK_CARRIER,
      };
      const matched =
        findSafeCrossProviderMatch(raw, new Set(['pks'])) ||
        findSafeCrossProviderMatch(raw, new Set(['mpk_rzeszow']));
      const stop = matched ? matched : ensureTechnicalStop(raw);
      if (matched) {
        attachProvider(matched, raw);
      }
      mpkStop.lines.forEach((line) => stop.lineSet.add(line));
    });

    // Marcel and PKS sometimes number the same platform differently. Only a
    // unique surveyed neighbour with the full locality/landmark identity may
    // override a number conflict; city platforms and opposite sides stay apart.
    const findMarcelPlatformAlias = (raw: MarcelIndexedStop, name: string) => {
      const key = stopBaseNameKey(name);
      if (mergeTokens(name).length < 2) return null;
      const candidates = (baseBuckets.get(key) || []).filter(candidate =>
        candidate.sourceProviderIds?.some(provider => provider === 'pks' || provider === 'mpk_rzeszow') &&
        !hasConflictingCityToken(name, candidate.name) &&
        hasConflictingStopNumbers(name, candidate.name),
      ).map(stop => ({stop, distance: distanceMeters(raw.lat, raw.lon, stop.lat, stop.lon)}))
        .filter(candidate => candidate.distance <= 60).sort((a, b) => a.distance - b.distance);
      if (!candidates.length || candidates[0].distance > 25) return null;
      if (candidates[1] && candidates[1].distance - candidates[0].distance < 20) return null;
      return candidates[0].stop;
    };

    marcelStops.forEach((marcelStop) => {
      const displayName = stopDisplayName(marcelStop.name);
      const baseName = stopBaseNameKey(displayName);
      if (!baseName) return;
      const matched =
        findSafeCrossProviderMatch({ name: displayName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['pks'])) ||
        findSafeCrossProviderMatch({ name: marcelStop.matchName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['pks'])) ||
        findSafeCrossProviderMatch({ name: displayName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['mpk_rzeszow', 'marcel'])) ||
        findSafeCrossProviderMatch({ name: marcelStop.matchName, lat: marcelStop.lat, lon: marcelStop.lon }, new Set(['mpk_rzeszow', 'marcel'])) ||
        findMarcelPlatformAlias(marcelStop, displayName);
      if (matched) {
        attachProvider(matched, {
          ...marcelStop,
          id: String(marcelStop.id),
          name: displayName,
          provider: 'marcel',
          carrier: MARCEL_CARRIER,
        });
        matched.lineSet.add('M');
        mergeMarcelMetadata(matched, marcelStop.routeIds, marcelStop.matchKey || baseName, marcelStop.cityMatchKey);
        return;
      }
      if (isWeakMarcelName(displayName)) return;
      if (!canExposeStandaloneMarcelStop(displayName)) return;
      const marcelStandalone = ensureTechnicalStop({
        ...marcelStop,
        id: String(marcelStop.id),
        name: displayName,
        provider: 'marcel',
        carrier: MARCEL_CARRIER,
      });
      marcelStandalone.lineSet.add('M');
      mergeMarcelMetadata(marcelStandalone, marcelStop.routeIds, marcelStop.matchKey || baseName, marcelStop.cityMatchKey);
    });

    const normalizedStops = [...byTechnical.values()]
      .filter((stop) => stop.id && stop.name)
      .map((stop) => {
        const { lineSet, carrierMap, baseNameKey, displayNamesByProvider, ...cleanStop } = stop;
        return {
          ...cleanStop,
          carriers: [...carrierMap.values()].sort((left, right) => ['pks', 'mpk', 'marcel'].indexOf(left.id) - ['pks', 'mpk', 'marcel'].indexOf(right.id)),
          lines: sortedLines(lineSet),
          isFavorite: false,
        };
      });

    const mergedMpkStops = mergeMpkStopsForList(mergePhysicalStopAliases(normalizedStops));
    const mergedStops = mergeStopsByGpsAndName(mergedMpkStops).sort((left, right) => left.name.localeCompare(right.name, 'pl'));

    MERGED_STOPS_RUNTIME_CACHE.set(cacheKey, mergedStops);
    if (MERGED_STOPS_RUNTIME_CACHE.size > MERGED_STOPS_RUNTIME_CACHE_LIMIT) {
      const oldestKey = MERGED_STOPS_RUNTIME_CACHE.keys().next().value;
      if (oldestKey) MERGED_STOPS_RUNTIME_CACHE.delete(oldestKey);
    }
    return mergedStops;
}
