# apps/driver-app — App do Motorista (React Native / Expo)

App mobile usado pelo motorista para rastreamento GPS e recebimento de alertas
de rota. Nenhuma tela de negocio foi criada nesta etapa.

## Estado atual (fundacao)
- Projeto Expo configurado (`app.json`, `babel.config.js`)
- Entry point minimo (`App.tsx`), sem telas
- Pasta `src/` reservada para codigo futuro

## Stack
React Native (Expo) · TypeScript

## Rodando localmente
```bash
cp .env.example .env
pnpm --filter @transportadoras/driver-app dev
```
