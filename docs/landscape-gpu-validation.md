# Rozbudowa motywu PKS Live — wynik prac

> Korekta po zgłoszeniu z urządzenia: najnowsze zmiany opisuje ostatnia sekcja
> `docs/dynamic-mountain-theme.md` („Correction after device feedback”).
> Usunięto limit 2 FPS i kopiowanie GPU do Canvas 2D z każdej klatki.
> Wprowadzono bezpośrednią prezentację GPU, krótkie nieregularne fale,
> mocniejsze refleksy oraz nowe tarcze Słońca/Księżyca.
> Poniżej pozostawiono historyczny raport pierwszej implementacji.


Implementacja znajduje się na lokalnej gałęzi `feat/landscape-gpu-lighting`.
Nie zmieniono `main`, astronomii, trajektorii Słońca ani obrazów krajobrazu.
Nie utworzono zdalnej gałęzi ani PR. Walidacja na Androidzie jest nieukończona.

## Ustalona baza

- Źródła: `5d4d139eb7e881918d33ea56b0db84a9e3c841ca`, gałąź
  `feat/dynamic-mountain-theme-20261023`.
- `main`: `b915457b63e73c1405ae4c123271dafb2643bc19`, przodek wybranej bazy.
- Ostatni poprawny build: [Actions 40071934541](https://github.com/sigma943/Aplikacja-android-FINAL/actions/runs/40071934541),
  24 października 2026. Potwierdzono udane assemble i weryfikację wariantów,
  artefakty debug/release APK oraz podglądy UI, powiązane z wybranym SHA.
- Sprawdzono gałęzie, ostatnie buildy, historię commitów i tagi. Oba tagi
  wydawnicze z 5–6 października są starsze od działającego motywu.

## Zmienione lub dodane pliki

| Plik | Zmiana |
|---|---|
| `lib/landscape-water-gpu.ts` | Jeden kontekst WebGL2, GLSL ES 3.00, fale, odbicia, maska, jakość i zasoby |
| `lib/landscape-lighting.ts` | Wspólny stan światła i dotychczasowa geometria przesłaniania |
| `lib/landscape-glass.ts` | Lokalne położenie światła na kartach i w kadrowanych kopiach sceny |
| `lib/landscape-renderer.ts` | Kompozycja GPU z istniejącym Canvas 2D, fallback i zwalnianie zasobów |
| `components/DynamicLandscape.tsx` | Wspólna pętla, adaptacja jakości, widoczność, dane dla szkła |
| `lib/landscape-optics.ts` | Ciągły kolor szkła i wygaszanie słonecznych refleksów nocą |
| `app/globals.css` | Światło jako tło kart, pod tekstem |
| `test/landscape-gpu.test.cjs` | Model światła, projekcja, faza, ciągłość, budżety i szkło |
| `test/landscape-gpu-browser.cjs` | Przygotowane testy rzeczywistego WebGL2, maski i cyklu życia kontekstu |
| `test/landscape-gpu-egl.py` | Wykonane testy kompilacji i pikseli GLES3 w Mesa |
| `.github/workflows/build-apk.yml` | Dołączenie testów GPU do istniejącego CI |
| `docs/dynamic-mountain-theme.md` | Architektura i sposób uruchamiania testów |
| `docs/landscape-gpu-validation.md` | Ten raport |

## Shadery i synchronizacja

Trzy analityczne fale mają różne kierunki, częstotliwości i prędkości.
Perspektywa zagęszcza fale przy odległych brzegach. Ich pochodne określają
normalne używane przez oba światła. Uproszczony połysk half-vector i nieregularne
refleksy tworzą ruchomą smugę. Tekstura dotychczasowego terenu jest próbkowana
jako przybliżone odbicie otoczenia. Nie jest to fizyczny ray tracing.

Całość jest przycinana istniejącą maską alfa rzeki, obejmującą brzegi, drzewa
i wyspy. Sąsiednie próbki maski wygaszają ruch i połysk przy brzegu.
Nie zastąpiono maski prostokątem.

Źródłem jest istniejąca interpolowana astronomia z workera. Zachowano
`projectCelestial`, górski horyzont i transmisję przez chmury. Odbicie Księżyca
uwzględnia fazę, położenie i wysokość; zanika pod horyzontem i podczas nowiu.
Nie ma oddzielnych scen ani osobnych pętli dla Słońca i Księżyca.

Szkło otrzymuje światło pod tekstem. Położenie uwzględnia lokalny prostokąt
karty oraz kadrowanie istniejących kopii sceny w panelach i nawigacji.
Poświata respektuje krycie użytkownika, wyłączenie szkła i niski poziom jakości.
Nie dodano elementów przechwytujących dotyk ani nowych ustawień motywu.

## Wydajność

- High: cel 30 FPS, około 360 tys. pikseli GPU maksymalnie.
- Medium: cel 24 FPS, około 210 tys. pikseli.
- Low: cel 12 FPS, około 110 tys. pikseli i dwie fale zamiast trzech.
- Oszczędzanie energii i lekkie efekty zachowują istniejącą ostrożną politykę 2 FPS.
- Utrzymujące się kosztowne klatki lub opóźnienia pętli obniżają jakość.
- Dwie tekstury są wysyłane przy inicjalizacji; brak odczytu pikseli w produkcji.
- Scissor pomija niebo. Główny Canvas 2D zachowuje istniejący limit rozdzielczości.
- Brak animacyjnych aktualizacji React. Szkło aktualizuje układ najwyżej 4 razy/s.
- Ukrycie strony, cykl natywny, przecięcie z widokiem i odmontowanie zatrzymują
  rysowanie; zasoby GPU są zwalniane. Redukcja ruchu zatrzymuje czas fal.
- Utrata/brak WebGL2 pozostawia dotychczasowy renderer wody; przywrócenie
  kontekstu odbudowuje shader i tekstury. Nie dodano zależności ani silnika 3D.

## Wykonane sprawdzenia

| Sprawdzenie | Wynik |
|---|---|
| TypeScript `npx tsc --noEmit` | OK |
| Lint zmienianych modułów TypeScript | OK |
| Pełny `npm run lint` | 45 błędów, 33 ostrzeżenia poza zmienianymi modułami |
| Testy krajobrazu i GPU | 23/23 OK |
| Pełny `npm test` | 619/620 OK; test podpisywania APK nie uruchamia `keytool` z powodu niedziałającej Javy |
| Rzeczywista kompilacja/linkowanie GLSL ES 3 w Mesa EGL | OK |
| Ruch wody przy stałym oświetleniu | OK; zmieniło się 16 985 pikseli |
| Brak światła na niebie i poza maską wody | OK; 0 niedozwolonych pikseli w teście |
| Zmiana położenia odbicia Słońca | OK |
| Nów i Księżyc pod horyzontem | OK; brak dodanego światła |
| Wszystkie warianty jakości shadera | OK |
| Poranek, południe, zachód, zmierzch, noc z/bez Księżyca | Model i renderowanie wody GLES3 OK |
| Testy Chrome — aplikacja i WebGL2 | Zablokowane: Chrome kończy proces podczas startu |
| `npm run build:android:web` | OK po lokalnym pominięciu diagnostyki RSS Next.js |
| `npx cap sync android` | OK |
| `bash android/gradlew assembleDebug` (z katalogu `android`: `bash gradlew assembleDebug`) | Nieudany start: Java nie ładuje `libjli.so` |

Standardowy build początkowo zatrzymał się na `uv_resident_set_memory`, bo
środowisko nie udostępnia odczytu RSS. Lokalnie, wyłącznie w ignorowanym
`node_modules/next/dist/lib/memory/trace.js`, dodano przechwycenie błędu
pomiaru. Nie zmieniono kompilatora, kontroli typów ani konfiguracji aplikacji.
Nie ma pomiarów pamięci RSS. Ta pomocnicza zmiana nie należy do commitu.

## Pozostała walidacja i ograniczenia

Nie wykonano testu na fizycznym Androidzie ani emulatorze. Brak gotowego APK
z tej zmiany. Nie potwierdzono temperatury, zużycia baterii, wycieków pamięci,
realnych FPS ani działania słabego GPU. Mesa jest rendererem programowym.

Przejście aplikacji do tła i powrót, zmiana motywu, przewijanie odjazdów,
otwieranie mapy i szczegółów autobusu, szybkie przełączanie zakładek,
przywrócenie kontekstu WebGL2 i pełna czytelność interfejsu wymagają uruchomienia
przygotowanych testów Chrome/CI oraz testu urządzenia. Istniejący test
`landscape-browser.cjs` zawiera scenariusze UI i cyklu życia; jego wykonanie
zostało zatrzymane przed startem przeglądarki. Nie oznaczamy ich jako zaliczonych.

Automatyczna kontrola zatwierdzeń odrzuciła wysłanie źródeł i workflow do
publicznego repozytorium, wskazując brak jednoznacznej zgody na transfer.
Zdalna gałąź, PR i nowe CI wymagają zatwierdzenia użytkownika.
