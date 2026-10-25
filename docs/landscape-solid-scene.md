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
components. Main-view photographic detail uses projective albedo mapping; the
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
coordinates, clips underwater geometry, and uses depth testing. Consequently
near banks occlude distant slopes in the reflected view. Reflection colour is
linear radiance, HDR where the existing extension permits it.

The water shader projects its wave-reflected view ray into this mirror texture,
mixes missing/out-of-frame data with atmospheric radiance, and applies the
existing Fresnel/GGX/ACES model. It no longer relies on screen-space depth hits
when the solid scene is available. Terrain, water and volumetric-light queries
share the authored heightfield for direct-light shadow tests. Tree geometry is
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
360k/210k/80k maximum pixel budgets as water. Static geometry is uploaded once.
The scene adds about 1 MB of mesh data and at most approximately 8 MB of colour
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
