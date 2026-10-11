# Jasionka, Stawy 02 — kontrola położenia i scalenia

Sprawdzenie źródeł: 2026-10-11. Baza zmian: `e9dd570`.

## Potwierdzony błąd

EINFO PKS zwraca dla ID **3801**, obszaru **1946**, stanowiska **02**
(`JASIONKA, STAWY`) współrzędne **50.035257, 21.994693** w Rzeszowie.
Oficjalny eksport GTFS PKS wskazuje dla `Jasionka stawy 02`, ID **1758**,
pozycję **50.1172763, 22.0486789** w Jasionce. Odległość wynosi około **9900 m**.
Te same współrzędne zawiera dołączony katalog peronów OSM.

Źródła:

- EINFO: http://einfo.zgpks.rzeszow.pl/api/stop-point
- GTFS PKS: https://www.mpkrzeszow.pl/gtfs-pks/latest.zip (`stops.txt`)
- Platforma OSM: https://www.openstreetmap.org/node/13624663013
- Minimalny zapis danych do odtworzenia: `test/fixtures/jasionka-stawy-coordinates.json`.

Dotychczasowy limit dopasowania GTFS (2 km) odrzucał poprawną pozycję, pozostawiając
błędną pozycję API. Dodatkowo przecinek po `Jasionka` uniemożliwiał wykrycie
konfliktu miejscowości. Katalog scalał PKS 3801 z MPK **246 — Mochnackiego 02**,
co tłumaczy linie 10 i 35 oraz położenie znacznika na zrzucie.

## Zakres kontroli

Porównano wszystkie **1800** wpisów EINFO z **1825** przystankami w pobranym GTFS.
Przed poprawką: 1164 jednoznaczne dopasowania, 633 bez dopasowania, 2 niejednoznaczne,
1 odrzucone z powodu odległości ponad 2 km — właśnie PKS 3801.
Po uwzględnieniu sprawdzonego wyjątku: **1165** dopasowań, **0** odrzuceń odległościowych.
W pozostałych jednoznacznie dopasowanych wpisach dołączonego katalogu nie znaleziono
różnic względem pobranego GTFS większych niż 250 m.

To kontrola porównawcza danych, a nie potwierdzenie położenia każdego przystanku
w terenie. **635 wpisów nadal nie ma jednoznacznego potwierdzenia tą metodą**;
brak dopasowania sam w sobie nie dowodzi błędu. Kontrola nie obejmuje wszystkich
przystanków innych przewoźników. Porównanie grup pełnych dołączonych katalogów
PKS i MPK przed i po poprawce zmienia tylko grupę 3801/246.

## Poprawka i zabezpieczenia

- Poprawiona pozycja w katalogu dostarczanym z aplikacją.
- Wspólny, jawny wyjątek dla generatorów i korekty starych surowych rekordów:
  `lib/pks-coordinate-overrides.json`. Wymaga zgodności ID, obszaru, kodu, nazwy
  oraz znanej błędnej pozycji; generatory sprawdzają też ID i pozycję GTFS.
  Ogólny limit 2 km pozostaje bez zmian.
- Poprawione rozpoznawanie nazw miejscowości z interpunkcją przed scalaniem.
- Wersja 3 cache katalogu odrzuca zapisane błędne scalenia; dane źródłowe są
  ponownie łączone. Identyfikatory rozkładów i numer stanowiska pozostają bez zmian.
- Tryb `--audit` nie zapisuje katalogu. Wypisuje liczby i odległe dopasowania,
  kończąc się kodem 1, jeśli wymagają przeglądu. Generator współrzędnych również
  odmawia zapisu przy takich niezweryfikowanych dopasowaniach.

Kontrola bieżących danych:

```sh
node scripts/update-stop-coordinates.mjs --audit
```

Kontrola zapisanych źródeł bez pobierania:

```sh
node scripts/update-stop-coordinates.mjs --audit --points stop-point.json --gtfs latest.zip
```

Testy regresji obejmują pozycję startową, odświeżenie z API, korektę cache,
rozdzielenie przystanków na mapie i liście, brak przejęcia odjazdów MPK,
interpunkcję nazw miejscowości, ponowne użycie ID i zabezpieczenia generatorów.
