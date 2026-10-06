# Poprawki z 5 października 2026

## Ładowanie i mapa

- Zakładka przystanków i jej indeksy są wczytywane dopiero po jej otwarciu.
- Pojazdy każdego przewoźnika pojawiają się po otrzymaniu jego danych. Wolniejsze źródło nie opóźnia pozostałych.
- PKS pobiera dwa źródła równolegle, a MPK zaczyna od bezpośredniego API.
- Zapytania mają limit czasu i reagują na przerwanie również przy natywnym HTTP Androida.
- Domyślna rejestracja urządzenia działa bez Cloud Functions. Istniejącą opcję zachowano pod `NEXT_PUBLIC_USE_IDENTITY_FUNCTION=true`, z limitem pięciu sekund.

## Administratorzy

- Zapis roli i profilu instalacji jest atomowy w obu formularzach edycji uprawnień.
- Można utworzyć brakujący profil starszego urządzenia przy zmianie roli lub blokady.
- Uproszczono sprawdzanie nadawanych uprawnień: wcześniejsze reguły przekraczały limit 1000 wyrażeń Firestore.
- Jawne odebranie uprawnienia ma pierwszeństwo przed dawnym polem `canBan`.
- Profil instalacji nie otrzymuje UID administratora zamiast UID urządzenia.
- Przy duplikatach instalacji panel wybiera aktualnie aktywne urządzenie.
- Zachowano role, operatorów, bany, odblokowanie, logi, weryfikację, ustawienia globalne i ograniczanie zakładek. Osobny ekran `/admin` jest także kopiowany do zasobów Androida.

**Wdrożenie:** poprawione reguły należy opublikować na Firebase:

```powershell
npx firebase deploy --only firestore:rules --project aplikacja-b20fa
```

Do tego potrzebne jest zalogowane konto z prawem publikowania reguł. Reguły przetestowano lokalnie w emulatorze; nie opublikowano ich na produkcji.

## Przystanki i odjazdy

- Dopasowanie obejmuje polskie znaki (w tym `ł`), skróty, identyczne nazwy bez GPS oraz kody `01` / `1`.
- Połączona pozycja zachowuje nazwę PKS i identyfikatory wszystkich przewoźników. Różne numery słupków i różne miejscowości pozostają rozdzielone.
- Każdy punkt PKS zachowuje własną parę ID zespołu i kodu słupka. Usunięto ryzyko przesunięcia tych par po deduplikacji osobnych list CSV.
- Grupowanie przystanków MPK wykorzystuje indeks nazw i współrzędnych zamiast porównywania każdej pary.
- Odjazdy Marcela uwzględniają miejscowość i wszystkie wystąpienia przystanku w kursie, z pominięciem przystanku końcowego.
- MPK wykorzystuje `departures.php`, czyli źródło używane przez tablicę przewoźnika. Jego prognoza ma pierwszeństwo przed szacowaniem z pojazdów.
- Rozkład MPK korzysta z `get_current_service.php` dla bieżącej daty i oficjalnego kalendarza GTFS ZTM dla kolejnych dni. Uwzględnia dni szkolne, soboty, niedziele i wyjątki świąteczne.
- Godziny odjazdów MPK i Marcela oraz planowe odjazdy PKS są przeliczane w strefie `Europe/Warsaw`, również dla godzin GTFS powyżej 23.

