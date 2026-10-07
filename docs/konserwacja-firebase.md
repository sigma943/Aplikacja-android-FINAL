# Konserwacja na planie Spark

Panel korzysta z Firestore, Firebase Authentication i HTTP z aplikacji. Nie wymaga wdrażania Cloud Functions, bramki transportGateway ani przechodzenia na plan Blaze.

## Jednorazowe opublikowanie reguł

W katalogu repozytorium:

```sh
npm ci
npx firebase login
npx firebase deploy --project aplikacja-b20fa --only firestore:rules
```

Nie uruchamiaj poprzedniej komendy `--only functions:...` — wdrażanie funkcji wymaga Blaze. Sama instalacja nowego APK nie publikuje reguł. Bez aktualnych reguł zapis konserwacji zostanie odrzucony.

Alternatywnie dodaj sekret repozytorium `FIREBASE_SERVICE_ACCOUNT_JSON` dla projektu `aplikacja-b20fa`, a w GitHub Actions uruchom **Deploy Firestore rules (Spark)** na `main`. Workflow publikuje wyłącznie reguły. Nie wklejaj klucza do czatu ani repozytorium.

## Działanie

Właściciel i administrator z `globalSettingsEdit` zapisują endpointy, testy, aktywację, wyłączenie i historię. Administrator z `globalSettings` może odczytywać konfigurację i testować połączenie bez zapisywania wyniku. Zwykły użytkownik ani zablokowane urządzenie nie mogą zmieniać konfiguracji. Reguły sprawdzają role niezależnie od interfejsu.

Konfiguracja aktywnego endpointu, poprzedniego endpointu i adres używany przez aplikacje zmieniają się w jednej transakcji. Zmiana adresu usuwa stary wynik testu. Nie można wyłączyć aktywnego endpointu. Aktywacja oraz przywrócenie ponownie sprawdzają adres; nieudany test nie przełącza aplikacji. Historia jest dopisywana, bez możliwości nadpisywania.

Test wykonuje rzeczywiste żądanie HTTPS `/health/providers` i sprawdza odpowiedź JSON z mapą przewoźników. W Androidzie działa przez natywne HTTP. W przeglądarce własne API musi obsługiwać CORS dla adresu aplikacji. Spark nie udostępnia serwerowej bramki omijającej CORS; błędy połączenia są pokazywane, bez fikcyjnego sukcesu. API musi już istnieć na serwerze obsługującym ten protokół; panel nie tworzy serwera.

Wybrany adres trafia przez Firestore do klientów i jest używany bezpośrednio do pojazdów, szczegółów i tras. Domyślny profil „Źródła przewoźników” korzysta z istniejących adapterów PKS, MPK i Marceli, bez Cloud Functions. Jego test odczytuje rzeczywisty strumień PKS `/pks/get_vehicles.php`; pusta lista pojazdów jest poprawnym wynikiem. Stary domyślny adres funkcji jest migrowany do tego profilu przy otwarciu konserwacji przez edytora. Własne adresy pozostają zapisane. Włączony fallback pozwala wrócić do źródeł przewoźnika, jeśli API nie odpowiada; wyłączony pokazuje błąd. Rozkłady przystankowe pochodzą nadal od przewoźników.

Plan Spark ma limity operacji Firestore. Testy są uruchamiane ręcznie, bez ciągłego odpytywania w tle.
