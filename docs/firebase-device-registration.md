# Rejestracja urządzeń — poprawka

Logowanie czeka na odtworzenie sesji Firebase i współdzieli trwającą operację.
Równoległe montowanie providera nie tworzy dwóch anonimowych kont. Rejestracja
tego samego UID również współdzieli trwający zapis. Błąd logowania albo zapisu
jest ponawiany co 10 sekund, bez generowania nowego UID. Nie używamy fikcyjnego
`guest_*`, który nie ma uprawnień Firebase.

Android korzysta z przeglądarkowego transportu Firebase i długiego odpytywania
Firestore. Globalne przechwytywanie fetch/XHR przez CapacitorHttp jest wyłączone.
Zapytania transportowe nadal używają jawnego `CapacitorHttp.request`.
Stabilny Android ID działa również, gdy zapis do localStorage zgłosi błąd.

## Wdrożenie i próba na urządzeniu

1. Włącz Anonymous w Firebase Console → Authentication → Sign-in method.
2. Zbuduj i zainstaluj nowe APK (`npm run android:sync`, następnie
   `./gradlew assembleDebug` w katalogu `android`, albo workflow Build Android APK).
   Sama aktualizacja panelu WWW nie aktualizuje kodu w zainstalowanym APK.
3. Na komputerze odśwież tę samą stronę kilka razy. UID i installationId mają
   pozostać te same; heartbeat zmienia lastSeenAt istniejącego dokumentu.
4. Na Androidzie otwórz aplikację z internetem. Sprawdź nowy dokument devices
   z installationId zaczynającym się od android_ oraz jego obecność w panelu.
5. Uruchom ponownie aplikację, a następnie sprawdź start bez sieci i odzyskanie
   połączenia. Przywrócona sesja powinna używać tego samego UID.

## Zakres weryfikacji

Testy obejmują równoległe logowanie, odtworzenie sesji, ponowienie po błędzie,
współdzielenie zapisu i konfigurację transportu. Próba na fizycznym Androidzie
i z wdrożonymi regułami Firebase jest nadal wymagana.

Istniejące rekordy nie są kasowane. Firestore nadal przechowuje devices po UID
oraz installations po installationId; są to dwa różne rodzaje dokumentów.
Przeglądarka używa sesji osobnej dla każdego origin (w tym portu). Zmiana portu,
przeglądarki lub wyczyszczenie danych może nadal utworzyć nowe anonimowe konto.
Migracja dawnych UID przez Cloud Function wymaga wdrożonego registerDeviceIdentity
i NEXT_PUBLIC_USE_IDENTITY_FUNCTION=true; ta poprawka nie wdraża funkcji ani reguł.