Źródło kalendarza: [oficjalny zbiór GTFS ZTM](https://otwartedane.erzeszow.pl/dataset/rozklady-jazdy-gtfs). Załączony kalendarz obowiązuje do 31 grudnia 2026. Przed kolejnymi wydaniami należy pobrać aktualny kalendarz:

```powershell
npm run update:mpk-calendar
```

## Weryfikacja

```powershell
npm test
npm run test:rules
npx tsc --noEmit
npm run android:sync
npm run android:build:debug
```

Testy obejmują kalendarz, godziny i zmianę czasu, łączenie przystanków, pierwszeństwo tablicy MPK, niezależne ładowanie przewoźników, przerwanie żądań, role i blokady w emulatorze Firestore. Porównanie bieżących danych przystanku MPK 1119 potwierdziło zgodność czterech wpisów tablicy ze źródłem aplikacji.

Nie wykonano pomiaru płynności na fizycznym telefonie ani testu z istniejącym produkcyjnym kontem właściciela.

## Dokończenie: niezależny rozkład przystanków, pełne trasy i przerwy

- Zakładkę przystanków przebudowano: katalog, pobieranie odjazdów, pamięć rozkładu i widok mają osobne moduły. Odpowiedź dla poprzedniego dnia lub przystanku nie zastępuje aktualnego wyboru. Automatyczne i ręczne odświeżanie korzystają z jednej kolejki.
- Plakietki PKS pochodzą z pełnego indeksu 1800 punktów, z rozróżnieniem kodów słupków. Nie zależą od widocznych autobusów i nie znikają, gdy chwilowo brakuje odpowiedzi. Baryczka 69 pokazuje linię 108 i jej rzeczywiste kursy z API PKS.
- Awaria przewoźnika jest wyświetlana jako błąd. Pozostałe źródła nadal działają, a ostatni poprawny rozkład pozostaje dostępny z informacją o nieudanym odświeżeniu. Nieaktualne prognozy są zastępowane godzinami planowymi.
- Przeglądarkowa wersja PKS korzysta z ograniczonego proxy we własnej domenie; Android korzysta z natywnego HTTP. Przywrócono odświeżanie oraz wybór widoczności minionych odjazdów.
- MPK korzysta z działającego strumienia pozycji `/ztm/new/api.php?type=mpk`; dawny `/mpk/vehicles_proxy.php` zwracał 404. Wiek pozycji wyznacza znacznik GPS `timestamp`, zamiast pola `is`, które może oznaczać czas oczekiwania. Pozostawiono obsługę dawnego formatu jako awaryjną.
- Trasy PKS i MPK mają osobne indeksy GTFS: 842 geometrie dla 10 045 kursów. Dokładna geometria przypisanego kursu ma pierwszeństwo; odświeżenie nie zastępuje jej przybliżeniem z innego przewoźnika. Zmiana kursu unieważnia poprzednią trasę.
- Wszystkie kropki przystanków trasy są rysowane także przy oddaleniu mapy. Nazwy i współrzędne MPK pochodzą z danych MPK. Pełny indeks PKS i kolejność punktów GTFS uzupełniają brakujące informacje w panelu PKS.
- Panel po kliknięciu autobusu pokazuje całą trasę. Kliknięcie przystanku używa identyfikatora i źródła właściwego przewoźnika.
- Marcel oraz kursy bez dostępnej geometrii GTFS korzystają z wyznaczania przebiegu po drogach przez wszystkie przystanki w ich kolejności, z zachowaniem pętli. Jest to trasa wyznaczona przez router; bez geometrii przewoźnika nie można potwierdzić każdego odcinka faktycznej trasy.
- Postój przed rozpoczęciem kursu na pierwszym przystanku, dworcu lub zgłoszona przerwa pokazują „Przerwa” i odliczanie do planowego startu, jeżeli jego czas jest znany. Postój na przystanku pośrednim nie jest przerwą między kursami. Ruch pojazdu i trwająca trasa okrężna nie są oznaczane jako przerwa.
- Poprawiono również źródła przystanków, strefę czasu i statusy w kodzie backendu MPK oraz statusy Marcela. Backend i reguły Firebase wymagają osobnego opublikowania; nie wdrożono ich na produkcji.

### Sprawdzenie końcowe

27 testów aplikacji i 6 testów backendu przeszło. TypeScript obu projektów kompiluje się poprawnie. Testy w Chrome potwierdziły odjazdy Baryczki, odporność na spóźnione odpowiedzi i błąd sieci, pełną trasę PKS z nazwami oraz bieżącą trasę MPK z kropkami i odliczaniem przerwy. Wcześniejsze 7 testów reguł Firestore również przeszło w emulatorze.

Indeksy można odnowić przed kolejnym wydaniem:

```powershell
npm run update:pks-lines
npm run update:bus-routes
npm run update:mpk-calendar
```

Nowy instalator: `../PKS-Live-przystanki-trasy-debug.apk` (18 674 922 bajty). Budowanie wersji produkcyjnej i Gradle `assembleDebug` zakończyły się powodzeniem. Po zbudowaniu wersji produkcyjnej ponownie przeszły trzy sprawdzenia przeglądarkowe: PKS, MPK i Baryczka. Sprawdzenie pliku APK potwierdziło obecność wszystkich 842 geometrii, zgodność nowych indeksów z plikami źródłowymi, nowy strumień MPK i ekran administratora. Test na fizycznym telefonie pozostaje do wykonania.

SHA-256 APK: `e01cb9581a63866fc62616f6e52c87672a0448ededeb86ebdd4e706e85138ec1`.

Zrzuty sprawdzonej wersji: [trasa PKS](test/screenshots/pks-route.png), [trasa MPK](test/screenshots/mpk-route.png), [Baryczka](test/screenshots/baryczka.png).

### Szybsza lista i uproszczenie panelu (5 października 2026)

- Pierwsze otwarcie listy PKS korzysta z pełnego indeksu dołączonego do aplikacji. Aktualizacja z endpointa odbywa się w tle i trafia także do otwartej listy.
- Panel autobusu korzysta z tego samego szybkiego indeksu nazw i współrzędnych PKS; pobranie pełnej listy trasy nie czeka już na odpowiedź endpointa wszystkich przystanków.
- Gotowy katalog połączonych przystanków jest zapisywany w IndexedDB razem ze źródłami PKS, MPK i Marcela, identyfikatorami i plakietkami linii. Cache jest dostępny po zamknięciu aplikacji i nie znika podczas aktualizacji ani po błędzie pobierania. W tej samej sesji gotowa lista jest również przechowywana w pamięci.
- Ponowne potwierdzenie niezmienionych danych odnawia czas ważności cache źródłowego, aby ograniczyć zbędne zapytania.
- Usunięto „Tylko nadchodzące” z panelu autobusu; panel zawsze pokazuje wszystkie przystanki. Z ekranu odjazdów usunięto etykietę „Rozkład jazdy”, przycisk odświeżania i panel minionych kursów. Odjazdy nadal aktualizują się automatycznie, a przyszłe dni i filtr linii pozostają dostępne.
- Przeszło 31 testów aplikacji, kontrola TypeScript oraz cztery sprawdzenia wersji produkcyjnej w Chrome: cache, Baryczka, trasa PKS i trasa MPK. Test z blokadą endpointa otworzył lokalną listę w 1042 ms; po restarcie, bez dostępu do danych przewoźników, katalog z cache pojawił się w 244 ms. Wyniki dotyczą testowego komputera; test telefonu pozostaje do wykonania.
- Nowy APK: `../PKS-Live-cache-przystankow-debug.apk`, 18 674 824 bajty. Kompilacja produkcyjna, synchronizacja Capacitor i `assembleDebug` przeszły. Zawartość APK potwierdza obecność trwałego cache, lokalnego indeksu i panelu admina oraz usunięcie wskazanych elementów.

SHA-256 nowego APK: `edd9e8886d14bcc21428abad9259be7335b3d5fb20b491d540556a1d7cf91df1`.
