# Żywy Krajobraz – Dynamiczne Góry

## Source and integration

Starting point: successful Android build #505, run 39952406191, 23 October 2026.
The checkout log establishes **f0e3c40c053ed27374380201702971fd91b67f99** as the actually built source, a synthetic merge of PR #53 head **7c10727e1af71e4b434a4b2ad553bd688df45c49** (`fix/pks-confirmed-stop-progress`) into `b915457b63e73c1405ae4c123271dafb2643bc19`. The PR head alone was NOT the checked-out source. This branch deliberately preserves the newer transit fixes absent from main.

Working branch: `feat/dynamic-mountain-theme-20261023`; draft PR #54.

The new `dark-mountains` theme is a complete preset under **Gotowe zestawy**, not an accent choice. Existing selection persistence, profiles, backups and other presets remain intact. The app stays React/Next.js + Capacitor 8, Android API 24+, without a replacement rendering framework. Fixed dark glass maintains readable text during the whole solar cycle; PKS/MPK operator colors remain unchanged. The map retains its functional map background; inactive maps do not obscure the landscape behind the other tabs.

## Main files

- `lib/landscape-astronomy.ts`, `lib/landscape.worker.ts`, `lib/suncalc.d.ts`: offline ephemerides and interpolation.
- `lib/landscape-renderer.ts`, `lib/landscape-horizon.json`: drawing, relighting, projection and occlusion.
- `components/DynamicLandscape.tsx`: asset loading, worker and lifecycle; no per-frame React state updates.
- `public/themes/mountains/{terrain.webp,clouds.webp,water-mask.png}`: one shared neutral illustration, cloud layer and exact river mask, approximately 580 KiB total.
- `lib/app-theme.ts`, `lib/interface-presets.ts`, `app/page.tsx`, `app/globals.css`: existing theme integration.
- `lib/journey-places.ts`: reuse location already obtained by the planner.
- `android/app/src/main/java/pl/pkslive/app/{MainActivity.java,LandscapePowerPolicyPlugin.java}`: event-based battery saver and thermal policy.
- `test/landscape.test.cjs`, `test/landscape-browser.cjs`, `test/build-accent-fixture.cjs`: focused numerical/browser verification and previews.

## Astronomy and scene

Pinned **SunCalc 1.9.0** (BSD license) computes solar/lunar altitude and azimuth, lunar illuminated fraction, phase and bright limb angle. This version uses **radians and azimuth clockwise from south**; do not replace with v2 without conversion. This is a low-precision decorative ephemeris, not a navigation instrument. References: https://github.com/mourner/suncalc/tree/v1.9.0 and https://eclipse.gsfc.nasa.gov/SKYCAL/SKYCAL.html?cal=2026 .

Absolute Unix instants incorporate timezone offsets/DST without manually adding hours. Solar rise/set, civil, nautical and astronomical twilight events are computed in the worker; unavailable polar events are null. Two samples 30 seconds apart are refreshed every 15 seconds and interpolated with wrapped angular interpolation. Rendering and ephemeris clocks are separate: monotonic time drives motion; Date.now drives astronomy. A wall-clock jump over five seconds invalidates the samples. Resume recalculates current conditions.

Coordinates use the planner's last successfully shared location or the explicitly named **Rzeszów (50.0412 N, 21.9991 E)** fallback. The theme never requests GPS or initiates another permission prompt. The preset description discloses this fallback. Saved locations are reused offline; a stale saved location is not claimed as a fresh GPS fix.

The fixed south-facing artistic panorama spans 260 degrees; north passes outside the frame. Altitude maps continuously to scene height. The image skyline is an artistic occluder, not a measured local horizon. Bodies draw behind that skyline and cloud alpha. The lunar terminator is a continuous sphere-section path whose rotation derives from bright limb minus parallactic angle. Moonlight scales with illuminated fraction and altitude; below-horizon bodies have no direct light/reflection.

Solar altitude controls continuous smoothstep daylight, twilight warmth, star density, fog and moonlight. The same neutral terrain and cloud cutouts are tinted into cached layers. There are no morning/day/evening/night wallpapers. Cloud drift, restrained star twinkle and water ripples use monotonic time.

The river mask is the inverse alpha of the terrain **only below 57% of image height**, preserving all riverbanks and trees. Water color follows the shared sky model and includes a subtle mirrored terrain component. Perspective streaks follow the projected source; intensity includes disc visibility above the actual asset skyline, cloud transmission, altitude and lunar fraction. Below-horizon or occluded sources cannot leave a painted highlight.

