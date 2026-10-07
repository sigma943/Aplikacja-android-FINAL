# Odświeżanie widżetów i zużycie baterii

Widżety używają jednego wspólnego zadania JobScheduler co około 30 minut, z oknem pozwalającym Androidowi połączyć je z inną pracą. Launcher ma `updatePeriodMillis=0`, więc nie uruchamia drugiego cyklu. Nie ma alarmu co minutę, dokładnych alarmów, własnego wake locka ani stałej usługi. Widżet pokazuje godziny HH:mm oraz czas ostatniej aktualizacji, żeby zapisane odliczanie nie stawało się nieprawidłowe między pobraniami.

Automatyczne pobieranie wymaga sieci, na Androidzie 8+ także baterii poza stanem niskiego poziomu. Tryb oszczędzania energii pomija automatyczne zadania. Zatrzymane zadanie nie żąda natychmiastowej ponownej próby. Świeże dane z ostatnich 15 minut nie są pobierane ponownie w zadaniu okresowym.

Widżet pobiera rozkład konkretnego przystanku, bez całej floty pojazdów. Kilka konfiguracji tego samego przystanku współdzieli odpowiedź w danym zadaniu; filtrowanie linii odbywa się przy renderowaniu. Zadanie ma limit dwóch minut, pojedynczy przystanek 75 sekund i najwyżej dwa równoległe połączenia HTTP. Po zakończeniu lub anulowaniu WebView i aktywne połączenia są zamykane. W następnym zadaniu pierwszeństwo mają najdawniej próbowane przystanki.

Ręczne odświeżanie dotyczy wybranego widżetu i ma limit jednej próby na minutę. Otwarta aplikacja przekazuje już pobrane odjazdy bez dodatkowego zapytania sieciowego, najwyżej raz na minutę dla każdego widżetu. Zmiana rozmiaru i motywu renderuje dane zapisane lokalnie.

Instalacja nowszego APK anuluje alarm minutowy starszej wersji i zastępuje starszy harmonogram. Usunięcie ostatniego widżetu anuluje oba identyfikatory zadań.
