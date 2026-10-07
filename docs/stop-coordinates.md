# Współrzędne fizycznych przystanków

Katalog E-INFO PKS zawiera przybliżone pozycje. Na przykład Konieczkowa, Szk. 08 (ID 11028) wskazywała 49.842648, 21.925345 zamiast pozycji GTFS 49.8418003, 21.925578. Strona referencyjna i eksport https://www.mpkrzeszow.pl/gtfs-pks/latest.zip zawierają osobne stanowiska 07 i 08 przy szkole.

Zaktualizowano cały katalog: 1135 jednoznacznie dopasowanych stanowisk, w tym 597 różniących się od API o ponad 10 m. Dopasowanie używa nazwy/miejscowości oraz kodu stanowiska, z rozwinięciem typowych skrótów. Gdy GTFS podaje samą miejscowość, kod musi być unikalny po obu stronach, a odległość najwyżej 250 m. Odrzucane są dopasowania niejednoznaczne i przesunięcia powyżej 2 km. Nie przesuwamy punktów na najbliższą drogę ani nie zgadujemy przeciwnego stanowiska.

Pozycje zweryfikowane oznacza `coordinateSource: gtfs`. Odświeżenie sieciowe zachowuje je tylko przy zgodnym technicznym ID, obszarze i kodzie. Nazwy, identyfikatory rozkładów i godziny pozostają z API. Dla 665 punktów bez jednoznacznego odpowiednika zachowano współrzędne źródłowe; eksport nie pozwala rzetelnie potwierdzić ich pozycji.

Mapa buduje katalog fizycznych punktów z surowych danych, także po zdarzeniu aktualizacji i odczycie pamięci. Nie używa scalonych pozycji listy. Łączenie przewoźników na mapie wymaga zgodnej nazwy/numeru i odległości najwyżej 8 m; odrębne identyfikatory MPK zachowują osobne stanowiska. Zmieniona wersja pamięci katalogu i cache PKS usuwa stare pozycje przy aktualizacji aplikacji.

Aktualizacja współrzędnych: `node scripts/update-stop-coordinates.mjs`. Do odtwarzalnego przebiegu można przekazać `--points <plik-json-api>` i `--gtfs <plik-zip>`. Aktualizacja zasobów tras również zapisuje zweryfikowane pozycje. Wersja aplikacji pozostaje 2.4, kod Androida wynosi 241, aby APK mogło zastąpić wcześniejszy build 240.
