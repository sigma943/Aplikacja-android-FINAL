# Horyzont: cinematic HDR and glass

Based on successful APK build 592, commit `67e8d291`, rather than `main`.

- Five-level RGBA16F bloom pyramid at High: masked soft-knee extraction,
  normalized 13-tap reduction and 9-tap tent reconstruction. Bloom is added
  before the existing hue-preserving tone map; UI text is outside this pipeline.
- High targets 60 FPS, up to 2.4M water pixels and 3.6M presentation pixels,
  with 24 analytic waves and a denser mesh. Crosswind capillary waves break
  the parallel silver bands. More resolved surface detail and a narrower
  solar lobe produce discrete moving facets; sky and planar reflections remain.
- HDR remains enabled in every profile when float render targets work. A missing
  float extension retains LDR; missing WebGL2 retains the static fallback.
- High-performance GPU hint and a quality-first default replace automatic
  downgrading after timer or frame-rate spikes. Explicit reduced motion,
  light effects, native power-saving cadence, severe thermal suspension,
  background suspension and context restoration still work. 60 FPS is a target,
  not a physical POCO F8 Pro measurement.
- The original milk panel material, navigation and Horyzont preset are restored
  after device feedback. Fullscreen journey maps now portal to the document body
  and have opaque chrome in every theme; landscape tint cannot expose the dock.
- Horyzont-only options persist quality, bloom, light reflections, radial rays,
  wave speed and water exposure. Changes reach the active renderer immediately.
- Solar lens glare is anchored to the existing disc beneath clouds and terrain.
  Astronomical rise/set timing, transport logic and source artwork are retained.

The bloom targets are allocated on size/profile changes, released on suspend,
and rebuilt after context loss. There is no per-frame pixel readback. At High,
ordinary frames have 12 draws (water, shafts, nine bloom passes, presentation);
a cached material/mirror refresh adds three. The pyramid is normalized so
increasing the number of levels does not amplify a constant bright field.

Local checks: TypeScript, changed-module lint, production Android web build,
53 focused unit tests, real Mesa GLES shader compile/link and water pixels,
synthetic HDR bloom pixels (wide halo, hue, alpha masking, constant-field
energy, finite floats), and an integrated GLES rendering of water/material/
shafts/bloom/presentation with the proxy reflection path. The full unit suite
passes 650/651 tests; the remaining APK-signing test cannot load the local Java
`libjli.so`. Native APK generation uses the existing signed quick-build workflow. Chrome cannot start in the restricted local container;
browser screenshots and actual WebGL2 lifecycle checks are prepared for GitHub
Actions but have not yet run for this change.
No physical Android frame-rate, heat, battery or visual identity claim is made.
