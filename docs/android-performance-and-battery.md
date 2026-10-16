# Android performance and background work

Baseline: latest successful original APK build #359, commit
`cb6b94d9d1a0b60b836eb333a749f5e03c7b3778`. Changes are isolated in
`perf/android-startup-and-rendering`, PR #30.

## Changes

- Only tick Home's seconds clock when an open map sheet needs it. Keep map
  component/callback references stable and retain unchanged vehicle objects.
- Pause hidden map rendering behind the opaque cosmic background. Continue
  warming route/vehicle caches needed by departures. Glass themes keep their map.
- Load optional panels separately; delay their prewarming until initial data has
  loaded. Open the complete Options sheet atomically. The map stop sheet remains
  eagerly loaded so tapping a marker still opens it immediately.
- Persist route geometry asynchronously with IndexedDB; retain bounded memory
  caching and the existing localStorage fallback when IndexedDB is unavailable.
- Restore validated stop catalogs without rebuilding them. Build a platform name
  index during packaging using exactly the existing matcher and retain fallback.
- Skip repeated appearance CSS writes and unnecessary noncosmic DOM scans.
- Losslessly recompress provider PNGs during packaging. Verify decoded pixels,
  dimensions and ancillary chunks. Original artwork remains in the source tree.
- Enable Android release code/resource shrinking with explicit Capacitor/plugin,
  bridge and widget-resource keeps. Verify signed package/asset parity.
- Replace hidden recurring connectivity probes and vehicle poll wakeups with
  foreground-aware scheduling. Keep the configured foreground poll intervals,
  refresh on returning, and share only overlapping connectivity probes.
- Preserve 30-second presence writes in the background because the administrative
  online indicator depends on them. Permission, ban, security and runtime
  subscriptions stay connected; this is not a Firebase access/session bypass.
- Stop the registration retry timer after success. Restart it if the server
  deletes the device, retaining registration failure recovery and rank revocation.
- Pause scheduled appearance checks while hidden; apply on return, also offline.
  The headless widget data route skips visual providers. Widget data sources,
  refresh settings and native scheduling are unchanged.
- The initial rounded-clip mitigation did not resolve the artefact on the user's
  Android device. Preset thumbnails now use individual self-contained SVG images
  with literal palettes and the original geometry, replacing independently painted
  CSS row backgrounds and gradients. Custom card/control radii remain respected.
  Browser tests check actual icon pixels, palette independence and card padding.
- Menu tab changes use a 180 ms fade on a separate, pointer-transparent colour
  veil, keeping the existing map/list mounted and glass backdrop roots unchanged.
  Rapid navigation cancels the previous fade. App reduced-motion/light-effects
  settings and the current system reduced-motion preference disable transitions;
  enabling the system preference also cancels an in-progress fade.

## Verification

`npm test` covers scheduling, native/DOM visibility overlap, overlapping probes,
cache invalidation, complete platform lookup equivalence and feed reconciliation.
The browser suite exercises all eight presets under all eight active palettes,
scrolls each card, checks rendered background pixels and verifies selection/save.
It also covers maps, departure countdowns, admin/ban/access restoration and widgets.
Android CI checks Firestore rules, native unit tests, signed release, debug and
separate release-test packages.

The `Performance audit` workflow builds the original and candidate with the same
harness on one runner. It measures CPU workloads and medians of three fresh Chrome
sessions per version with 4x main-thread CPU throttling, complete PKS/MPK catalogs,
mocked feeds and a fixed 1800 ms restored-device delay. Reports include raw runs,
CPU profiles, startup bytes and a 35-second simulated-hidden scenario counting
connectivity probes, vehicle requests and presence writes, followed by resume.

This does not measure battery percentage, physical Android GPU rendering, radio
power, real server latency, device temperature or complete low-end-phone behavior.
Worker CPU is not independently throttled. Diagnostic results can vary and include
regressions; comparison reports retain those instead of imposing timing thresholds.
An actual Android/WebView device should confirm the reported compositor issue.
