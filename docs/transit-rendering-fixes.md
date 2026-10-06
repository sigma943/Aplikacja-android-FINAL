# Trasy, przystanki i płynność

- Panel autobusu pokazuje następne przystanki w kolejności kursu, bez wcześniejszych.
  Kropki przystanków na mapie używają tej samej listy dla MPK, PKS i Marcela.
  Pełna linia trasy pozostaje dostępna; przystanek występujący ponownie na pętli
  nie znika z dalszej części kursu. Panel pociągu zachowuje całą relację.
- Lista pozycji Marcela nie pobiera rozkładu dla każdego pojazdu. Pełne dane trasy
  są pobierane dla wybranego kursu. Anulowane żądania geometrii nie są współdzielone
  z nową próbą. Pamięć podręczna przechowuje tylko zakończone trasy.
- Przy niedostępnym routingu mapa Marcela pokazuje przerywaną linię przez znane
  przystanki z podpisem „Trasa przybliżona przez przystanki”. Po udanym routingu
  zastępuje ją przebieg po drogach. Przybliżenie nie jest zapisywane jako trasa drogowa.
- Warstwa pojazdów nie przebudowuje się przy każdym odświeżeniu zegara panelu.
  Już przy ponad 35 pojazdach pomija znaczniki poza widocznym obszarem mapy.
  Pozycja nieruchomego znacznika nie jest ponownie ustawiana w Leaflet.
- MPK: odjazd podany jako HH:mm pozostaje widoczny przez całą tę minutę jako
  „<1 min”. Flagi tablicy is_past i at_stop są zachowane. Zegar odliczania
  aktualizuje się co sekundę, a dane co 10 sekund. Tablica i rozkład tego samego
  kursu są scalane również przy różnicy dokładności HH:mm / HH:mm:ss.
- PKS: opóźnienie z pola deviation jest odczytywane także bez numeru pojazdu,
  włącznie z różnicą jednej minuty. Podany czas rzeczywisty ma pierwszeństwo
  przed przesunięciem minutowym, więc opóźnienie nie jest naliczane dwukrotnie.
- Marcel: dostępne opóźnienie lub czas rzeczywisty mają pierwszeństwo.
  Przy ich braku pozycja GPS aktywnego kursu pozwala oszacować przesunięcie
  względem rozkładu. Takie wartości mają podpis „szac.”; pozycje nieaktualne,
  odległe od trasy oraz sprzed początku kursu nie są używane. Jedno pobranie
  pozycji jest współdzielone przez kursy przystanku. Brak danych nie tworzy prognozy.

## Sprawdzenie po instalacji nowego APK

1. Wybierz Marcela: przystanki i linia trasy mają pojawić się; podpis przybliżenia
   ma zniknąć po udanym pobraniu geometrii drogowej.
2. Przełącz szybko kilka autobusów i wróć do pierwszego. Trasa ma nadal się ładować.
3. Wybierz autobus MPK, PKS i Marcel w połowie kursu: panel i kropki na mapie
   mają zawierać tylko dalsze przystanki, zachowując przyszły powrót na pętli.
4. Otwórz przystanek MPK tuż przed odjazdem: sprawdź „1 min”, „<1 min” i zniknięcie
   kursu, który źródło oznaczyło jako odjechany.
5. Sprawdź przesuwanie i powiększanie mapy z wieloma pojazdami na docelowym telefonie.
6. Otwórz przystanki PKS i Marcela z aktywnymi kursami: sprawdź opóźnienia,
   oznaczenie „szac.” dla prognozy z GPS i brak prognozy przy braku danych.

Testy automatyczne weryfikują granice minut, flagi tablicy, kolejność przystanków,
100 pojazdów Marcela bez 100 pobrań tras oraz anulowanie i powtórne pobranie geometrii.
Płynność na konkretnym Androidzie i zgodność z fizyczną tablicą wymagają próby na miejscu;
prognozy zależą od danych operatora i momentu ich aktualizacji.