Canvas 2D uses cached buffers and browser compositing, rather than a new OpenGL framework or RuntimeShader requiring a higher Android API. Uniform artwork scaling avoids stretch; phone aspect ratio differences crop narrow edges. A physical GPU profile is still required before making performance claims.

## Power and lifecycle

Active ambient rendering starts at 8 fps, backs off to 4 fps if a frame exceeds 18 ms, and caps backing density at 1.5 and area at 1.8 million pixels. Reduced-motion, existing light-effects mode, Android power saver or thermal state at least MODERATE disable ambient motion and refresh astronomy at 15-second intervals. Document hidden/native app inactive clears both timers. Worker and native listeners are disposed when selecting another theme. No bitmaps are created in the frame loop; terrain/cloud buffers are reused. These are implementation limits, not proof of low battery consumption.

## Developer preview

Enabled only with development NODE_ENV or an explicit `NEXT_PUBLIC_LANDSCAPE_PREVIEW=true` test build. Production APKs have no preview control and use real time.

In a preview-enabled build after selecting the theme:

```js
window.__landscapePreview({iso:'2026-10-23T17:10:00+02:00',rate:0});
window.__landscapePreview({iso:'2026-10-23T00:00:00+02:00',rate:1440});
window.__landscapeDiagnostics();
window.__landscapePreview({}); // return to real time
```

The preview clock is scoped to the landscape only. It never changes timetable, prediction, login or application clocks.

## Verification

Local TypeScript check and 32 focused tests passed before asset refinement. Tests cover solstices/equinox, twilight continuity, full/new/quarter moon, daytime/absent moon, DST repeated hour, invalid location, polar events, angular wrap, occlusion and theme/profile/backup regression. First GitHub run 39992703398 successfully built Android web assets and passed these tests, then found horizontal overflow in the browser test fixture at 320 px. The fixture was corrected to use the same fixed viewport container as the actual app. Subsequent CI results are recorded in the PR.

The browser suite checks four scene times, actual timetable UI, small phone, buffer cap, reduced motion, background pause/resume and theme cleanup; it uploads PNGs and draw metrics. Those metrics come from headless desktop Chrome, not a phone. Generated previews use one scene and real astronomical inputs, rather than four independently generated illustrations.

Local Android build was actually attempted with `bash ./gradlew :app:assembleDebug`; it stopped at missing Java `libjli.so`. Local Next.js production build hit sandbox `uv_resident_set_memory`. The existing GitHub Actions workflow performs the real web export, Capacitor sync and Android build using Java 21 and Android SDK 36.

Not yet measured: physical-device CPU/GPU, RAM/allocations, long-duration battery drain, thermal behavior and scroll frame timing on a weak Android phone. No claims of verified battery efficiency are made. Scene light is artistic tinting, not physically accurate terrain shadow tracing or a terrain-specific sun-horizon survey.

## Asset provenance and prompts

Built-in image generation edited the user-provided daytime reference `6870(1).png` into the following project assets. The source reference itself is not distributed. Images were converted to WebP preserving alpha; the mask and 256-sample horizon were extracted from that alpha. No solar, lunar or bright source reflection is present in the assets.

Terrain prompt: “Edit this reference into a production compositing asset for the exact same animated Android mountain valley. Preserve its portrait 850:1850 composition and every mountain, forest, tree and river-bank shape. Output a PNG terrain CUTOUT with actual transparent alpha. REMOVE THE ENTIRE SKY, SUN, ALL CLOUDS AND ALL STARS above the mountain skyline and make that whole upper sky area fully TRANSPARENT. ALSO REMOVE THE ENTIRE VISIBLE RIVER/LAKE SURFACE and make the winding water surface fully TRANSPARENT, including reflections, while preserving every riverbank and tree silhouette along the river. Keep only mountains, forests, leafy foreground plants and rocks. The terrain must retain the rich detailed hand-painted anime landscape quality of the original reference, but use neutral diffuse overcast daylight, subdued natural forest greens and blue-gray mountain rock, no directional golden sunlight, no painted mist or luminous haze, no sun disc, no moon, no bright reflection or glows. This is ONE invariant landscape layer to recolor dynamically in code for all times, not a wallpaper. Maintain skyline around 51% image height and river starting around 69% then winding to bottom at 82% height, like the reference. No text, no UI, no buildings. Actual transparent holes for sky AND water are essential. Preserve original portrait proportions, do not crop.”

