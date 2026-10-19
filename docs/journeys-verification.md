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

## Widok mapy na telefonie

- Pełny ekran mapy z obsługą zamknięcia, klawiatury i wspólnego stosu przycisku Wstecz. Fokus wraca do przycisku otwierającego, a przewijanie tła jest przywracane po zamknięciu.
- Wysokość mapy reaguje na ekran i obrót telefonu. Kadr obejmuje rzeczywistą geometrię wszystkich wczytanych odcinków, także poza prostokątem punktu startowego i końcowego. Przycisk „Pokaż całą trasę” ponownie ustawia kadr.
- Na ekranie dotykowym mapa osadzona w karcie pozwala przewijać stronę jednym palcem. Na pełnym ekranie działa przesuwanie mapy. Przyciski mają pola dotyku co najmniej 44 px; pełny ekran uwzględnia bezpieczne obszary urządzenia.
- Brak współrzędnych odcinka kończy ładowanie komunikatem z możliwością ponowienia. Prawidłowe odcinki nadal są widoczne. Przełączenie zakładki zamyka podgląd mapy.
- Testy komponentu obejmują 320×568, 393×851, 430×932 oraz obrót do 851×393, pełny ekran, kadr zakrzywionej trasy, powrót fokusu, przywrócenie przewijania i rzeczywisty gest przewijania. Sprawdzono również mapę rzeczywistej trasy pieszej po załadowaniu kafelków.

Ten sam komponent mapy przeszedł dodatkowo powyższe testy mobilne w Android WebView na emulatorze: pełny ekran, obrót, gest przewijania, przywracanie fokusu i obsługa brakujących współrzędnych. Komponent uruchomiono w osobnym widoku testowym; test nie obejmuje logowania.

## Przejścia między przystankami i zbędne objazdy

- Silnik dopuszcza podróż wyłącznie pieszą między przystankami, także przy wyszukiwaniu według godziny przyjazdu. Dla takiego wariantu pobierana jest rzeczywista trasa piesza; jeżeli jej długość przekracza limit, wariant jest odrzucany z zachowaniem dostępnych autobusów.
- Dla tego samego kursu początkowego i tego samego momentu wsiadania usuwane są gorsze warianty z objazdem lub powrotem z pętli. Krótkie dojście do 100 m może zastąpić wariant wolniejszy o co najmniej 5 minut. Jawne sortowanie według najmniejszego dystansu pieszo zachowuje tę preferencję. Późniejsze odjazdy pozostają dostępne.
- Dopasowanie przystanków PKS uwzględnia pełną nazwę z numerem stanowiska przed dopasowaniem przestrzennym. Dla jednoznacznego dopasowania w zasięgu 250 m zachowywane są fizyczne współrzędne GTFS, aby nie pomylić stron drogi przy przesuniętej pozycji katalogowej.
- Kropki przystanków są w osobnej warstwie Leaflet nad trasami, niezależnie od kolejności zakończenia żądań sieciowych. Ikona pieszego i dymki mają własne warstwy. Lista wyboru ma czytelniejsze długie nazwy, strzałki wyboru i wyróżnienie aktywnego wiersza.

Weryfikacja: 20/20 testów planera i regresji. Rzeczywisty rozkład PKS dla Rzeszów D.A. → Gwoźnica Górna SKR 13 daje kurs 108 z dojściem około 50 m o 14:22 zamiast powrotu z pętli; SKR 14 osiągany jest bezpośrednio o 14:21 (wyjazd 13:20). Test przeglądarkowy powtarza wybór SKR 13 i sprawdza jeden autobus z dojściem. Osobne testy obejmują dojście na początku podróży, całkowity limit pieszy, zachowanie autobusu przy zbyt długiej rzeczywistej ścieżce oraz kolejność warstw mapy.
