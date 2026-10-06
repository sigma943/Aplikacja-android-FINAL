# Nazwy urządzeń i mapa

Nazwy handlowe pochodzą z publicznego katalogu urządzeń Google Play:
https://storage.googleapis.com/play_public/supported_devices.csv

Katalog `public/device-models.json` jest pakowany do APK i ładowany tylko po
otwarciu panelu administratora. Obsługuje telefony i tablety różnych marek,
w tym kod 2510DPC44G jako POCO F8 Pro. Nie wysyła informacji o urządzeniach
do zewnętrznego serwisu. Metadane zawierają datę pobrania i SHA-256 źródła.

Aktualizacja: `node scripts/update-device-models.mjs`.
Opcjonalny argument to ścieżka do lokalnego pliku CSV Google.
Nieznane i niejednoznaczne kody pozostają nazwami technicznymi.
Alias administratora i indywidualna nazwa urządzenia mają pierwszeństwo.
Katalog Androida nie pozwala odgadnąć dokładnego modelu iPhone'a, jeżeli
system przekazuje tylko nazwę „iPhone”.

Na wąskich ekranach przyciski karty urządzenia zajmują osobny wiersz,
więc nazwa może się zawinąć zamiast zniknąć między ikonami.

Mapa zachowuje obecne ikony i grupowanie. Przesunięcia znaczników Leaflet
są wykonywane partiami do 64 pozycji lub 6 ms na klatkę. Nowe dane anulują
niedokończoną partię; interakcja z mapą wstrzymuje aktualizacje do jej zakończenia.
Niezmienione grupy zachowują pozycję i obsługę kliknięć, a zdarzenia zoomend
i moveend są scalane w jedno odświeżenie. Testy sprawdzają kolejność 1000
aktualizacji, limit pracy w klatce, anulowanie i pauzę.

Po instalacji sprawdź nazwy urządzeń i zawijanie tekstu na małym ekranie.
Płynność przesuwania i powiększania mapy trzeba potwierdzić na docelowym
telefonie z dużą liczbą pojazdów; test kolejki nie jest pomiarem FPS.
