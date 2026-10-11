# Pozycje przystanków na mapie

## Wybór pozycji

Znacznik, wybrany przystanek i punkty przystankowe na trasie korzystają ze wspólnej
reguły: ręcznie zweryfikowany punkt podkładu Google ma pierwszeństwo, następnie
jednoznacznie dopasowane, nazwane stanowisko OSM.
Bez takiego dopasowania używana jest oryginalna pozycja API danego przewoźnika.
Brak obu źródeł oznacza brak znacznika. Geometria tras nadal korzysta ze swoich
współrzędnych, niezależnie od pozycji ikony przystanku.

Katalog mapowy pochodzi z OpenStreetMap. Dopasowanie wymaga zgodnej nazwy,
zgodnego numeru stanowiska i odległości do 120 m od znanej pozycji przystanku.
Przy braku numeru musi istnieć tylko jeden pobliski punkt, do 40 m.
Niejednoznaczne dopasowania i przeciwne stanowiska nie są zgadywane.
Importer przyjmuje nazwane `public_transport=platform` oraz `highway=bus_stop`,
ale odrzuca drogowe `public_transport=stop_position`.

Surowe pozycje EINFO są zapisane osobno jako `apiLat`/`apiLon`, także w zasobach
offline, rekordach katalogu i przy wyborze przystanku z listy lub trasy.
Wartość `null` oznacza brak poprawnej pozycji źródłowej. Wersja 4 katalogu oraz
cache PKS v9 odrzucają starsze rekordy, które utraciły tę informację.
Odświeżenie mapowych stanowisk aktualizuje też widoczność znaczników przy
krawędziach widoku. Wyśrodkowanie mapy używa tej samej pozycji co znacznik.

## Kontrola katalogu — 2026-10-11

Ponowna kontrola obejmuje wszystkie 1800 wpisów dołączonego katalogu PKS,
formatowane tą samą funkcją co API i katalog offline:

| Wynik | Liczba |
| --- | ---: |
| Zweryfikowany punkt Google z potwierdzoną stroną drogi | 5 |
| Jednoznaczne stanowisko OSM | 1042 |
| Brak takiego dopasowania, poprawna pozycja API | 662 |
| Brak obu potwierdzonych pozycji | 91 |

## Korekta przypisań po zgłoszeniu strony drogi — 2026-10-11

Pierwsze przypisanie nienumerowanych punktów Google według odległości było błędne.
Punkt szkoły przenosił stanowisko 19 na stronę stanowiska 20. Punkt Gwoźnicy
Dolnej przenosił 12 na stronę 11. Różne identyfikatory nie chroniły przed
wspólną stroną drogi; wcześniejsze testy sprawdzały tylko zachowanie ID i kodów.

Sprawdzono wszystkie sześć ostatnich punktów względem osi lokalnych dróg OSM:

| Punkt Google | Wynik sprawdzenia | Działanie |
| --- | --- | --- |
| Gwoźnica Dolna, 49.8375014 / 21.9552742 | Po stronie stanowiska 11, mimo że 12 jest bliższe | Przypisano do 10688 / 11; 10689 / 12 zachowuje własny punkt |
| Gwoźnica Górna Szkoła, 49.8298081 / 21.9977151 | Po przeciwnej stronie drogi niż stanowisko 19; brak numeru Google | Odrzucono zmianę; 10695 / 19 i 10694 / 20 pozostają przy własnych OSM/API |
| Gwoźnica Górna SKR | Ta sama strona co 13; różnica 1,6 m | Zachowano punkt Google |
| Gwoźnica Górna Pętla | Ta sama strona co 24; różnica 1,7 m | Zachowano punkt Google |
| Gwoźnica Górna Sklep | Ta sama strona co 15; różnica 1,5 m | Zachowano punkt Google |
| Konieczkowa Szkoła, kierunek Gwoźnica | Ta sama strona co 08; różnica 1,0 m | Zachowano punkt Google |

Stanowisko szkoła 19: 49.8300183, 21.9977235 (OSM/GTFS),
49.829998, 21.997718 (API). Stanowisko 20: 49.8306762, 21.9966906 (OSM/GTFS).
Stanowisko 19 jest po stronie szkoły, 20 po przeciwnej stronie.
Nienumerowany punkt Google przy sklepie nie dowodzi nowej lokalizacji stanowiska.

`lib/reviewed-map-platforms.json` przechowuje pięć dopuszczonych punktów,
odrzucony punkt szkoły oraz odcinki osi drogi i linki źródłowe OSM.
Resolver dla tego rejestru wymaga teraz zgodnej nazwy/kodu, odległości do 120 m
oraz pozycji po tej samej stronie zweryfikowanego odcinka drogi.
Brak takiego odcinka lub położenie na osi/przeciwnej stronie odrzuca korektę.
Wówczas używane jest zgodne numerowane stanowisko OSM, a bez niego oryginalne API.
Rejestr działa offline; sprawdzanie strony drogi nie wymaga pobierania mapy.

Osie dróg sprawdzono z bieżącego eksportu API OSM. To kontrola ostatnich sześciu
korekt, nie pełna weryfikacja stron drogi dla wszystkich 1800 przystanków.
Geometria tras i identyfikatory rozkładów pozostają niezależne od pozycji ikon.

Źródła kontroli:

- http://einfo.zgpks.rzeszow.pl/api/stop-point
- https://www.mpkrzeszow.pl/gtfs-pks/latest.zip
- https://www.openstreetmap.org/node/560728906 (stanowisko 11)
- https://www.openstreetmap.org/node/13049729714 (stanowisko 12)

Regresje: `test/stop-platform-position.test.cjs`. Testują pięć dopuszczonych
punktów Google, odrzucenie przejścia przez drogę, przeciwne strony 11/12 i 19/20
oraz pierwszeństwo punktu
mapowego, powrót do API, brak GPS, dane offline, odświeżenie źródła, zachowanie
identyfikatorów oraz filtrowanie widoku według pozycji widocznego znacznika.
