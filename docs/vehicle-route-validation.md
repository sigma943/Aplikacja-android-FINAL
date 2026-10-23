# Vehicle route validation

The vehicle map prefers bundled operator shapes. Inferred road routes use a
separate 60 m stop-coverage limit and a 60 m interior snap radius; the broader
180 m compatibility check for older GTFS coordinates is unchanged. Distance
alone still cannot identify a lane or prove the operator's actual streets.

Shortening an inferred route must preserve its existing stop access: a
candidate may increase a stop's distance by at most 5 m and must stay within
15 m of every stop. Real side-road visits and repeated-stop return legs remain.

Chunk joins allow at most 1 m of encoding noise. Larger discrepancies trigger
the existing rebuild using one router. If the rebuilt geometry is still
disconnected, it is rejected instead of drawing an invented connector.

The car backup still starts after 1 second. Once it is ready, a validated bus
response has a bounded 8-second preference window. Primary requests themselves
have an 8-second deadline; a primary failure releases a ready backup immediately.
This can increase initial loading time when the bus router is slow.

Persisted map geometry distinguishes course variants; identical inferred road
requests still share in-flight work and chunk caches. Cache version
`road-v15-course-validated-roads` invalidates older geometries. A known operator
course with incompatible stop order cannot borrow another course's reversed
shape. Coordinate discovery remains available for unknown course IDs.

Regression command (also included in quick APK builds):

```sh
node --test test/road-route-fallback.test.cjs test/official-route-live-pattern.test.cjs test/vehicle-route-validation.test.cjs test/road-route-quality.test.cjs test/preferred-route.test.cjs test/route-cache-performance.test.cjs test/bus-routes.test.cjs test/pks-202-route.test.cjs test/pks-312-route.test.cjs test/marcel-road-routing.test.cjs
```

These 48 tests include recorded PKS 202, 251, 301, 312 and 314 routes, the Marcel
Jasło–Rzeszów chunk reconstruction, official source priority, parallel streets,
real side-road visits, disconnected chunks, bus/car response ordering and
course-specific cache isolation. Routing HTTP responses are fixtures/mocks;
this does not constitute a live road-network or physical Android-device test.
