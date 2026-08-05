# apps/api — Backend (NestJS)

API REST + WebSocket do SaaS. Responsavel por toda a logica de negocio do sistema
(viagens, pedagios, veiculos, tenants, auditoria, replanejamento) — a ser implementada
por modulo, nas proximas etapas.

## Estado atual (fundacao)
- Bootstrap minimo do Nest (`main.ts`, `app.module.ts`)
- Um unico endpoint de health check (`GET /health`)
- Pasta `src/realtime/` reservada para o Gateway WebSocket, ainda vazia
- Nenhuma entidade, controller ou service de negocio foi criado

## Stack
NestJS · TypeScript · Socket.io (WebSocket) · Prisma (via `@transportadoras/database`)

## Rodando localmente
```bash
cp .env.example .env
pnpm --filter @transportadoras/api dev
```
