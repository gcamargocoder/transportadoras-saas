# Decisões de Arquitetura

Este documento registra as decisões tomadas na fundação do projeto e o motivo
de cada uma. Atualize-o conforme novas decisões estruturais forem tomadas.

## 1. Monorepo — Turborepo + pnpm workspaces
pnpm reduz duplicação de dependências e é rápido em instalação; Turborepo
oferece cache incremental e pipelines de tarefas (`dev`, `build`, `lint`,
`typecheck`) suficientes para o tamanho do projeto (3 apps + poucos pacotes
compartilhados), sem o overhead de ferramentas como Nx.

## 2. Backend — NestJS
Estrutura modular com injeção de dependência, adequada para crescer em
domínios de negócio (viagens, pedágios, veículos, tenants, auditoria) mantendo
organização. Suporte nativo a WebSocket (necessário para rastreamento em tempo
real) e a filas para processamento assíncrono (auditoria de pedágio).

## 3. Banco de dados — PostgreSQL + PostGIS, via Prisma
Rotas, geofencing (alertas de desvio), proximidade a praças de pedágio e o
replay de viagem exigem tipos e funções geoespaciais nativas — daí PostGIS.
Prisma foi escolhido pelo tooling maduro de migrations em equipe e pelo client
TypeScript gerado automaticamente, reduzindo erros de query.

## 4. Multi-tenancy — banco compartilhado com `tenant_id` (row-level)
Isolamento por linha (com Row-Level Security do Postgres) em vez de
schema-por-tenant ou banco-por-tenant: mais simples de operar e migrar com o
número inicial de transportadoras atendidas, e escala bem até a plataforma
crescer significativamente. Reavaliar se surgirem exigências fortes de
compliance/isolamento físico de dados.

## 5. Tempo real — WebSocket via Gateway do NestJS (Socket.io)
Usado para rastreamento GPS ao vivo, alertas e replanejamento de rota. Roda no
mesmo processo da API nesta fase (sem serviço de realtime dedicado ainda).

## 6. Painel administrativo — Next.js (App Router) + Tailwind CSS
App Router para aproveitar Server Components ao consumir dados pesados
(rotas, relatórios de pedágio). Responsivo, cobrindo computador/tablet/celular
sem necessidade de um app nativo dedicado a tablet nesta fase.

## 7. App do motorista — React Native via Expo
Expo acelera setup, builds (EAS) e acesso a APIs nativas (GPS, localização em
background) que o app vai precisar, sem exigir configuração nativa manual
nesta fase.

## 8. Qualidade de código
TypeScript estrito (`strict`, `noUncheckedIndexedAccess`) compartilhado via
`tsconfig.base.json`; ESLint em flat config compartilhado; Prettier unificado
na raiz; Husky + lint-staged para checagem em pre-commit.

## 9. Modelagem de dados (schema Prisma)
O schema completo (`packages/database/prisma/schema.prisma`) cobre 34 modelos e 18
enums, organizados em: plataforma (Tenant, TenantSettings, UserAccount, AuditLog),
frota (Fleet, Vehicle, Trailer, TagProvider, VehicleTag), motoristas (Driver,
DriverShift, ShiftBreak), clientes e locais (Customer, Location), composicao de
veiculo e eixos (TripComposition, TripCompositionTrailer, AxleConfiguration), viagem
(Trip, RouteVersion, RouteEvent, TrackingPoint, Alert, Notification, Telemetry),
pedagio (TollPlaza, TollRate, TollPrediction, TollTransaction, TollAudit),
financeiro (TripExpense, TripMetrics) e documentos/integracoes (Document, Attachment,
ExternalReference).

Decisoes de modelagem registradas:
- Toda tabela operacional carrega `tenant_id` (denormalizado, mesmo quando derivavel
  via join) para permitir politicas de Row-Level Security diretas por linha.
- `TollPlaza`, `TollRate` e `TagProvider` sao dados de referencia GLOBAIS, sem
  `tenant_id`.
- `Document` e `Attachment` sao polimorficos (`owner_type`/`entity_name` + id) para
  nao exigir nova tabela a cada novo tipo de arquivo.
- Colunas geoespaciais usam `Unsupported("geometry(...)")`, ja que o Prisma nao tem
  tipo nativo para PostGIS — exigem SQL bruto (`$queryRaw`) para leitura/escrita.

## 10. Catálogo oficial de pedágios (Fase 33)

Estende a tabela `TollRate` (já existente no schema, não utilizada até
então) em vez de criar uma tabela paralela, e adiciona `TollDataSource`,
`TollDataSyncRun` e `TollPlazaDataSourceLink` para sincronizar
periodicamente a identidade de praças a partir de fontes públicas (ANTT) e
registrar tarifas oficiais versionadas de forma rastreável (nunca
inventadas). Detalhes completos, incluindo o que cada fonte pesquisada
realmente oferece, em [`docs/toll-data-providers.md`](./toll-data-providers.md).

## 11. Roadmap futuro (nao modelado ainda)
**Motor de simulacao de rotas**: dado origem, destino, veiculo e carga, comparar
rotas alternativas por custo, tempo, pedagios e combustivel antes da viagem comecar.
Transforma o sistema de rastreador em ferramenta de decisao. Depende de
`RouteVersion`, `TollPrediction` e `TripMetrics`, ja modelados — sera implementado
como servico de calculo sobre esses dados, sem exigir novas tabelas.
