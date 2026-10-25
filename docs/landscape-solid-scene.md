# Solid 3D landscape and planar reflections

This revision continues the last verified branch, commit 580f625, rather than
starting from main. Transport, map interactions, administrator logic, theme
selection and astronomical ephemerides are unchanged.

## Scene authoring

`landscape-scene-geometry.ts` builds a closed terrain volume with 25,026 vertices
and 50,048 triangles. It has river-bed elevations below the water plane, raised
banks, foothills, mountain ridges and descending back slopes. The river footprint
and skyline register the authoring to the selected photographic artwork. Hidden
geometry is explicitly sculpted by controlled functions, not claimed to have
been recovered accurately from one photograph. The closed underside and boundary
walls are checked for manifold edges and positive signed volume.

704 conifers use a shared mesh of four six-sided whorls and true three-dimensional
instance positions/scales. This is an instanced draw, not 704 renderers or React
components. Main-view photographic detail uses exact camera-registered albedo sampling and
area-weighted smooth vertex normals; the mirror uses world-projective materials.
The geometry fades into the retained soft photographic foreground, so blurred
leaves are not overwritten by hard-edged terrain/trees; the
foreground foliage and sky retain their existing artwork. The scene is authored
for the fixed panoramic camera, not for arbitrary close-up exploration. Unseen
materials and tree forms are approximations and need artistic refinement if a
free camera is introduced.

`node scripts/export-landscape-scene.cjs` exports the same terrain, conifer
instances and a river surface to `test/ui-previews/landscape-scene.glb`. The GLB
uses simple inspection materials; the application supplies the photographic
material, dynamic sky, Gerstner waves and lighting shaders. The GLB can be opened
in a 3D editor independently of the application.

## Shared renderer and mirror camera

The existing WebGL2 context owns the scene. A depth attachment is added to the
cached main material target and a bounded reflection target. The reflection pass
mirrors geometry about the Y=0 water plane, keeps the original material/light
coordinates, clips underwater geometry, and uses depth testing. Main-view material blending preserves the original coverage alpha,
so the additional 3D pass cannot grow opaque shore/leaf fringes. Consequently
near banks occlude distant slopes in the reflected view. Reflection colour is
linear radiance, HDR where the existing extension permits it.

The water shader projects its wave-reflected view ray into this mirror texture,
uses footprint/roughness-filtered mip levels, mixes missing/out-of-frame data
with atmospheric radiance, and applies the
existing Fresnel/GGX/ACES model. It no longer relies on screen-space depth hits
when the solid scene is available. Terrain, water and volumetric-light queries
share the authored heightfield with bilinear sampling and softened visibility
for direct-light shadow tests. Tree geometry is
present in the mirror; the inexpensive heightfield shadows approximate terrain
occlusion, rather than claiming per-branch shadow accuracy.

The existing Sun/Moon state, phase, projection, cloud transmission and continuous
cycle remain the lighting source. No separate sunset/night scene is selected.
This is rasterized 3D with planar reflections, not hardware ray tracing or path
tracing. It does not require a new graphics engine or npm dependency.

## Cost and lifecycle

The stationary scene and its mirror are cached with the existing quantized
lighting key. Wave time does not redraw them. Ordinary animation remains three
draws; a material/mirror refresh uses eight draws. The mirror uses the same
360k/210k/80k maximum pixel budgets as water. The mirror mip chain is rebuilt only on a cached scene refresh. Static geometry is uploaded once.
The scene adds about 1.3 MB of mesh data and at most approximately 9 MB of colour
and depth targets at the existing caps, depending on HDR and presentation size.

No React animation state is added. Quality adaptation, background/native pause,
reduced motion, power policy and context loss continue through the existing
owner. Buffers, VAOs, height texture, renderbuffers and framebuffers are released
on suspension/disposal and rebuilt after context restoration. Missing optional
scene assets retain the previous water renderer; missing WebGL2 retains the
static fallback.

## Verification

- Node geometry tests check closed volume, river bed/ridges/back slopes,
  instanced tree depth/unit normals and heightfield registration.
- Optional `python3 test/landscape-scene-egl.py` compiles real GLES3 shaders and
  renders front, mirror and translated-camera views with a real depth buffer.
- Browser tests read the actual mirror FBO, require reflected geometry and
  translated-camera parallax, and require caching when only wave time advances.
