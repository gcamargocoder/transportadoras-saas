# apps/driver-app — App do Motorista (React Native / Expo)

App mobile usado pelo motorista para acompanhar a viagem, registrar
localizacao, paradas, abastecimento e excecoes de eixo em pedagios (Fase 25),
consumindo a API propria `/driver/*` (ver `apps/api/src/driver-trips`).

## Estado atual
- Login (email/senha, mesmo `POST /auth/login` da plataforma).
- Retomada automatica de viagem ao abrir o app (`GET /driver/trips/active`).
- Tela principal com iniciar/pausar/retomar/encerrar viagem.
- Abastecimento (KM + litros), Pedagio (praca proxima + alterar eixos) e
  Paradas (automatica + manual).
- Localizacao GPS em primeiro plano, com deteccao automatica de parada.
- Fila offline para eventos gerados sem conexao (idempotente por
  deviceEventId, sincroniza sozinha ao reconectar).

Background location, geofencing nativo, Google Maps/Places e leitura
automatica de tag de pedagio **nao** estao implementados (fora do escopo da
Fase 25) -- a arquitetura fica preparada para isso (ver `app.json`).

## Stack
React Native (Expo) · TypeScript · React Navigation

## Rodando localmente
```bash
cp .env.example .env
pnpm --filter @transportadoras/driver-app dev
```

Requer a API (`apps/api`) rodando e acessivel em `EXPO_PUBLIC_API_URL`.
