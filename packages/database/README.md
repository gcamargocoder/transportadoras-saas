# @transportadoras/database

Camada de acesso a dados do projeto, baseada em Prisma + PostgreSQL (extensao PostGIS).

## Estado atual

Schema completo modelado (34 models, 18 enums) em `prisma/schema.prisma`, cobrindo
plataforma/multi-tenant, frota, motoristas, clientes/locais, composicao de veiculo e
eixos, viagem, pedagio, financeiro e documentos. Ver decisoes completas em
`../../docs/architecture.md`.

Migration inicial aplicada (`prisma/migrations/20260806012628_init`) contra o
Postgres do `docker-compose.yml` da raiz, criando as 34 tabelas + enums + extensao
PostGIS. Seed inicial (`prisma/seed.ts`) popula apenas dados de referencia GLOBAIS
(`TagProvider`) — nenhum tenant/usuario ainda, pois o modelo de autenticacao e
perfis de acesso e definido na proxima etapa. Nenhuma logica de aplicacao
(services, repositories) foi criada — isso pertence a `apps/api`.

## Decisoes de arquitetura (resumo)

- **Multi-tenant**: isolamento por `tenant_id` (row-level), denormalizado em toda
  tabela operacional para suportar Row-Level Security direta.
- **PostGIS**: habilitado para rotas, geofencing e locais — colunas geoespaciais
  usam `Unsupported()`, leitura/escrita exige `$queryRaw`.
- **Referencia global x tenant-scoped**: `TollPlaza`, `TollRate` e `TagProvider` sao
  compartilhados entre tenants; todo o resto e isolado por `tenant_id`.

## Scripts

- `pnpm db:generate` — gera o client Prisma
- `pnpm db:migrate:dev` — roda migrations em ambiente de desenvolvimento
- `pnpm db:studio` — abre o Prisma Studio
- `pnpm db:seed` — roda o seed de dados de referencia globais (`prisma/seed.ts`)
