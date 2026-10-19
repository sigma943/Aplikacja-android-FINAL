# Weryfikacja renderowania tras — 19.10.2026

## Naprawa

- Gotowy, zweryfikowany przebieg przewoźnika ma pierwszeństwo przed pamięcią RAM i pamięcią trwałą. Trasa wyznaczona przez router mogła przechodzić przez wszystkie przystanki, ale prowadzić innymi ulicami; poprzednio taka zapisana trasa blokowała wykorzystanie gotowego przebiegu.
- Zmiana kursu wymusza ponowny wybór oficjalnej geometrii, również dla tego samego pojazdu i współrzędnych przystanków. Pamięć zapasowej geometrii nadal może być współdzielona.
- Trzy warstwy trasy używają wspólnego renderera SVG, niezależnie od odświeżania i przycinania warstw Canvas. Pozostałe warstwy mapy zachowują Canvas. Wczesne zrzuty przez DevTools były nieaktualne przy otwartej zasłonie powiadomień emulatora; nie stanowią dowodu błędu Canvas w aplikacji. Końcową kontrolę wizualną wykonano również ze zrzutu rzeczywistego ekranu Androida.
- Wersja pamięci tras została zmieniona na `road-v14-authoritative-shapes`; nie trzeba ręcznie czyścić danych aplikacji.

## Dane i testy

Rzeczywisty zapis PKS 301: pojazd 37, kurs 7807, kierunek Rzeszów D.A., 21 przystanków, gotowa geometria 67 (638 punktów). Zapis źródłowy znajduje się w `test/fixtures/pks-301-37-2026-10-19.json`.

Test regresji celowo dodaje do zapisanej trasy objazd. Zmieniona trasa nadal przechodzi dotychczasową kontrolę wszystkich przystanków, co odtwarza problem z pierwszeństwem pamięci podręcznej.

- 23/23 testy związane z naprawą: wybór źródła, zmiana kursu, obsługa offline, PKS 202, 312, 314, pętle, kolejność przystanków, ponawianie i pamięć.
- Test przeglądarkowy `node test/route-style-browser.cjs`: poprawny ciągły przebieg SVG nad obrysem, również przy `preferCanvas`, powtarzane ładowanie i zmiany pojazdu.
- Test przeglądarkowy pełnego interfejsu z kontrolowanymi danymi `node test/mpk-route-browser.cjs`: przebiegi MPK 0A i 51, przystanki, odliczanie postoju, prognozy odjazdów i brak niepotrzebnego przerysowywania trasy przy zmianach zegara. Środowisko testowe używa zastępczego kontekstu logowania.
- Produkcyjna budowa Next.js sprawdza TypeScript; budowa Androida: `assembleDebug`.

## Ograniczenia pełnego zestawu

Pełny zestaw jednostkowy: 424/428. Cztery błędy dotyczą istniejących testów niezmienianych modułów:

1. `apk-signing.test.cjs`: Windows zwraca uprawnienia pliku 0666 zamiast oczekiwanych uniksowych 0600.
2. `bus-routes.test.cjs`: odrzucanie niepełnej listy przystanków PKS.
3. `bus-routes.test.cjs`: analogiczny przypadek dla PKS 251.
4. `road-route-quality.test.cjs`: test oczekuje dwóch wywołań routera, a współdzielona pamięć fragmentów powoduje jedno.

ESLint nowych modułów i zmienionego `RouteLines` przechodzi. Istniejący `BusMap.tsx` ma nadal wcześniejsze zgłoszenia reguł React dotyczące memoizacji, odczytu ref podczas renderowania, `Date.now()` i ustawiania stanu w efekcie.

## Android

APK jest instalowany na emulatorze `Medium_Phone`, Android 17, x86_64. Pełny start z produkcyjnym serwerem zatrzymuje się na komunikacie „Nowe logowania są wyłączone. Administrator musi zatwierdzić Twoje urządzenie”. Ustawienia dostępu nie były zmieniane.

Osobny test mapy używa modułów JavaScript wyjętych z gotowej budowy produkcyjnej, w WebView zainstalowanej aplikacji. Test nie uruchamia chronionych ekranów ani nie zmienia uprawnień. Sprawdza błędną geometrię zapisaną w IndexedDB/localStorage, rzeczywistą trasę 301 i zmianę kursu 7807 → 7817 przy niezmienionych przystankach.

Wynik: oba scenariusze przeszły. Kurs 7807 wyrenderował 638 właściwych punktów, a kurs 7817 — 640. Potwierdzono zgodność bajtów testowanego modułu mapy z modułem w APK. Sprawdzono również rzeczywisty zrzut ekranu emulatora z widoczną trasą i przystankami na drogach.

Logi i zrzuty ekranów są zapisane lokalnie w `.local/route-investigation/`.
