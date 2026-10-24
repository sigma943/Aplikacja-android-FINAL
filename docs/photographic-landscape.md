# Photographic material and lighting revision

The user's real phone screenshot showed a nearly uniform rust-coloured river at
twilight. The water shader had incorrectly mixed a warm red BODY colour into the
surface even when direct solar light had vanished. This revision removes that
emissive-looking fill: warm colour comes from reflected sky and visible lights;
the absorbing water body stays blue-black. A native GLES pixel regression checks
unlit, low-quality, near-foreground twilight water specifically.

## Artwork and registration

Built-in imagegen created a more photographic terrain cutout using the supplied
day/twilight reference frames. Production `terrain.webp` is 850x1850, registered
240 pixels downward against the unchanged astronomical camera. It has transparent
sky and water, detailed fir silhouettes, broader river turns and foreground
foliage. All water/shore/depth masks and the mountain horizon were regenerated
from its actual alpha. The original camera, ephemeris and theme identity remain.

`prepare-terrain-normal.py` reconstructs relative world positions from the existing
controlled depth proxy, differentiates that surface and adds restrained material
bump from image luminance. It writes opaque world-space `terrain-normal.png`.
This is an explicit approximate camera-facing depth surface, not photogrammetry
or a complete 3D scene recovered from a single image. No hidden terrain or accurate
tree geometry is inferred. The source artwork also contains baked soft shading.

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

Validation includes TypeScript, lint of changed modules, mask/normal/depth tests,
native GLSL compilation and water pixels, browser lifecycle/material-cache checks,
web compilation and the signed Android quick build. The known local keytool issue
and unrelated global lint errors must be reported separately from these checks.

The exact image-generation prompt is recorded in `photographic-terrain-prompt.txt`.
