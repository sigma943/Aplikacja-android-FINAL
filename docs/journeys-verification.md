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

## Ikony i rozszerzona weryfikacja niezawodności

Ikona nagłówka i zakładki Połączenia przedstawia dwie pinezki połączone przerywaną ścieżką. Znacznik pieszego to pełna sylwetka w białym kole z delikatną poświatą; sylwetka i poświata dziedziczą akcent aplikacji. Test interfejsu zmienia akcent na fioletowy i pomarańczowy, także po otwarciu mapy na pełnym ekranie. Sprawdzono ten widok również w Android WebView.

Weryfikacja obejmuje 33 testy najwyższego poziomu:

- 720 konfiguracji na 120 deterministycznych sieciach testowych, porównywanych z niezależnym, wyczerpującym wyliczeniem możliwych kursów i przesiadek. Uwzględniono tryby odjazdu i przyjazdu, trzy sposoby sortowania, filtry przewoźników, 0–2 przesiadki, różne limity chodzenia, zakazy wsiadania/wysiadania i odcinki o zerowym czasie. 489 konfiguracji miało dostępną trasę, w 79 najlepsza trasa łączyła różnych przewoźników; pozostałe poprawnie kończyły się brakiem połączenia.
- Wszystkie sześć uporządkowanych par PKS/MPK/Marcel oraz sześć kolejności trzech przewoźników, z kontrolą liczby przesiadek i marginesu czasu co do sekundy.
- Cztery rzeczywiste relacje w obu trybach czasu: PKS → MPK, MPK → PKS, Marcel → MPK i Marcel → PKS. Źródłem są lokalne rozkłady GTFS i zapisany kurs Marcel Jasło–Rzeszów 1181798; jest to osiem zapytań na danych rzeczywistych, bez potwierdzania bieżącej dostępności internetowego API Marcel.
- Osobna integracja adaptera Marcel z zapisanym kursem i pełnym rozkładem MPK: scalanie indeksu przystanków, pomijanie duplikatów kursów, zachowanie innych przewoźników przy błędzie serwisu, ostrzeżenie o brakującym indeksie, wyłączenie przewoźnika i anulowanie trwającego żądania.

Testy wykryły i zabezpieczyły regresjami dwa przypadki graniczne: kolejność jednoczesnych połączeń oraz odrzucanie przez adapter Marcel odcinków z tą samą minutą przyjazdu i odjazdu. Silnik rozwiązuje teraz grupę takich połączeń przed przejściem do następnej godziny, zachowując pozycję pasażera w autobusie także na przystanku bez wysiadania. Adapter zachowuje odcinki o zerowym czasie. Cykl takich odcinków kończy obliczenia bez nieskończonej pętli.

## Android: lokalne rozkłady i preferencje (19.10.2026)

- Pobieranie skompresowanych rozkładów odbywa się w głównym kontekście WebView, który ma dostęp do lokalnego serwera zasobów Capacitor. Bajty są przekazywane do Workera przez structured clone; dekompresja, odczyt JSON i obliczenia pozostają w Workerze. Worker nie wykonuje już żądań do wirtualnego adresu `https://localhost`. Jest to obejście możliwego pominięcia obsługi lokalnych zasobów przez żądania dedicated Workera.
- Pobieranie ma limit czasu, obsługuje anulowanie i ponowienie po błędzie. Awaria jednego przewoźnika nie blokuje drugiego. Pobrane bajty pozostają w pamięci między wyszukiwaniami; nie są odłączane przez transfer do Workera.
- Sortowanie, liczba przesiadek i zapas czasu używają własnych menu aplikacji. Menu obsługują dotyk, strzałki, Home/End, Escape, kliknięcie poza menu oraz wspólny przycisk Wstecz. Panel ma oddzielne karty preferencji, przewoźników i dojść pieszych.
- Dodano test pracy silnika bez dostępu do fetch w Workerze, na rzeczywistych lokalnych rozkładach, oraz testy ponowienia i anulowania pobierania. Rozszerzono scenariusz przeglądarkowy o wybór sortowania i powrót fokusu po Escape.
- Usunięto również `connections.push(...feedConnections(...))`: pełny rozkład generuje kilkanaście lub kilkadziesiąt tysięcy argumentów w jednym wywołaniu (dla 19.10, 13:13: PKS 13 229, MPK 26 042). To może przekroczyć mniejszy stos argumentów mobilnego WebView i zostać błędnie zgłoszone jako błąd odczytu rozkładu. Segmenty są teraz dopisywane pojedynczo. Test na rzeczywistych danych dodatkowo wymusza limit 8000 argumentów.