Cloud prompt: “Extract ONLY the illustrated CLOUDS from this reference into one transparent PNG layer, preserving exactly the tall portrait aspect ratio 850:1850, their existing positions, scale and painterly anime shapes across the upper 53% of the canvas. Remove the blue sky to actual transparent alpha between all cloud shapes. Remove the sun, moon, stars, mountains, forests, water and foreground; the entire lower half must be fully transparent. The only visible pixels in this asset are the lovely detailed cloud formations from the reference, in neutral diffuse white, cream and blue-gray with no orange, no sunlight, no glowing edges. Preserve their fine detailed fluffy cumulus shapes and wispy strands. This is a production cloud compositing overlay to be gently tinted and moved in an animated Android scene. Keep clouds spacious enough that the sky and moving sun can be seen behind them. No text, no UI. Actual transparent background required.”


## Water, glass and light cloud cover refinement

The river now uses two crossing wave trains for short curved moving crests, and 54 narrow strips of the existing reflected terrain texture receive a small horizontal ripple displacement. Silver moonlight has a wider soft rough-water lobe plus separated brighter glints, still multiplied by phase, horizon visibility and averaged cloud transmission. All water is composited through the unchanged exact river mask.

The replacement sparse cloud overlay removes the large left bank and dense horizon clouds. It drifts steadily at 1.15 design pixels per second, with repeated atlas edges feathered to prevent visible seams. Cloud attenuation uses the same repeating coordinates and feather mask. Reduced motion freezes the last animation phase.

Glass opacity is approximately 59–66% instead of 74–82%, with slightly brighter muted text. The ready-made preset now uses 62% glass opacity and a 5px blur; the timetable canvas itself does not blur the scenery. This also applies to an already saved mountain theme through the theme-specific material, without requiring reselecting the preset.

Cloud refinement prompt (built-in image generation): “Edit this transparent cloud overlay for the SAME animated mountain app. Keep exactly the original portrait 850 x 1850 aspect and an entirely transparent lower 47% canvas. The user wants SMALL CLOUD COVER: remove roughly 75 percent of all cloud area. Leave only 3 to 5 SMALL separated delicate wispy cloud groups, mostly near the upper left and upper right sky edges, and a few very thin streaks. Leave the central sky and the horizon almost completely CLEAR and transparent. No large wall of cumulus on the left, no dense horizon bank. Retain the fine hand-painted anime illustration quality, with soft white/cream highlights and subtle blue-gray shaded contours under neutral diffuse light. No orange lighting. The ONLY opaque content must be these few small clouds; actual alpha transparency everywhere else. No sun, moon, stars, sky color, mountains, terrain, water, text or UI. This is a production moving cloud layer, not a wallpaper. Preserve the precise portrait aspect ratio and sparse balanced composition. No checkerboard pattern painted into the asset.”

## Visible motion and complete chrome correction

A single slow initialization/relight frame previously permanently selected 4 fps. Frame adaptation now ignores the first ten frames, tracks sustained cost and recovers to 12 fps when inexpensive; the reduced fallback is 6 fps. Android saver/moderate thermal status and a failed native policy query now select live 2 fps rather than freezing the scene. Severe thermal status, explicit reduced motion/light effects, and hidden/inactive app still pause ambient motion. The native plugin reports severe thermal status separately. Developer diagnostics expose the policy reason.

Cloud speed is now 4 design pixels/s (roughly 1.5 screen pixels/s on a 393 px phone). Two wave trains have larger bounded displacement (under 14 design pixels), faster phase propagation and brighter short crests. Tests compare the actual rendered upper sky three seconds apart with a frozen daytime clock, and water independently with a frozen nighttime clock; policy tests cover saver motion and recovery after isolated slow frames.

`LandscapeChrome.tsx` adds lightweight illustrated peaks, pines, water and drifting wisps behind the real MapHeader and BottomNavigation controls. These SVG decorations use the shared scene color and pause with the canvas policy. Map tiles and pointer interaction are unchanged. Admin neutral surface variables now resolve to the shared translucent material even for legacy solid surface selectors; nested option cards use a weaker fill to avoid accumulating opacity. The full-screen Options overlay no longer blurs the whole scene. Other themes are unaffected.

Preset description: “Żywa dolina, płynące chmury i blask na wodzie”. Fallback location information remains in code and in the preset tooltip.

### Korekta po zgłoszeniu statycznej wody i stale ciemnej mapy

