# Kosmos planet imagery

The eight planet photographs are packaged locally; no external image requests are made at runtime. Source: NASA Science, [About the Planets](https://science.nasa.gov/solar-system/planets/). Photographs remain unmodified and retain their original aspect ratios. `scripts/build-cosmic-planets.mjs` wraps each photograph in a self-contained SVG with a static color matrix that makes its black background transparent. This is decoded as an ordinary image; panels do not use CSS background blending or backdrop filters. This avoids clipped composited backgrounds in Android WebView.

- Mercury: https://science.nasa.gov/wp-content/uploads/2024/03/pia15162-mercury-basins-messenger-16x9-1.jpg?w=1024
- Venus: https://science.nasa.gov/wp-content/uploads/2024/03/venus-mariner-10-pia23791-fig2-16x9-1.jpg?w=1024
- Earth: https://science.nasa.gov/wp-content/uploads/2024/03/blue-marble-apollo-17-16x9-1.jpg?w=1024
- Mars: https://science.nasa.gov/wp-content/uploads/2024/03/mars-full-globe-16x9-1.jpg?w=1024
- Jupiter: https://science.nasa.gov/wp-content/uploads/2024/03/jupiter-marble-pia22946-16x9-1.jpg?w=1024
- Saturn: https://science.nasa.gov/wp-content/uploads/2023/05/saturn-farewell-pia21345-sse-banner-1920x640-1.jpg?w=1024
- Uranus: https://science.nasa.gov/wp-content/uploads/2024/03/uranus-pia18182-16x9-1.jpg?w=1024
- Neptune: https://science.nasa.gov/wp-content/uploads/2024/03/pia01492-neptune-full-disk-16x9-1.jpg?w=1024


## Photographs and packaging

Local Hubble photographs provide the Orion nebula, Sombrero galaxy and M51
Whirlpool galaxy. Full credits and source links are in Options and
`assets/cosmos-source/README.md`. The masters stay outside Android public assets.
`scripts/build-cosmic-deep-space.mjs` resizes and compresses the photographs into
self-contained offline SVG/WebP sprites with feathered boundaries. Four nebula
atlases contain no fixed galaxies or stars; two small shared galaxy sprites are
placed independently. There are no image filters or per-card duplicated photos.

## Composition engine, version 2

`cosmicComposition` builds a fresh plan from surface identity and visit seed.
Separate named random streams choose photographic identity, geometry, nebulae,
star detail and ornament orientation. The planner evaluates 96 low-discrepancy
candidates per major body, rejects bounds and protected reading/control zones,
and scores clearance and visual balance. Galaxies have their own positions and
sizes; a bounded fallback reduces galaxy size if there is insufficient space.
There is no slot number, list ordinal or twelve-template cycle.

`cosmicPanelSky` constructs a static blue-noise starfield. It evaluates twelve
candidates per star, mixes a distant cluster with the wider field, spaces bright
halos farther apart, protects major bodies and dims the reading column. Surface
roles choose the detail budget: dense rows/controls use fewer stars. Different
radii, colours and brightness provide depth without animation loops.

`cosmicProject` fits that same plan to actual CSS pixels, checking full sprite
bounds, favourite-button space and planet/galaxy separation. A ResizeObserver
reprojects only when panel dimensions change; it never changes the seed or
photographic identity. Stop planets remain independent composited image layers,
so favourite FLIP animation cannot reuse a clipped multi-background raster.
Admin and Options reserve a separate ornament strip for a planet and sun.
Interactive map panels and dense rows receive no planetary discs.

`cosmicVisitSession` keys cached scenes by stable surface identity and committed
tab visit. Discovery order, favourites, filters, Firebase refresh, DOM recreation,
loading renders and Options overlays cannot start a new visit. Evicted virtual
rows reconstruct the exact same scene. Real navigation starts a new visit; map
artwork keeps its fixed seed across navigation and app restarts. Loading always
uses a solid background.

Tests cover 500 canonical plans, thousands of responsive projections, protected
zones, inter-body clearance, deterministic reconstruction and visit ownership.
Browser checks measure real image bounds at 320/393/707 px, compare both rendered
halves of planets at DPR 2.5 after favourite movement, and inspect departure rows,
Admin, Options, loading and map containment.