- The production browser suite continues to check water containment, solar/lunar
  states, UI readability, sheets, theme disposal and foreground/background.
- CI exports the GLB, an oblique geometry preview, actual scene captures and the
  two animation recordings, followed by a signed Android quick build.

Physical Android frame rate, heat and battery use remain device measurements;
software Mesa/Chrome timing is not a POCO F8 Pro benchmark. A matching still
composition is not a guarantee of pixel identity with the reference artwork.

Planar-mirror implementation reference:
https://wikis.khronos.org/opengl/Viewing_and_Transformations#How_do_I_render_a_mirror?

## Foreground correction (build after 561)

The production camera now uses the registered photographic material pass alone
for visible terrain. Overlaying the approximate solid mesh and low-poly conifers
on that pass changed the photograph's local lighting and introduced triangular
patches and duplicate tree silhouettes. Alpha preservation alone did not prevent
these RGB artifacts. The solid geometry still supplies depth-tested planar
reflections and terrain shadow queries. This is a hybrid scene, not newly
reconstructed detailed foreground geometry. No replacement artwork is used.

A material/mirror refresh now takes six draws instead of eight. The GPU browser
regression compares RGB as well as coverage against the registered material with
the solid draw disabled, and separately still requires geometry and parallax in
the mirror. The vehicle sheet shares the existing scene window and saved glass
opacity, with a carrier-coloured line badge, wrapped destination, lighter status
chips and day/night ink. Browser captures cover 320/393px, both periods and sheet
collapse.

## Milk material and Rzeszow timing correction

Map search, vehicle/stop sheets, options and bottom navigation now use an opaque,
smooth milk material with a faint optical sheen. They never copy or reveal the
landscape. Dawn/dusk add restrained peach and rose light; day is pearl blue and
night is ink blue. The common vehicle layout and 64px edge-to-edge mobile
navigation are retained. There is no floating capsule or 16px gap above it.

The landscape observer is fixed to Rzeszow, independently of the device's saved
GPS location. Astronomy Engine 2.1.19 replaces low-precision SunCalc positions
and event searches; SunCalc remains for the Moon's illuminated limb orientation.
Topocentric lunar positions include parallax. UTC instants remain absolute;
Europe/Warsaw defines civil-day boundaries, including 23h/25h DST transition
days. Events are cached by observer, body and civil date, rather than searched
on every frame. The rendered discs use a vertical decorative track: azimuth can
no longer move a body offscreen, and the apparent upper limb reaches the valley
crest at the corresponding rise/set. This presentation is not a geographically
accurate south-facing camera. The daily vertical travel stays within the sky.

A soft, static density mask reduces average cloud coverage by about 26 percent.
The same prepared texture/alpha drives visible clouds, GPU water reflections and
solar/lunar attenuation, preserving their registration while they drift.

Regression references and model documentation:
- https://www.timeanddate.com/astronomy/poland/rzeszow
- https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md

Tests cover 25 October 2026 sunrise 06:09, sunset 16:21, moonrise 15:35 and
moonset 05:12 local time, the dates either side of the autumn change, the spring
23-hour day, skyline limb crossings, vertical ascent/descent, sparse cloud
coverage, shared panel layout, opaque panel material and navigation docking.

## Rounded dock and sky-only filter refinement

The mobile navigation and both map sheets now share 10px side insets and the
same all-corner radius. Navigation sits 8px above the safe area; sheets have an
intentional 8px gap above it, with aligned edges. Their milk material remains
opaque and has a broad cream/peach upper glow, a restrained rose shoulder and a
thin optical rim during twilight.

Sun and Moon retain accurate Rzeszow rise/set instants and vertical movement,
but use separate left/right tracks (32%/68%). Each track is registered to its
own local skyline. The Moon fades from a subdued daytime appearance to full
night brightness across civil twilight; its water lighting uses the same fade.

Only the map filter receives a small sky canvas. It is painted directly from
sky colours and the existing drifting cloud cache, never copied from the scene
canvas. Therefore it contains no Sun, Moon, terrain or water. It refreshes at
most four times per second, with a 600px width cap and no extra WebGL draws.
Other panels/navigation do not receive sky canvases. Tests guard against scene
canvas copies, check matched panel/dock geometry, and retain rise/set/DST tests.
