# Uruchomienie konserwacji

APK i kod na GitHubie nie wdrażają automatycznie funkcji Firebase. Nowy panel wymaga funkcji i reguł z tego repozytorium w projekcie `aplikacja-b20fa`.

## Wdrożenie z komputera

W katalogu repozytorium uruchom:

```sh
npm ci
npm --prefix functions ci
npm --prefix functions test
npx firebase login
npx firebase deploy --project aplikacja-b20fa --only functions:initializeMaintenance,functions:saveMaintenanceEndpoint,functions:testMaintenanceEndpoint,functions:setActiveMaintenanceEndpoint,functions:disableMaintenanceEndpoint,functions:rollbackMaintenanceEndpoint,functions:transportGateway,firestore:rules
```

Alternatywnie dodaj w ustawieniach sekretów GitHub repozytorium `FIREBASE_SERVICE_ACCOUNT_JSON`, zawierający klucz konta usługowego tego projektu z uprawnieniami do wdrażania Firebase. Następnie w Actions uruchom ręcznie **Deploy Firebase maintenance** dla gałęzi `main`. Nie wklejaj klucza do czatu ani kodu repozytorium.

## Działanie panelu

- Pierwsze połączenie zapisuje domyślny endpoint. Brak testu pokazuje „Nie testowano”.
- „Dodaj” otwiera pusty formularz. Zapis zwraca identyfikator nowego endpointu i zaznacza go.
- Test sprawdza HTTPS, odpowiedź JSON `/health/providers`, listę przewoźników i czas odpowiedzi. Sama odpowiedź HTTP 200 z dowolnej strony nie wystarczy.
- Aktywacja najpierw testuje zapisany adres. Dopiero poprawny wynik pozwala jednocześnie zmienić aktywny endpoint, poprzedni endpoint i konfigurację aplikacji.
- Aktywnego adresu nie można wyłączyć ani zmienić podczas pracy. Utwórz i przetestuj nowy endpoint, a następnie go aktywuj.
- Rollback ponownie testuje poprzedni endpoint przed przełączeniem.
- Historia i dziennik admina zapisują wykonane operacje.
- Konfiguracja dotyczy API pojazdów, szczegółów pojazdów i geometrii tras. Rozkłady przystankowe nadal pochodzą od przewoźników.
- Nowy wybór dociera do zalogowanych aplikacji przez `admin_settings/transport_runtime`. Zapytania do niestandardowego API przechodzą przez bramkę Firebase, która używa aktywnego adresu; nie wymagają ustawienia CORS na serwerze zapasowym. Gdy włączysz fallback, niedostępność wybranego API pozwala użyć danych przewoźnika. Bez fallback błąd wybranego API nie jest zamieniany na sukces.

Po wdrożeniu otwórz Konserwację jako właściciel lub administrator z prawem edycji ustawień globalnych. Wykonaj test, dodaj zapasowy endpoint zgodny z API aplikacji, aktywuj go i sprawdź mapę na drugim urządzeniu. Potem użyj przywracania poprzedniego endpointu.
