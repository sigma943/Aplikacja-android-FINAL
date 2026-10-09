# Clock and timetable performance

The optimization keeps the UI, API intervals, GPS animation and background/foreground refresh behavior unchanged. Clock ticks still update countdowns and remove passed stops. Live departure matching still runs on each map-sheet tick because Marcel's cached position estimates can change independently of the vehicle array.

Changes:

- Reuse fixed-timezone date formatters instead of creating one for each calendar comparison. Calculate today's Warsaw date once per map-sheet transformation.
- Prepare a selected vehicle's corrected stop timestamps when its schedule, delay, status or provider changes; filter upcoming stops on every clock tick.
- Generate route timestamps directly from the shared timing calculation, without creating unused departure labels and carrier objects.
- Keep Leaflet polyline option references stable until their actual values change. React Leaflet's path hook calls `setStyle` when the options reference changes, triggering otherwise redundant Canvas redraws.

## Reproduction

Run `node scripts/benchmark-time-rendering.cjs`. To compare an older checkout using the same harness, pass its directory as the first argument. Both checkouts need their dependencies installed. Each workload is warmed once and reports the median of five runs; module loading is excluded.

An initial Node benchmark in the development environment compared the widget-personalization baseline `c9505f7` with this change:

| Workload | Before | After |
| --- | ---: | ---: |
| 2,000 Warsaw calendar conversions | 80.92 ms | 6.82 ms |
| 100 preparations of a 120-stop route | 22.17 ms | 20.73 ms |
| 60 map clock ticks with 120 departures | 198.28 ms | 15.35 ms |

These are isolated CPU workloads, not app startup times or Android battery measurements. The route preparation workload deliberately calls the function every time; it does not include the additional saving from React reusing unchanged prepared stops. Network latency is unchanged.

Regression tests cover all providers, delay bounds, inactive/break states, schedule fallbacks, Warsaw midnight, daylight-saving transitions, year boundaries, countdown precision and stop-board expiration. The MPK browser test verifies that a live break countdown keeps advancing without repainting its unchanged route.
