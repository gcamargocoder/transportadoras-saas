# Transportadoras SaaS — Fundação do Projeto

SaaS profissional e multi-tenant para transportadoras: planejamento de viagens,
rastreamento GPS em tempo real, monitoramento de frota, cálculo automático de
custos de pedágio, auditoria entre valor previsto x cobrado, replanejamento
automático de rota, alertas em tempo real, histórico e replay de viagens.

> **Estado atual do repositório**: apenas a fundação de engenharia (estrutura,
> configs, tooling). Nenhuma funcionalidade de negócio, tela, API ou integração
> foi implementada ainda. O desenvolvimento seguirá por módulos, um de cada vez.

## Estrutura do monorepo

```
apps/
  driver-app/   # React Native (Expo) — app do motorista
  admin-web/    # Next.js + Tailwind — painel administrativo
  api/          # NestJS — API REST + WebSocket
packages/
  database/            # Prisma + PostgreSQL/PostGIS (sem models de negócio ainda)
  types/                # Tipos/DTOs compartilhados entre apps
  utils/                 # Funções utilitárias puras compartilhadas
  config-eslint/         # Config ESLint compartilhada
  config-typescript/     # Configs de tsconfig compartilhadas
docs/
  architecture.md       # Decisões de arquitetura registradas
```

Veja o `README.md` de cada pasta em `apps/*` e `packages/*` para detalhes do módulo.

## Decisões de arquitetura (resumo)

| Área | Decisão |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Backend | NestJS (REST + WebSocket via Socket.io) |
| Banco de dados | PostgreSQL + PostGIS, via Prisma |
| Multi-tenant | Banco compartilhado, isolamento por `tenant_id` (row-level) |
| Painel web | Next.js (App Router) + Tailwind CSS |
| App do motorista | React Native via Expo |
| Qualidade de código | TypeScript estrito, ESLint (flat config), Prettier, Husky + lint-staged |

Detalhes e justificativas completas em [`docs/architecture.md`](./docs/architecture.md).

## Requisitos

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL com extensão PostGIS (para uso futuro dos módulos de negócio)

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
# roda todos os apps em paralelo (via Turborepo)
pnpm dev

# roda um app especifico
pnpm --filter @transportadoras/api dev
pnpm --filter @transportadoras/admin-web dev
pnpm --filter @transportadoras/driver-app dev
```

## Outros scripts

```bash
pnpm build       # build de todos os apps/packages
pnpm lint         # lint em todo o monorepo
pnpm format       # formata todo o codigo com Prettier
pnpm typecheck    # checagem de tipos em todo o monorepo
```

## Próximos passos

Cada funcionalidade do escopo (planejamento de viagem, rastreamento GPS, cálculo
e auditoria de pedágio, replanejamento automático, dashboard, alertas, replay)
será implementada como um módulo separado, mantendo o código organizado,
documentado e testável.
