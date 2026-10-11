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
| Zweryfikowany punkt Google | 6 |
| Jednoznaczne stanowisko OSM | 1041 |
| Brak takiego dopasowania, poprawna pozycja API | 662 |
| Brak obu potwierdzonych pozycji | 91 |

Podkład aplikacji jest mapą Google. Link użytkownika wskazuje dokładnie
49.8375014, 21.9552742. Wyniki wyszukiwania na tej mapie ujawniły sześć
nazwanych punktów w Gwoźnicy i przy szkole w Konieczkowej. Każdy porównano
z oboma stanowiskami API/GTFS i przypisano do najbliższego zgodnego przystanku.
Numer w poniższej tabeli pochodzi z katalogu PKS; nienumerowany punkt Google
nie jest podstawą do przesunięcia przeciwnego kierunku.

| Stanowisko PKS | ID | Punkt Google | Różnica względem OSM/GTFS | Odległość drugiego stanowiska od Google |
| --- | --- | --- | ---: | ---: |
| Gwoźnica Dolna 12 | 10689 | 49.8375014, 21.9552742 | 21,2 m | 48,5 m (11) |
| Gwoźnica Górna, Szkoła 19 | 10695 | 49.8298081, 21.9977151 | 23,4 m | 121,3 m (20) |
| Gwoźnica Górna, SKR 13 | 10672 | 49.8409866, 21.974979 | 1,6 m | 35,2 m (14) |
| Gwoźnica Górna 24 / Pętla | 10671 | 49.8175507, 22.0029508 | 1,7 m | brak w promieniu 150 m |
| Gwoźnica Górna, Sklep 15 | 10669 | 49.8370121, 21.9886287 | 1,5 m | 16,2 m (16) |
| Konieczkowa, Szk. 08 / kierunek Gwoźnica | 11028 | 49.8417995, 21.9255925 | 1,0 m | 93,3 m (07) |

Dwa znaczniki były przesunięte o ponad 20 m. Pozostałe cztery zgadzały się
z dokładnością do 2 m; wszystkie sześć teraz używa dokładnej pozycji Google.
Rejestr `lib/reviewed-map-platforms.json` przechowuje pełne zaobserwowane linki
źródłowe i datę sprawdzenia, oddzielnie od danych/licencji OSM.
Pierwszeństwo działa także offline i przed zakończeniem pobierania katalogu OSM.
Dopasowanie wciąż wymaga nazwy, numeru stanowiska i odległości do 120 m.
Stanowiska 11 i 20 zachowują swoje odrębne pozycje. Geometria tras i identyfikatory
rozkładów nie są zmieniane.

Kontrola całego katalogu potwierdza wybór źródła i bezpieczny powrót do API.
Nie oznacza ręcznej weryfikacji wszystkich 1800 punktów na podkładzie Google
ani potwierdzenia wszystkich lokalizacji w terenie.

Źródła kontroli:

- http://einfo.zgpks.rzeszow.pl/api/stop-point
- https://www.mpkrzeszow.pl/gtfs-pks/latest.zip
- https://www.openstreetmap.org/node/560728906 (stanowisko 11)
- https://www.openstreetmap.org/node/13049729714 (stanowisko 12)

Regresje: `test/stop-platform-position.test.cjs`. Testują sześć źródłowych
punktów Google, odrębność kierunków 11/12 i 19/20 oraz pierwszeństwo punktu
mapowego, powrót do API, brak GPS, dane offline, odświeżenie źródła, zachowanie
identyfikatorów oraz filtrowanie widoku według pozycji widocznego znacznika.
