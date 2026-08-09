# src/

Codigo-fonte do app do motorista (Fase 25).

- `api/` -- cliente HTTP (fetch + refresh automatico) e chamadas a API do motorista (`/driver/*`).
- `auth/` -- sessao do motorista (login, tokens, persistidos em SecureStore).
- `components/` -- primitivos de UI (Button, Card, TextField, ScreenContainer).
- `location/` -- GPS foreground (`useLocationTracker`) e deteccao de parada.
- `navigation/` -- arvore de telas (React Navigation).
- `screens/` -- Login, Home (viagem/retomada), Abastecimento, Pedagio, Paradas.
- `storage/` -- SecureStore (tokens) e fila offline (`syncQueue`) para eventos operacionais.
- `trip/` -- estado da viagem ativa (`TripContext`), unica fonte de verdade lida de `GET /driver/trips/active`.

Background location, geofencing nativo e integracao com mapas ficam
preparados para fases futuras (ver `app.json`), nao implementados aqui.
