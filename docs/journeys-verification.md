# Weryfikacja zakładki Połączenia

Zmiany dotyczą wyłącznie planera połączeń. Wybór przystanków korzysta ze współdzielonego komponentu StopList bez zmiany zakładki Przystanki.

PKS i MPK są przeszukiwane na podstawie pełnych, lokalnych rozkładów GTFS, zamiast próbkowania tablic odjazdów. Silnik uwzględnia kalendarze, wyjątki, kursy po północy, ograniczenia wsiadania i wysiadania, czas przesiadki oraz łączny limit dojść. Marcel wymaga połączenia z internetem.

Aktualizacja lokalnych rozkładów: `node scripts/update-journey-timetables.mjs`. Zakres ważności znajduje się w `public/data/journeys/index.json`; interfejs zgłasza brak aktualnego rozkładu zamiast przedstawiać go jako brak kursów.

Weryfikacja 19 października 2026:

- `node --test test/journey-planner.test.cjs test/journey-timetable.test.cjs` — 11/11 testów.
- `node test/journeys-browser.cjs` — rzeczywisty komponent, lokalne rozkłady i Worker: wyszukiwanie PKS 301 i MPK, wybór przystanków, szczegóły, mapa, ulubione, zamiana kierunku, zamykanie klawiaturą, oba motywy i szerokości 320–430 px. Planowanie PKS/MPK działa przy zablokowanych żądaniach do zewnętrznych API.
- TypeScript i ESLint zmienionych plików — poprawne.
- `npm run android:sync` oraz `assembleDebug` — poprawne.

Test przeglądarkowy uruchamia samą zakładkę poza ekranem logowania; nie potwierdza pełnego przepływu logowania w aplikacji Android.
