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


## Reference redesign (based on Actions build 309)

The sky now contains 96 tiny stars per tile (previously 520), with only four
animated accents. Panels no longer stack a second generated starfield. Planets
range from 36 to 84 CSS px including the original photo margins. Map decoration
uses a fixed seed and panel identity, so navigation, carrier sheets and app
restarts never randomize its layout. Other tabs retain their visit behavior.

Local Hubble photographs replace the drawn galaxy spirals and nebula stripes:

- `sombrero.png`: [Sombrero Galaxy](https://science.nasa.gov/asset/hubble/sombrero-galaxy/).
  Credit: NASA and The Hubble Heritage Team (STScI/AURA).
- `orion.png`: [Orion Nebula](https://science.nasa.gov/asset/hubble/orion-nebula-3/).
  Credit: NASA, ESA, Hubble Space Telescope Orion Treasury Project Team,
  Massimo Robberto (STScI, ESA).

`scripts/build-cosmic-deep-space.mjs` embeds the original downloaded PNGs into
four SVG compositions with soft masks and low opacity. No filters, network
requests, animation loops or image blending are needed at runtime.


## Reference compositions and navigation algorithm

The theme uses four authored slots matching the supplied screenshot: a small
upper-right crescent, a ringed planet with a lower-right galaxy, a low crescent,
and a quiet nebula. Stops use their initial slot modulo four and stable stop ID;
filtering or asynchronous insertion does not replace a cached composition.
Vector shadows over the existing NASA planet sprites provide restrained phases.
The theme creates no new random seed from a loading screen, DOM mutation,
Firebase snapshot, modal mount or layout animation. Only actual tab clicks start
a new visit. Startup binds the navigation name without clearing existing scenes.
The map retains its fixed seed across navigation and app restarts.
