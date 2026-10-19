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

## Mapa, lokalizacja i historia wyszukiwania

- Mapa korzysta z tego samego podkładu Google i kolorów przewoźników co mapa główna; pokazuje tylko plan podróży, punkty przystanków i oznaczenia pieszego.
- Dojścia są wyznaczane profilem pieszym FOSSGIS OSRM. Biała, przerywana linia pokazuje przebieg po ulicach i ścieżkach. Brak odpowiedzi nie jest zastępowany prostą linią. Przebieg mapy i wariant całej trasy pieszo wymagają internetu; czasy dojść do autobusów pozostają szacunkowe.
- Rzeszów D.A. jest jednym wyborem w planerze. Wyszukiwanie obejmuje wszystkie stanowiska, zachowując rzeczywiste stanowiska w szczegółach. Inne listy przystanków pozostają bez zmian.
- Start z lokalizacji pobiera bieżącą pozycję także po wybraniu historii. W historii zapisuje się maksymalnie 6 par punktów, bez współrzędnych użytkownika. Android prosi o zgodę na lokalizację przy pierwszym użyciu tej funkcji.
- Formularz i wyniki mają osobne kolumny na komputerze; wybór przystanków pozostaje modalny. Ulubione podróże zastąpiono ostatnimi wyszukiwaniami.

Dodatkowe sprawdzenie: 14/14 testów planera, kalendarzy, stanowisk i położenia; test przeglądarkowy z prawdziwymi kafelkami oraz trasą pieszą, symulowanym GPS i odmową dostępu do lokalizacji; brak poziomego przewijania przy 320/393/430 px i układ dwóch kolumn przy 1440 px. Kompilacja produkcyjna odbyła się w osobnej kopii, aby nie kolidować z uruchomionym serwerem deweloperskim.