## Domyślni przewoźnicy, trasy i nawigacja

- Domyślnie zaznaczeni są PKS, MPK i Marcel. Podstawowy katalog pojawia się przed zakończeniem internetowego indeksowania Marcela, aby otwarcie zakładki nie blokowało wyszukiwania.
- Trasy piesze używają natywnego HTTP na Androidzie oraz zapasowego routera Valhalla z profilem `pedestrian`. Niepowodzenie nie tworzy prostego łącznika. Pełny przebieg jest zachowany na mapie.
- Skompresowane odcinki autobusowe zachowują współrzędne wszystkich przystanków pośrednich. Geometria oficjalna musi je obejmować; zapasowy router prowadzi przez cały wzorzec przystanków zamiast tylko przez dwa końce.
- Połączenia mają osobną flagę `disableJourneys` w uprawnieniach, edytowaną przez właściciela tak jak dotychczasowe ograniczenia zakładek. Reguły Firestore uniemożliwiają użytkownikowi usunięcie blokady. Przed użyciem nowych uprawnień trzeba wdrożyć zaktualizowane `firestore.rules` (aplikacja używa zapisów Firestore na planie Spark).
- Połączenia są dostępne w kolejności zakładek, podglądzie wyglądu i wyborze ekranu startowego. Starsze ustawienia otrzymują nową zakładkę obok Mapy; jawnie ustawiona kolejność jest zachowana.
- Animacja otwarcia odpowiada panelowi admina i uwzględnia ograniczenie ruchu.
- Szybki build pomija pełny zestaw regresji; zachowuje ukierunkowane testy planera i test emulatora reguł dla nowego uprawnienia.

## Potwierdzona przyczyna błędu w APK i dojścia bez limitu

Zbadano rzeczywisty debug APK z buildu 426 (4909acf). Archiwum zawiera `assets/public/data/journeys/pks.json` (1 004 566 B, 2155 kursów) i `mpk.json` (1 903 729 B, 7892 kursy). Plików `.json.gz` nie ma: aapt rozpakował gzip i usunął rozszerzenie. Dotychczasowy adres żądania nie odpowiadał nazwie wewnątrz APK.

Loader próbuje teraz zwykłego JSON, a następnie gzip dla wersji webowej. Odrzuca HTML zwracany przez fallback strony. Przygotowanie paczki Androida jawnie generuje JSON i usuwa gzip; dodatkowy krok buildu weryfikuje pliki i treść rozkładów w gotowych debug/release APK. Testy obejmują oba formaty i wyszukiwanie na ich rzeczywistych danych.

Usunięto blok „Dokąd dzisiaj?” i jego podpisy, opis pod przewoźnikami oraz instrukcję pod nagłówkiem listy przystanków. Otwarcie listy czyści komunikat walidacji formularza; błąd lokalizacji nadal może pojawić się w miejscu użycia lokalizacji.

Suwak zachowuje wartości 0–2000 m, a jego ostatnia pozycja to „Bez limitu”. Wartość nieskończona jest obsługiwana przez silnik bez nieskończonego przeszukiwania siatki; obowiązuje czasowe okno wyszukiwania 6 godzin. Zastosowano kompaktową pamięć odległości i odrzucanie zdominowanych dojść przed tworzeniem ścieżek.

## Kafelki połączeń i przystanki na mapie

- Kafelki pokazują początkowy i końcowy przystanek połączone trzema punktami oraz liczbę przystanków pośrednich. Wspólny przystanek przesiadkowy liczy się raz; późniejszy powrót pozostaje osobną pozycją.
- Silnik zachowuje nazwane przystanki pośrednie przy łączeniu odcinków jednego kursu. Mapa pokazuje je jako małe punkty; początek ma większy okrągły znacznik, koniec większy znacznik kwadratowy.
- Dotknięcie punktu pokazuje tę samą pinezkę SVG co na głównej mapie oraz plakietkę z nazwą i rolą przystanku. Zaznaczenie jest zachowane po przełączeniu pełnego ekranu. Dotknięcie tła usuwa zaznaczenie.
- Portal pełnego ekranu ma jawne, nieprzezroczyste tło, nagłówek i legendę. Styl kafelków zależy od motywu także poza rodzicem `dark-mode-map`.
- Testy danych sprawdzają nazwy i kolejność przystanków, przesiadki i polskie etykiety liczby przystanków. Test przeglądarkowy obejmuje kropki, wyróżnione końce, wspólną pinezkę, nazwę, zachowanie zaznaczenia oraz identyczny filtr kafelków i nieprzezroczyste tło w obu motywach. Jest uruchamiany również w szybkim buildzie.
