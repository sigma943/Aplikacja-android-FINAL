# Photographic material and lighting revision

The user's real phone screenshot showed a nearly uniform rust-coloured river at
twilight. The water shader had incorrectly mixed a warm red BODY colour into the
surface even when direct solar light had vanished. This revision removes that
emissive-looking fill: warm colour comes from reflected sky and visible lights;
the absorbing water body stays blue-black. A native GLES pixel regression checks
unlit, low-quality, near-foreground twilight water specifically.

## Artwork and registration

Built-in imagegen reconstructs a neutral full photographic source frame from the
references, then extracts terrain and thin cloud layers. The production layers
are 850x1850 without vertical cropping. The river covers about 18% of the frame,
with an open foreground and broad natural bends, rather than a small zigzag chain.
Sky, Sun/Moon and water are rendered dynamically; the source image's water is NOT
used as a reflected-light texture. Actual alpha controls all regenerated masks.

The fixed camera is now aligned southwest (0.75 radians west of south), with a
0.45 horizon and 0.65 vertical altitude span. This is a VIEW calibration: SunCalc
altitude/azimuth, events, lunar phase and continuous orbital calculations remain
unchanged. Screen positions consequently change to match the new valley. The complete
registered frame is shifted down by 6% of its height, placing the mountain skyline
around the reference's 43% screen height instead of 37%. This same frame transform
applies to terrain, clouds, water, rays and celestial bodies; it does not shift
only the visible Sun or its reflection. No Sun
is made to follow a hand-drawn river path. The same projection data controls sky,
water rays, occlusion and the terrain material. The Moon's decorative radius is
36 relative units; its phase/orientation stay astronomical.

The water UV atlas now uses opaque 24-bit RGB coordinate halves and a 1024-unit
extent so distant creek openings remain representable without losing foreground
precision. The terrain depth proxy retains its separate 128-unit packing range.
Assets use a versioned URL to avoid interpreting an older 16-bit cached UV image.
Cloud drift is reduced to four relative pixels per second, shared by the visible
clouds, light transmission and reflected cloud lookup. Preview clock jumps also
invalidate the cached background to keep clouds and water synchronized.

`prepare-terrain-normal.py` reconstructs relative world positions from the existing
controlled depth proxy, differentiates that surface and adds restrained material
bump from image luminance. It writes opaque world-space `terrain-normal.png`.
This is an explicit approximate camera-facing depth surface, not photogrammetry
or a complete 3D scene recovered from a single image. No hidden terrain or accurate
tree geometry is inferred. The source artwork also contains baked soft shading.
The far shell and raised near surface use a positive smooth-minimum depth join,
so the world normals do not jump along a horizontal shell/plane boundary.

## Natural wave direction

The medium and micro-wave bands use a directional wind spectrum with
spread and weaker crosswind components instead of an interference grid. Analytic crosswind phase
sidebands bend the wave crests; their derivatives are included in the surface
normal. Dispersion, packet envelopes, spatial/temporal filtering and the existing
GGX/Fresnel lighting remain shared across qualities and celestial sources.
Stronger independent packet/phase modulation breaks the long regular crests;
reduced direct-source exposure preserves more highlight shape and colour.
This removes the pronounced diamond/grid appearance without a reflection texture.

## Deferred terrain material

The existing WebGL2 context adds a cached terrain-lighting pass. It evaluates
world-space material normals, solar/lunar diffuse light, proxy shadow queries and
distance-dependent aerial perspective in linear colour, then ACES/display mapping.
The resulting high-resolution material buffer is reused. A relight occurs when
quantized lighting changes, normally at most once per second; large source/time
jumps update immediately. Three ordinary draws remain per animation frame; a
material refresh adds one draw. No new graphics engine or context is introduced.

Presentation resolution is now independent from the small water/light targets.
Low quality therefore reduces animated water cost without blurring all landscape
detail. Water budgets remain 360k/210k/80k pixels; presentation is bounded by the
existing background frame's 900k-pixel budget. A cached full-resolution terrain
target adds up to 3.6 MB, plus the normal atlas. Diagnostics distinguish water,
presentation and total target pixels. Buffers/textures are released on suspension
and rebuilt on context restoration. A failed HDR allocation is remembered rather
than retried every frame.

Cloud/fallback artwork tinting uses multiplicative lighting and reapplies the
original alpha. This retains material contrast and open sky/river holes instead
of flattening the image under a colour veil. The visible Sun has a feathered limb.
React cards, user opacity, schedules, maps and astronomical trajectories are not
replaced. PBR approximation and photographic assets do not guarantee pixel identity
with the reference or a measured POCO F8 Pro frame rate.

## Recording and validation

Development-only recording now reuses one capture canvas and copies the fresh
GPU frame from the existing animation task. It no longer allocates a new canvas
or rerenders all GPU passes for every encoder tick. This improves the validity of
the CI preview; it remains a software-renderer measurement, not a phone benchmark.

The FPS adaptation no longer waits for 20 expensive frames before reacting: two
slow sampled windows lower quality even when the GPU delivers only one frame
per second; sparse windows must not disable the fallback.
The sheet-spring browser test explicitly uses Low after the separate High
optical/recording checks; otherwise software GPU work can consume the entire
spring between requestAnimationFrame samples. The height progression and stable
canvas-size assertions remain required.

Validation includes TypeScript, lint of changed modules, mask/normal/depth tests,
native GLSL compilation and water pixels, browser lifecycle/material-cache checks,
web compilation and the signed Android quick build. The known local keytool issue
and unrelated global lint errors must be reported separately from these checks.

The original material prompt is in `photographic-terrain-prompt.txt`; the selected full-frame reconstruction and extraction prompts are in `hero-landscape-prompts.md`.
