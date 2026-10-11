# Pozycje przystanków na mapie

## Wybór pozycji

Znacznik, wybrany przystanek i punkty przystankowe na trasie korzystają ze wspólnej
reguły: jednoznacznie dopasowane, nazwane stanowisko mapowe ma pierwszeństwo.
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

Porównanie obejmuje 1800 wpisów PKS oraz dołączony katalog nazwanych stanowisk OSM:

| Wynik | Liczba |
| --- | ---: |
| Jednoznaczne stanowisko mapowe | 1042 |
| Brak takiego dopasowania, poprawna pozycja API | 667 |
| Brak obu potwierdzonych pozycji | 91 |

W 649 dopasowaniach pozycja mapowa różni się od API o ponad 10 m. To różnica
między źródłami, nie dowód błędu w terenie. Wszystkie 13 wpisów Gwoźnicy Dolnej
i Górnej znajdują jednoznaczne stanowiska w katalogu OSM.

Gwoźnica Dolna ma dwa osobne stanowiska:

| Stanowisko | ID PKS | Pozycja OSM / GTFS | Pozycja API |
| --- | --- | --- | --- |
| 11 | 10688 | 49.8373085, 21.9558807 | 49.837319, 21.955843 |
| 12 | 10689 | 49.8373126, 21.9552326 | 49.837199, 21.955690 |

Podkład aplikacji jest mapą Google. Widoczny na zgłoszonym zrzucie punkt
„Przystanek Gwoźnica Dolna” nie jest tym samym źródłem co katalog OSM i nie ma
na zrzucie numeru stanowiska. Do przypisania jego położenia do konkretnego ID
potrzebny jest dokładny link do punktu Google i potwierdzenie właściwego stanowiska.
Nie przeniesiono obu kierunków na jeden nienumerowany punkt.

Źródła kontroli:

- http://einfo.zgpks.rzeszow.pl/api/stop-point
- https://www.mpkrzeszow.pl/gtfs-pks/latest.zip
- https://www.openstreetmap.org/node/560728906 (stanowisko 11)
- https://www.openstreetmap.org/node/13049729714 (stanowisko 12)

Regresje: `test/stop-platform-position.test.cjs`. Testują pierwszeństwo punktu
mapowego, powrót do API, brak GPS, dane offline, odświeżenie źródła, zachowanie
identyfikatorów oraz filtrowanie widoku według pozycji widocznego znacznika.
