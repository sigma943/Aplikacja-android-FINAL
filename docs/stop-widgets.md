# Widżety w wersji 2.4

Okno tworzenia ma nieprzezroczyste tło, podgląd rozmiaru i motywu oraz stale widoczny przycisk dodawania. Nie ma górnego uchwytu ani X. Anuluj, przycisk Wstecz i dotknięcie tła zamykają okno z animacją; ograniczenie animacji w ustawieniach systemowych jest respektowane. Usuwanie widżetu z ekranu głównego i jego animację obsługuje launcher Androida. Aplikacja usuwa konfigurację i anuluje zadania, gdy ostatni widżet zostanie usunięty.

Mały widżet ma osobny układ: mniejszy nagłówek, pełny wiersz odjazdu i brak stopki, jeśli zabrakłoby miejsca. Większe rozmiary pokazują kierunki i czas aktualizacji. Liczba pełnych wierszy wynika z faktycznej wysokości przekazanej przez launcher. Godziny HH:mm nie stają się nieprawidłowym odliczaniem między pobraniami.

Każdy widżet zapisuje częstotliwość 15, 30, 60 lub 120 minut (domyślnie 30) oraz tryb: pauza w oszczędzaniu baterii (domyślnie), włączone również w oszczędzaniu baterii albo wyłączone — tylko ręczne odświeżanie. Starsze konfiguracje otrzymują wartości domyślne. Pierwsze pobranie po utworzeniu jest dozwolone również w trybie ręcznym, aby od razu wyświetlić odjazdy.

Jedno wspólne zadanie JobScheduler używa najkrótszego aktywnego interwału. Każdy widżet jest sprawdzany osobno: zapisany interwał, ostatnia udana aktualizacja, ostatnia próba i tryb oszczędzania energii. Nieudana próba nie powoduje częstych ponowień. Wyłączenie wszystkich automatycznych aktualizacji anuluje zadanie okresowe. `updatePeriodMillis=0` zapobiega drugiemu cyklowi. Nie ma alarmu minutowego, dokładnych alarmów, własnego wake locka ani stałej usługi. System może odroczyć pracę podczas uśpienia lub ograniczeń baterii.

Widżety pobierają rozkład konkretnego przystanku, bez całej floty. Kilka widżetów tego samego przystanku współdzieli odpowiedź w danym zadaniu; filtrowanie linii odbywa się przy renderowaniu. Zadanie trwa najwyżej dwie minuty, pojedynczy przystanek 75 sekund, a aktywne są najwyżej dwa połączenia HTTP. Zatrzymanie zamyka WebView i połączenia, bez natychmiastowego ponowienia. Najdawniej próbowane przystanki mają pierwszeństwo w następnym zadaniu.

Przycisk ↻ dotyczy jednego widżetu i ma limit jednej próby na minutę. Otwarta aplikacja może przekazać pobrane już odjazdy, respektując interwał i tryb automatycznego odświeżania. Zmiana rozmiaru lub motywu odczytuje zapisane lokalnie dane i nie pobiera rozkładu. Instalacja nowszego APK anuluje stary alarm minutowy i aktualizuje harmonogram.
