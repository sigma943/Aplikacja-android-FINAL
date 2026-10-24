# Water surface and scene lighting

This revision replaces the earlier reflection corridor, crest sparkle mask, CSS
solar glows and Canvas ray wedges. Existing terrain/cloud images, astronomy,
trajectory, theme selection, React layout and transport functions are retained.

## Controlled geometry

`landscape-water-calibration.json` defines an approximate local water camera.
It is not a claim to recover survey-quality 3D from a photograph. The original
260-degree astronomical panorama supplies projected screen positions; those
positions are calibrated into a narrower 78-degree water-camera frame so that
light and viewing directions agree on screen. Vertical elevation and the
existing horizon remain aligned. Relative camera height is 8 units.

`prepare-water-geometry.py` generates two small, committed opaque PNG atlases:

- `water-uv.png`: two halves packing signed world X/Z coordinates at 16 bits.
  It decodes once to an RG32F texture. The vertex shader bilinearly reconstructs
  the plane from this map. Microfacet evaluation uses its analytic inverse to
  avoid interpolation artifacts between triangles.
- `water-perspective.png`: relative observer distance, bank-distance damping,
  and a conservative shore-proximity ambient-occlusion estimate. This is not a
  fabricated tree-height field or a full 3D shadow map.

The unchanged high-resolution water mask clips every water pass, including
bloom. It contains the banks, islands and trees. The existing horizon lookup
removes direct solar/lunar light behind mountains; the drifting cloud alpha
controls transmission. These are controlled 2.5D occlusion approximations.

## Displaced surface and BRDF

The water pass draws an indexed mesh (96x128 / 64x96 / 48x64 cells). Three large
Gerstner waves displace vertices horizontally and vertically. A deterministic
24-component, multiscale directional spectrum supplies analytic tangents and
normals; medium/low evaluate fewer resolved components. Dispersion follows
omega=sqrt(g*k). Transverse sidebands form curved wave groups; their derivatives
are included in the normal. This is a Gerstner approximation, not a fluid solver.

Specular reflection comes solely from the view vector, projected directional
light, wave normal and GGX distribution/Smith correlated visibility. Water IOR
is represented by Fresnel-Schlick F0=0.02037. There is no river-centre light
corridor, noise-based brightness mask, moving reflection texture or crest glow.
Unresolved spatial and temporal wave energy increases effective roughness;
subpixel carriers are filtered instead of producing unstable glints.

Sky/terrain reflection is evaluated along reflect(-V,N). Atmospheric colours,
source colour, occlusion and lunar phase all consume the existing interpolated
lighting state. Radiance and exposure use relative artistic units, not measured
lux or a spectrally calibrated camera.

## HDR, bloom and rays

One WebGL2 context executes three draw calls:

1. Water mesh into RGBA16F when EXT_color_buffer_float is available and the FBO
   is complete. Low quality / unsupported hardware uses an RGBA8 fallback.
2. Quarter-size light pass: a nine-tap bright-only bloom kernel and 4/6/8 sample
   screen-space radial scattering, with terrain/cloud occlusion. Bloom is
   disabled in low quality. No full-resolution blur chain is allocated.
3. ACES fitted filmic mapping and display gamma, with bloom masked back to water
   and rays clipped behind opaque terrain. The LDR fallback is tone-mapped only
   once and has a separate reduced bloom threshold.

These are screen-space god rays, not true 3D volumetric ray tracing. They are
part of the scene below the existing React UI, so translucent cards transmit
that scene through their existing material. CSS solar gradient overlays are no
longer used. Existing user-selected appearance patterns/glows are untouched.
`backdrop-filter` remains a blur, not a physical refraction model.

## Performance and lifecycle

The directly presented GPU canvas remains in place; no per-frame GPU-to-2D copy
was reintroduced. Background scenery is cached at up to 8 Hz; existing sheet
snapshots are throttled. Quality targets are 30/24/15 FPS, with 15 FPS saver mode
at the low pixel budget. Water targets retain 360k/210k/110k whole-frame pixel
caps. Static textures and indexed meshes upload at initialization / quality
changes, not per frame. No wave animation updates React state.

EXT_disjoint_timer_query_webgl2 is sampled asynchronously when available; its
GPU time participates in quality reduction. Unsupported timers report null.
Disjoint results are ignored. FBOs, targets, buffers, programs and timer queries
are deleted on suspend/unmount and rebuilt after context restoration.
Reduced motion and native visibility/thermal policies remain active.

## Validation and limits

Node tests validate map ownership/hash, subpixel reprojection, depth ordering,
shore damping, shared astronomy and quality policy. Native Mesa EGL compiles all
three shader programs and checks moving water, exact masking, source movement,
new/below-horizon Moon and six actual ephemeris states. Browser tests exercise
HDR energy, low-quality LDR, context loss/restore, visible lunar reflection,
UI readability/lifecycle and real-time animation capture.

CI exports scene/UI screenshots and a short WebM. Compare sunset glint density,
shape, colour, shimmer and contrast against the attached reference before
accepting visual quality. The terrain is the original illustration; camera
geometry, screen-space occlusion and lighting remain approximations. Physical
Android GPU memory, temperature and battery measurements require an actual
device and are not inferred from headless Chrome timings.

Implementation references (primary):
- https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models
- https://google.github.io/filament/Filament.html
- https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/
