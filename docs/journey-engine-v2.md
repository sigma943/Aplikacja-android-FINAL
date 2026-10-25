# Journey engine v2

## Search contract and normalized data

All adapters produce `journey-model.Connection`: physical calls, provider-scoped
course identity, service date, boarding/alighting permissions and original source
stop IDs. A shared display line does not establish course identity. Packaged
feeds pass through `normalizeJourneyFeed`; malformed complete courses and
conflicting trip IDs are excluded with diagnostics, without inventing connections
over missing calls. Both retained real feeds preserve every valid trip.

The walking preference remains a limit on each uninterrupted access, interchange
or egress. It is not the sum for the whole journey. The loader applies the existing
bounded preference allowance once. The independent exhaustive oracle now uses
this same public rule; it does not use the production scan or dominance logic.

New timetable exports retain the original GTFS `stop_sequence` as an optional
sixth pattern field. Old bundled feeds remain readable. A positional array index
is never treated as a GTFS sequence number; a sequence-only update is ignored if
the original sequence is unavailable.

## Indexed chronological search

The core remains a multi-criteria chronological scan, with:

- one immutable prepared network, integer stop references, ordered connections
  and provider-scoped course keys;
- compact predecessor states instead of copied complete journeys and call lists;
- reconstruction of display legs only for destination answers;
- a ready-platform frontier: after both arrivals meet the current departure's
  transfer buffer, earlier arrival no longer improves future boarding feasibility;
  walking, transfers and departure still participate in dominance;
- zero-duration cluster closure, no-pickup/no-dropoff continuation, full-day and
  arrive-by searches, with no arbitrary transfer-count cap in unlimited mode.

This retains the existing public search API. `journey-ranking` handles practical
alternatives separately. Comfort only breaks ties after the requested objective
and arrival/departure; transfer slack is recorded, and verified walking costs are
also used by interchange optimization. Course identity includes the provider in
search, deduplication and stable expanded-result selection.

One worker survives all pedestrian refinement rounds for a query. Subsequent
messages only replace its walking graph; the same timetable/real-time snapshot
and prepared network are reused. Cancellation or completion terminates it. The
existing main-thread fallback remains available if Worker creation fails.

## Routed walking graph

Candidate discovery uses straight-line distance as an optimistic lower bound,
not the old inflated distance. Relevant candidate walks are checked through the
existing pedestrian routing service and the timetable is searched again with
real distances and durations. This can discover the next feasible bus after a
crossing proves too long, and can discover short real walks previously excluded
by the 1.35 multiplier.

Refinement is bounded to three rounds, 24 requested pairs and a 12-second routing
budget per query, with three concurrent pair requests. This is an on-demand graph
of routed pairs, not a complete offline OSM pedestrian graph. Unverified paths
remain explicitly marked estimates, with a warning; a missing router response
does not certify a crossing. Preliminary local results also disclose pending
pedestrian verification.

Verified geometry is checked for endpoint coverage, plausible distance and
coordinates. Its cache is keyed by both physical endpoints, expires after seven
days and retains at most 200 pairs in local storage. Moving a stop invalidates
its pair identity. Confirmed paths are reusable offline; arbitrary unvisited
paths are not claimed to be verified. Accessibility attributes and a wheelchair
profile are not inferred from ordinary pedestrian routing.

## Explicit real-time events

`JourneyTripUpdate` can cancel a trip, skip a call, replace a platform, or update
individual arrival/departure predictions. Updates must match provider, exact trip
and service date and be fresh. Newer observations supersede older observations;
equal-time conflicts are ignored. Repeated stop IDs require original sequence
identity. A platform replacement must be a valid nearby coordinate, and a
platform-only change retains an existing delay. Input schedules are not mutated.

The search accepts supplemental `tripUpdates` and optional explicit
`Vehicle.journeyUpdate` records. Existing provider feeds do not necessarily
publish these events; this implementation does not manufacture cancellations
from absent GPS. In their absence, existing exact-course live delays and static
schedule fallback continue. Probability of catching a connection is not invented
without historical delay data.

## Evidence and limits

`journey-reliability.test.cjs` compares 720 synthetic combinations and 180 searches
with routed walking costs against exhaustive whole-course enumeration. Other
regressions cover actual PKS/MPK feeds, Marcel integration, calendar exceptions,
midnight/DST, permissions, zero-time cycles, cancellation, persistence, invalid
crossings, replacements, source integrity and unchanged input objects.

`journey-engine-browser.cjs` runs the real worker and routing-refinement pipeline
with deterministic intercepted pedestrian responses, checks worker reuse,
replacement of an impossible transfer, persistence across reload and cancellation.
It runs in quick APK builds, alongside the existing journey/browser regressions.

Measurements against commit `34f13aa` are in `journey-engine-comparison.json`.
Each case has three sequential runs in an isolated child on the same machine,
using identical feed hashes. Median raw search times:

| Case | Previous engine | New engine |
| --- | ---: | ---: |
| Regional direct | 75 ms | 49 ms |
| Mixed carrier | 1056 ms | 105 ms |
| Full network, at most two transfers | 5291 ms | 1142 ms |
| Full network, unlimited transfers | Three-run child exceeded 45 s | 1071 ms |

These are raw search measurements, not end-to-end phone latency. HTTP, source
loading and pedestrian routing are excluded. The first direct-query run was
87 ms previously and 163 ms in the new engine; preparation/cache effects matter.
All completed comparisons retained or improved the earliest arrival; the full
network cases return 23 useful alternatives. No speed ratio is inferred for an
unfinished baseline batch. This is not a claim of Google Maps equivalence or a
physical Android performance test.
