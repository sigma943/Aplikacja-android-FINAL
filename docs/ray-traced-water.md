# One-bounce reflections, volumetric scattering and dispersive wave packets

The later material and smooth depth-surface revision is documented in
[`photographic-landscape.md`](photographic-landscape.md).

This extends the existing renderer; it is not hardware ray tracing or full-scene
path tracing. WebGL2 runs GLSL ray queries against a controlled 2.5D proxy of the
existing illustration. No new engine, context, theme, orbit or React UI is added.

## Geometry and tracing

`scripts/prepare-scene-depth.py` generates `scene-depth.png` from the production
terrain alpha and the existing camera calibration. RG encodes 16-bit radial
distance, B occluder coverage, A opaque. The distant mountain shell is 110 relative
units away; foreground banks/canopies use a raised plane 0.96 units above water.
These explicit assumptions are artistic depth proxies, NOT recovered tree heights
or surveyed 3D terrain. Sky/river holes contain no occluder. No random geometry.

Each high/medium water pixel reflects the view ray using its dynamic wave normal.
It takes up to 12/6 logarithmic steps, refines the first depth crossing four times,
and rejects uncertain thick crossings. A hit samples the illuminated terrain at
the intersection, giving finite-depth parallax in reflections. A miss falls back
to sky/cloud radiance. Offscreen geometry is unavailable. Low quality and missing
depth assets skip tracing while preserving live waves, GGX lights and the theme.

The quarter-resolution light target integrates single scattering through a
height-dependent fog. Beer-Lambert extinction, Henyey-Greenstein phase, 12/6 view
samples, 4/2 shadow probes and a projected cloud layer produce directional beams.
Marching stops at the visible proxy surface. These are volumetric integration
and software depth queries, replacing the former 2D radial accumulation. Geometry
and cloud depths are approximate; this does not reproduce multiple scattering.

## Water motion and light

The existing spectrum now forms dispersive packets: envelope group velocity is
half the carrier phase velocity, with lateral variation and analytic derivatives
of both amplitude and phase. There is no randomized brightness mask. Resolved
components are 20/16/12; omitted spatial/temporal slopes still broaden GGX to
limit aliasing. Large waves stay low in height, crosswind energy breaks parallel
ribbons, and a 0.65 display time scale makes calm motion easier to follow.

GGX/Smith/Schlick still determine direct Sun/Moon reflections. Fixed finite-disc
quadrature (4/2/1 samples) softens tiny highlights without stochastic fireflies.
Golden-hour irradiance, continuous warmth and restrained bright-only bloom have
been tuned toward the supplied sunset reference. No reflected Sun is shown behind
the mountain horizon; Moon illumination/visibility still come from the existing
ephemeris. Colours/exposure are artistic relative radiance, not calibrated lux.

## Budget and verification

The same three draw calls, GPU context, target sizes and 30/24/15 FPS policy are
retained. The new depth atlas uploads once, with explicit texture-unit tracking;
it is released/rebuilt with all other resources. Low mode skips scene rays and
volume integration. No history buffer or accumulation ghosting is introduced.

Node tests validate proxy bounds/coverage/height alongside existing registration.
Mesa GLES3 compiles all three programs, verifies reflected-image changes when
tracing is disabled, checks stable aggregate brightness across consecutive frames,
and retains masking, solar movement, moon phase and six astronomical cases.
Browser CI checks context loss/restore, fallback, lifecycle and real UI. Visual
previews and motion recordings must be reviewed before accepting the revision.
Physical POCO F8 Pro GPU time, thermal behaviour and battery use remain unmeasured.
