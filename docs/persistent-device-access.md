# Dostęp po ponownej instalacji i mniejsze opcje

Android używa `Settings.Secure.ANDROID_ID`, nie identyfikatora konta anonimowego
Firebase ani losowego numeru zapisanego tylko w aplikacji. W panelu administratora
ID urządzenia pokazuje teraz `installationId`, np. `android_0123456789abcdef`.
Nadanie rangi i uprawnień zapisuje urządzenie i profil `installations` atomowo,
z UID odbiorcy. Po usunięciu aplikacji Firebase tworzy nowy UID, ale rejestracja
odczytuje profil pod tym samym Android ID i przywraca jego rangę oraz uprawnienia.
Jeśli urządzenie nie przekazało jeszcze identyfikatora, panel prosi o uruchomienie
aktualnej aplikacji przed nadaniem trwałego dostępu.

Profil istniejący w Firebase jest źródłem uprawnień. Obniżenie rangi jest zapisywane
w tym samym profilu; reinstalacja nie przywraca wcześniejszej, wyższej rangi.
Usunięcie profilu urządzenia przez administratora usuwa zapisany dostęp.
Nazwa telefonu ani zgodność modelu nie przywracają rangi. Usunięto taki mechanizm
z `registerDeviceIdentity`; jeśli funkcja jest używana, wdrożenie wymaga jej aktualizacji.

## Stały podpis APK — konieczna jednorazowa konfiguracja

Na Androidzie 8+ ID pozostaje ten sam po reinstalacji przy tym samym użytkowniku
systemu i kluczu podpisu. Zmiana klucza, profilu Androida lub reset fabryczny zmienia ID.
Źródło: https://developer.android.com/reference/android/provider/Settings.Secure#ANDROID_ID

GitHub Actions dotychczas generował debug keystore na każdym nowym runnerze.
Workflow obsługuje teraz stały keystore przechowywany w prywatnych sekretach repozytorium:

| Sekret GitHub Actions | Wartość |
| --- | --- |
| ANDROID_KEYSTORE_BASE64 | Ten sam plik keystore kodowany Base64 dla wszystkich wersji |
| ANDROID_KEYSTORE_PASSWORD | Hasło magazynu kluczy |
| ANDROID_KEY_ALIAS | Alias klucza |
| ANDROID_KEY_PASSWORD | Hasło klucza |

Sekrety dodaje właściciel w Settings → Secrets and variables → Actions.
Klucza i haseł nie należy dodawać do plików repozytorium. Kodowanie pliku lokalnie:
`python -c "import base64,pathlib; pathlib.Path('keystore-base64.txt').write_text(base64.b64encode(pathlib.Path('pks-live.keystore').read_bytes()).decode())"`.
Skopiuj zawartość lokalnego pliku do sekretu i usuń plik po zapisaniu sekretu.
Najlepiej użyć dotychczasowego klucza z komputera, na którym budowano zainstalowane APK.
Jeżeli dotychczasowy klucz był jednorazowym kluczem runnera i został utracony,
po przejściu na stały podpis trzeba jednorazowo ponownie nadać rangi urządzeniom.

Bez tego sekretu workflow nadal buduje testowy APK i wyświetla ostrzeżenie,
ale nie gwarantuje zachowania ID między różnymi buildami. Nie polegamy na
krótkotrwałym cache CI do przechowywania klucza. Sekrety nie są dostępne dla PR z forków.

## Weryfikacja

1. Skonfiguruj stały klucz i zbuduj APK. Zainstaluj aplikację i uruchom ją online.
2. Nadaj administratora lub właściciela i wybrane uprawnienia. Zapisz pokazane ID.
3. Odinstaluj aplikację; zainstaluj APK z tym samym podpisem i uruchom online.
4. ID, ranga i uprawnienia mają się przywrócić mimo nowego UID Firebase.
5. Obniż rangę i powtórz próbę — aplikacja ma zachować obniżoną rangę.
6. Drugi telefon tego samego modelu ma pozostać zwykłym użytkownikiem.

Testy reguł w CI sprawdzają ponowną rejestrację administratora i właściciela
z dokładnymi zapisanymi uprawnieniami i odmowę przy braku profilu.

Rejestracja na planie Spark przenosi wpis urządzenia ze starego UID na nowy w jednej
transakcji. Zachowuje pierwsze logowanie, własną nazwę, dokładne uprawnienia i blokadę.
Poprzedni wpis znika po udanym zapisie. Sam chwilowy błąd odczytu Android ID nie
powoduje wygenerowania nowego losowego identyfikatora.

Nowe reguły trzeba jednorazowo opublikować z aktualnego checkoutu:

```bash
npx firebase login
npx firebase deploy --project aplikacja-b20fa --only firestore:rules
```

To wdraża wyłącznie reguły Firestore i działa na planie Spark. Połączenie GitHub
nie udostępnia uprawnień do wdrożenia projektu Firebase ani ustawiania sekretów GitHub.

Jeśli nie masz dotychczasowego klucza, utwórz lokalnie nowy prywatny klucz (JDK):

```bash
keytool -genkeypair -keystore pks-live.keystore -alias pks-live -keyalg RSA -keysize 3072 -validity 10000
```

Keytool poprosi o hasło. Zachowaj klucz i hasło w bezpiecznym miejscu; ustaw cztery
sekrety opisane wyżej, z aliasem `pks-live`. Nowy klucz oznacza jednorazową zmianę
Android ID względem poprzednich APK i konieczność ponownego nadania rangi.
Reinstalowanie dokładnie tego samego APK zachowuje podpis również przed ustawieniem
sekretów; kolejne buildy wymagają stałego klucza.

## Wersja 2.3 — start przy starszych regułach

Jeśli poprzednio wdrożone reguły odrzucą atomowe przeniesienie UID, aplikacja
przywraca dokładny zapisany profil własnego urządzenia ścieżką zgodną ze starymi
regułami. Dla właściciela usuwa następnie powiązany poprzedni wpis. Starsze reguły
mogą blokować sprzątanie poprzedniego wpisu administratora — aktualne reguły nadal
są potrzebne do pełnego przenoszenia wszystkich rang i czyszczenia historii.
Zmiany dostępu z konsoli Firebase są od razu odzwierciedlane w profilu instalacji;
heartbeat nie nadpisuje uprawnień. Po późnej udanej rejestracji ekran przekroczenia
czasu znika automatycznie. Odmowa uprawnień ma osobny komunikat z przyczyną.

Identyfikator po ponownym zainstalowaniu tego samego APK pozostaje identyczny.
Dla kolejnych buildów nadal należy ustawić ten sam prywatny klucz podpisu opisany wyżej.
