# Struktura kodu

Ten podział zachowuje dotychczasowe punkty wejścia i działanie aplikacji. Wersja 2.4.2, build 257.

## Transport

- `lib/pks-client.ts` pozostaje fasadą dla istniejących odbiorców: wybór przewoźnika, pobieranie floty i szczegółów, PKS oraz publiczne eksporty.
- `lib/providers/*-client.ts`, `pks-stops.ts`, `pks-departures.ts`, `mpk-vehicles.ts` i `mpk-departures-client.ts` zawierają adaptery poszczególnych źródeł.
- `lib/transport/http.ts` odpowiada za żądania, limity czasu i transport natywny.
- `lib/transport/cache.ts` i `legacy-shapes.ts` utrzymują dotychczasowe klucze, wersje i zasady pamięci podręcznej.
- `lib/transport/road-routing.ts` wyznacza geometrię drogową; `vehicle-speed.ts` utrzymuje wspólny stan pomiarów prędkości.
- `lib/transport/types.ts` oraz `vehicle.ts` definiują kontrakty danych bez importowania komponentów.

Pamięć podręczna danego dostawcy należy do jego modułu. Nie kopiować jej do fasady ani tworzyć dodatkowych instancji podczas odświeżania.

## Mapa i ekran główny

- `components/BusMap.tsx` składa mapę, ładuje trasę i zachowuje dotychczasowe eksporty.
- `components/map/MapControls.tsx` obsługuje stan i sterowanie mapą.
- `VehicleMarkers.tsx` oraz `StopLayers.tsx` renderują warstwy pojazdów i przystanków.
- `vehicle-icons.ts` tworzy i buforuje ikony.
- `lib/map/route-cache.ts` utrzymuje zapis geometrii; `route-presentation.ts` zawiera obliczenia prezentacji.
- `components/BusDetailsPanel.tsx` prezentuje panel autobusu. Gesty, wybór pojazdu i pobieranie danych pozostają w ekranie głównym.
- `lib/home/` grupuje formatowanie pojazdów, mapowanie odjazdów i ustawienia przewoźników.

Identyfikacja i łączenie przystanków nadal korzystają z istniejących modułów przystanków; ten refaktor nie zmienia ich reguł ani współrzędnych.

## Firebase i administracja

- `components/FirebaseProvider.tsx` utrzymuje sesję, subskrypcje, rejestrację urządzenia i autoryzację.
- `components/firebase/types.ts` definiuje kontrakt kontekstu; `StartupScreens.tsx` prezentuje ładowanie, brak połączenia, konserwację i blokadę.
- `lib/admin/dashboard-model.ts` zawiera grupowanie, formatowanie i obliczenia panelu.
- `app/admin/AdminDashboard.tsx` pozostaje właścicielem operacji i subskrypcji administracyjnych. Moduły RBAC i reguły Firebase są nadal źródłem zasad dostępu.

## Weryfikacja

Uruchomić istniejące testy projektu i sprawdzenie TypeScript. Workflow Androida sprawdza także backend, mapę w przeglądarce, reguły Firebase i buduje APK. Testowy loader TypeScript obsługuje zarówno moduły TS, jak i wydzielone komponenty TSX.
