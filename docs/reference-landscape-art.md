# Reference landscape artwork revision

The user authorized replacing the landscape illustration to approach the supplied
four-phone reference, and identified POCO F8 Pro as the target phone. This is new
illustrative artwork inspired by that reference, not a pixel-identical recovery
of the flattened collage. No original 3D camera, geometry or motion source was
provided. No phone-specific performance is claimed without device measurements.

Production files are `public/themes/mountains/terrain.webp`, `clouds.webp` and
`moon.webp`. Artwork was created with the built-in imagegen tool, then converted
to WebP. The 850x1850 terrain is registered 170 pixels downward against the
UNCHANGED astronomical screen projection. River openings and the skyline move
with the terrain, rather than changing the orbit to suit the new illustration.
The lunar texture is reduced to 256x256; real phase/orientation still come from
the existing ephemeris. Its previous procedural texture remains the load fallback.

`scripts/prepare-landscape-masks.py` derives water coverage and the 256-point
mountain skyline directly from production alpha. The far-bank cutoff at row 1100
lies in opaque terrain above the river; it does not paint a rectangular water
surface. `prepare-water-geometry.py` then regenerates registered shore/depth data.
The existing coplanar perspective map stays valid because the camera is unchanged.
Node/Sharp integration tests compare alpha coverage and sampled occlusion against
the actual decoded WebP, rather than merely checking a manually drawn polygon.

GPU rendering remains Gerstner displacement/analytic normals, GGX/Smith/Schlick,
HDR where supported, ACES, restrained bloom and occluded screen-space scattering.
No sun, moon or water reflection is baked into the terrain. UI layout, saved glass
opacity, schedules, maps, theme selection and astronomical computations are retained.

## Generation prompts

Reference input: user-supplied `6952(5).png`; terrain and clouds use its mountain
illustration as style/composition reference. The following were the production
prompts (a later terrain variant was discarded).

### Terrain source

Use case: stylized-concept. Project asset, NOT a mockup. Create ONE portrait landscape TERRAIN CUTOUT for a layered animated Android app background, aspect ratio 850:1850. Reference image is STYLE AND COMPOSITION REFERENCE ONLY: closely match the richly detailed hand-painted mountain valley, dense pine forests and winding river in the SECOND phone from the left. No phone, interface, frames, text or captions. CRITICAL ALPHA: entire sky is transparent; entire visible river/lake surface is transparent (holes in the terrain), so a real GPU water renderer can show through. Only mountains, forested banks, little tree-covered islands, near foreground shrubs/rocks are opaque. No white/black/coloured fill in the river. Clear cutout silhouette of trees against water, fine antialiasing. Portrait scene: upper 43 percent entirely empty transparent sky; layered distant blue mountains at y=43-59%; distant river begins around (55%,59%), curves toward (35%,68%), then (69%,77%), then (51%,88%), then widens to lower right around (74%,99%). Deep valley perspective. River must be BROAD and visually important with multiple visible surfaces behind forested islands, like the reference. Very distant mountains pale atmospheric blue, middle pine forest rich green, foreground foliage detailed, warm neutral late-afternoon illumination without baked orange sunset wash; rich painterly cinematic detail like reference. Water HOLES should remain open to the bottom edge around x55-90%, other foreground vegetation frames bottom left and right. No sun, no moon, no stars, no clouds, no light shafts, no baked water reflections. Keep every visible water pixel transparent. Produce professional production terrain art with crisp intricate bank silhouettes and layered depth; not simplified vector artwork.

### Terrain refinement (selected source)

Edit this production terrain cutout. Keep landscape drawing, detailed forest and broad transparent river holes, true alpha transparency. Recompose downward: FIRST mountain pixel must start at 43% of image height (not current 27%). The upper 43% MUST be entirely transparent. Distant river first appears at 60% height. River widens through lower 40%; some foreground at bottom may be cropped to fit. Same portrait 850x1850, image must remain full portrait with blank transparent space top43%. Preserve river holes transparent, sky transparent, terrain opaque, no water surface painting, no clouds, no sun/moon, no interface/text. Match input art exactly with shifted framing.

### Clouds

Use case: stylized-concept. Create ONE professional production CLOUD LAYER texture, portrait 850x1850 with actual alpha transparency. Reference is style reference only: richly textured cumulus and wispy cloud banks from the sunset phone, but neutral cream white/gray daylight coloring so code can relight at sunset/night. No background sky color. No landscape, mountains, river, sun, moon, stars, interface, border or text. Soft translucent cloud edges and fine painterly light detail. Composition: cloud banks across upper half between y=0 and y=48%, broken small cloudlets near y=40%, breathing room at horizontal center around y=30-40% for Sun. Entire lower half fully transparent. Clouds irregularly clustered in horizontal atmospheric layers like the reference, naturally textured luminous edges. Not a dense opaque blanket, enough open gaps for blue sky. Texture ends left/right fade naturally; real alpha, no checkerboard painted.

### Moon

Use case: stylized-concept. Production texture for the visible full Moon in a hand-painted mountain landscape mobile app. One centered circular full moon disc on true transparent background, fills 90% square canvas. Beautiful softly painted but anatomically recognizable lunar maria: dark Sea of Tranquility on upper right, Oceanus Procellarum on left, fine restrained craters, creamy silver slightly warm ivory colour, natural shaded limb and subtle texture. No halo or glow outside disc (engine adds it), no stars, no background, no text. Not a ball covered in random circular outlines. High detail that still reads at 32 pixels, softly luminous, match elegant cinematic mountain illustration reference. Whole circular disc fully lit without crescent or terminator; engine will apply real lunar phase.