- Usunięto dekoracyjne wielokąty gór, choinki i kreski z filtra oraz nawigacji. Materiał paneli ma jedynie miękkie światło i cienką krawędź; kontrolki zachowują układ.
- Zamiast nieruchomych rzędów kresek odbicie wyznacza ruchome pole normalnych trzech przecinających się fal. Każda klatka zmienia kształt i jasność nieregularnych srebrnych/złotych refleksów. Cała woda otrzymuje ruchome światło otoczenia, nawet poza głównym odblaskiem. Krajobraz odbity w 108 pasmach jest odkształcany poziomo i pionowo. Dokładna maska nadal chroni brzegi i drzewa.
- Pole światła ma 192×192 próbek i trwały bufor ImageData; nie alokuje tablic co klatkę. Domyślnie 24 kl./s, po wykryciu wolnego rysowania 12 kl./s. Są to docelowe częstotliwości, nie gwarancja wydajności telefonu.
- Chmury przesuwają się stale z prędkością 12 jednostek sceny/s (około 4,7 piksela/s na ekranie szerokości 393 px), z łagodnym zszyciem brzegów. Obłoki zmieniają także transmisję światła na wodę.
- Tryb lekkich efektów wcześniej zatrzymywał całą scenerię. Teraz, podobnie jak oszczędzanie energii/nieobsługiwany most natywny, zostawia 2 kl./s. Jawna redukcja ruchu, ukryta aplikacja i krytyczna temperatura nadal wstrzymują ruch.
- Nowa wspólna paleta zależy od wysokości Słońca: jasne szkło i ciemny tekst za dnia, ciemne szkło i jasny tekst nocą. Filtr prawdziwej warstwy Leaflet przechodzi z neutralnego dziennego do odwróconego nocnego. Przejścia kolorów i filtra trwają 1,8 s, pozycje pojazdów oraz semantyczne kolory przewoźników nie są filtrowane dodatkowo.
- Test przeglądarkowy używa rzeczywistego BusMap/Leaflet z lokalnie podstawionymi testowymi kafelkami, sprawdza dzienny/nocny filtr oraz kolory pola wyszukiwania. Zapisuje 6-sekundowy film w czasie rzeczywistym przy zatrzymanym zegarze astronomii. To dowód ruchu renderera w Chrome, nie pomiar fizycznego urządzenia Android.

Materiały UI zachowują czytelną jasną lub ciemną polaryzację; zmiana następuje przy wysokości Słońca −2° z przejściem CSS 1,8 s. Nie przetrzymujemy mapy przy invert(50%) przez środek zmierzchu, bo usuwa to kontrast dróg i etykiet. Ciepły odcień szkła i całe oświetlenie sceny pozostają ciągłe.

`useLandscapeDay` przekazuje zmianę dnia/nocy do istniejących właściwości `isDark` głównej aplikacji, dzięki czemu także pozostałe komponenty wybierają własne jasne/ciemne warianty. Zdarzenie jest wysyłane wyłącznie po zmianie pory, bez aktualizowania React przy każdej klatce ani każdej próbce astronomii. Test mapy potwierdza synchronizację tej właściwości z paletą.


## Solar materials and personalization (2026-10-24)

Scenery retains continuous solar illumination. UI materials use coordinated
light and dark families; surface, ink, muted text and map polarity change in the
same astronomy update. Temperature changes continuously within each family.
A one-degree hysteresis band around -2° prevents repeated switches near the
horizon (day enters above -1.5°, leaves below -2.5°).

Each panel now has one adjustable glass fill. The previous 88% full-screen veil
and fixed 88–96% opacity floors have been removed. Glass opacity, blur toggle
and radius, panel tint, borders, shadows, card style, pattern and glow follow
the shared appearance settings. Full-screen ancestors remain transparent and
unblurred. Labels have no word-sized pills or outlines; isolated headings over
the scenery use a small text shadow. A deliberately low opacity can reduce
text contrast; the user's chosen opacity is never silently raised.

Legacy admin-light important backgrounds are overridden by the same scoped
material layer as the rest of the theme. Native date/time controls explicitly
use the current solar color-scheme. Filled map markers and carrier headers keep
their own foregrounds. Solid journey search buttons use the accent-on pairing.

Appearance backup retains the full mountain configuration and all profile font
selections/custom URLs. An explicit googleFonts manifest lists distinct family
names and canonical Google stylesheet URLs, including dormant custom sources.
Font binaries are not embedded; first-time font downloads require a connection.
Old version-1 backups remain compatible. The picker preview reads
“Przykładowy tekst”.

Tests cover opacity values, tint, native control color-scheme, theme/font backup
round trips, admin day/night glass, journey controls and existing renderer
lifecycle/animation behavior. Browser screenshots exercise the real components.
