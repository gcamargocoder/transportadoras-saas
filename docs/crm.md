# CRM Operacional/Comercial de Clientes (Fase 93)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados `Customer`, `Location`, `Trip`, `TripDeliveryStop`,
`TripBilling`, `Contract`, `FreightTable`, `Receivable`/`ReceivablesDashboardService` e tudo que já
existisse relacionado a cliente no schema e na página `apps/admin-web/.../customers/[id]/page.tsx`.

### Conclusão da auditoria

- **`Customer` já existia** (Fase 25, pré-requisito de `Trip.customerId`), mas com um cadastro
  mínimo: `name`/`document`/`isActive`, só `create`/`list`/`get`. **Nunca havia telefone, e-mail,
  endereço, contato ou observação** — nenhuma dessas informações era "reaproveitável", eram lacunas
  reais (regra 5/9).
- **A página de detalhe do cliente já era, na prática, quase um CRM**: já consultava, filtrando por
  `customerId`, os dashboards e listagens de `Contract`, `FreightTable`, `Trip` (10 mais recentes),
  `FreightDashboard`, `BillingDashboard`, `TripBilling` e `ReceivablesDashboardService` — todos
  endpoints e cálculos **já existentes e já testados** de outras fases. Ou seja, "histórico
  comercial", "histórico de viagens" e "dashboard/resumo comercial" já estavam cobertos pelo TMS
  existente; **não havia nada a duplicar ali** (regra 1/2/3).
- **Conclusão de escopo**: o que realmente faltava para transformar o cadastro em CRM era só (a)
  informações comerciais básicas do cliente (telefone/e-mail/endereço) e edição (`PATCH`, lacuna
  real — só havia `create`), (b) pessoas de contato (`CustomerContact`, não existia nenhum modelo de
  contato no schema), (c) observações/interações comerciais (`CustomerNote`, idem), e (d) um resumo
  de indicadores **não financeiros** (contagens/datas) — os indicadores financeiros continuam vindo
  dos dashboards já existentes, nunca duplicados (regra 3).
- **Índice ausente**: `Trip` não tinha `@@index([tenantId, customerId])` apesar de
  `GET /trips?customerId=` já ser um filtro em produção — adicionado como melhoria mínima e
  diretamente relacionada (regra 7).

## 2. Modelo de dados

### 2.1 `Customer` (estendido, nunca duplicado)

Campos novos, todos opcionais: `phone`, `email`, `address` — mesmo padrão de validação já usado por
`Driver`/`MaintenanceProvider`/`FuelStation`. Nenhum campo/relacionamento existente foi alterado ou
removido.

### 2.2 `CustomerContact` (novo — 1:N por cliente)

`name`, `role`, `phone`, `email`, `notes`, `isPrimary`. Escopado por `tenantId` + `customerId`
(`@@index([tenantId])`, `@@index([tenantId, customerId])`). Não reaproveita nenhuma estrutura de
"pessoa" genérica porque nenhuma existia no schema (auditado: nenhum model `Contact` prévio).

### 2.3 `CustomerNote` (novo — 1:N por cliente, append-only)

`content`, `createdBy` (`UserAccount`), `createdAt`. Sem `updatedAt`/edição: é um log de interações,
igual em espírito a uma timeline — editar um registro passado distorceria o que de fato foi dito ou
feito.

### 2.4 Índice adicionado

`Trip.@@index([tenantId, customerId])` — filtro já existente (`GET /trips?customerId=`) que ainda
não tinha índice dedicado.

Migração: `packages/database/prisma/migrations/20260830000000_crm_customer_contacts_notes/`.

## 3. Endpoints (`apps/api/src/trips/controllers/customers.controller.ts`)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/customers` | Lista com busca (nome/documento), filtro `isActive`, paginação (já existia; `isActive` é novo) |
| `GET` | `/customers/:id` | Detalhe (já existia, agora inclui phone/email/address) |
| `GET` | `/customers/:id/summary` | Indicadores básicos **não financeiros** (novo) |
| `POST` | `/customers` | Cria cliente (já existia, agora aceita phone/email/address) |
| `PATCH` | `/customers/:id` | Edita cliente, incluindo `isActive` (novo — lacuna real) |
| `GET`/`POST` | `/customers/:id/contacts` | Lista/cria contato (novo) |
| `PATCH`/`DELETE` | `/customers/:id/contacts/:contactId` | Edita/remove contato (novo) |
| `GET`/`POST` | `/customers/:id/notes` | Lista/registra observação (novo; sem update/delete — append-only) |

RBAC: mesmas roles já usadas por `Trip`/`Customer` (`TRIP_READ_ROLES` para leitura —
inclui `AUDITOR`; `TRIP_WRITE_ROLES` para escrita — `SUPER_ADMIN`/`ADMIN`/`MANAGER`/`OPERATOR`/
`DISPATCHER`). Multi-tenant: todo acesso é escopado por `tenantId`; um cliente/contato de outro
tenant sempre responde `404` (nunca `403`, mesmo padrão já usado no restante do sistema).

## 4. `GET /customers/:id/summary` — fonte dos indicadores

Todas as consultas rodam em paralelo (`Promise.all`), cada uma agregada no banco (nunca uma query
por viagem/contrato — regra 7):

- `tripsTotal`/`tripsByStatus`: `Trip.groupBy({ by: ['status'] })` filtrado por `customerId` e
  `deletedAt: null`.
- `firstTripAt`/`lastTripAt`: `Trip.aggregate({ _min/_max: { createdAt } })` — data de **registro**
  da viagem (nunca inventa uma data de execução real quando a viagem ainda não partiu/chegou).
- `contactsCount`/`notesCount`: `count()` em `CustomerContact`/`CustomerNote`.
- `contractsTotal`/`activeContractsCount`: `count()` em `Contract` (total e com
  `status: ACTIVE`).

Nenhum valor monetário aparece nesse endpoint — propositalmente (regra 3). Indicadores financeiros
(faturamento, contas a receber, margem) continuam vindo, sem alteração, de
`ReceivablesDashboardService`/`BillingDashboard`/`FreightDashboard`, já filtrados por `customerId`.

## 5. Frontend (`apps/admin-web`)

- **Lista de clientes** (`/customers`): ganhou filtro de status (Todos/Ativos/Inativos), reaproveitando
  `FilterBar`/`Select` já existentes.
- **Detalhe do cliente** (`/customers/:id`): ganhou (a) botão "Editar cliente" (mesmo modal de
  criação, agora também edita — `CustomerFormModal`, padrão já usado por `ContractFormModal`), (b)
  uma linha de `StatCard` com indicadores não financeiros do `summary` (viagens totais, última
  viagem, contatos cadastrados, contratos ativos/total), (c) card **Contatos** (lista + criar/editar/
  remover via modal + `ConfirmDialog`, mesmo padrão de `DeliveryStopsTab`) e (d) card **Observações e
  interações** (lista + formulário inline de registro, append-only). Nenhuma seção financeira
  existente foi alterada.
- Todos os componentes novos reaproveitam `Card`/`Modal`/`FormField`/`Dropdown`/`ConfirmDialog`/
  `Badge`/`StatCard` já existentes — nenhum componente de UI genérico novo foi criado.

## 6. Regras aplicadas

1. `Customer` nunca foi duplicado — apenas estendido com campos opcionais e dois relacionamentos novos.
2. Viagens, faturamento, contratos e tabelas de frete continuam consultados pelos endpoints/dashboards
   já existentes, filtrados por `customerId` — nenhuma segunda fonte de dados.
3. Nenhum cálculo financeiro novo foi criado; `summary` é estritamente não financeiro.
4. O funcionamento operacional de `Trip` (status, transições, faturamento, entregas) não foi tocado.
5. Nenhum dado comercial foi inventado — `summary`/histórico refletem exatamente o que existe no
   banco (zero viagens/contatos/observações = zeros explícitos, nunca um valor fabricado).
6. Multi-tenant e RBAC preservados em todas as rotas novas (testado em e2e).
7. Sem N+1: `summary` usa `Promise.all` com queries agregadas; testado com 5 e 20 viagens.
8. Só foram criadas as estruturas realmente necessárias: `CustomerContact`, `CustomerNote`, um
   endpoint de resumo e um `PATCH` — nada além disso.
9. Nenhuma estrutura equivalente de contato/endereço já existia para reaproveitar (auditado); os
   campos de telefone/e-mail/endereço seguem o mesmo padrão de validação já usado por
   `Driver`/`MaintenanceProvider`/`FuelStation`.
10. Base preparada para as Fases 94–98: `CustomerContact`/`CustomerNote` e o endpoint de `summary`
    ficam disponíveis para qualquer evolução futura de relacionamento comercial, sem exigir
    retrabalho de schema.

## 7. Limitações reais (documentadas, não escondidas)

- `summary` não inclui nenhum valor monetário — quem precisa de faturamento/contas a receber por
  cliente continua usando os dashboards existentes (já presentes na mesma página).
- `firstTripAt`/`lastTripAt` refletem a **data de registro** da viagem (`Trip.createdAt`), não a data
  real de partida/chegada — que pode ser nula para viagens ainda não iniciadas.
- `CustomerNote` é append-only: não há edição nem remoção de uma observação já registrada.
- Não há paginação em `/customers/:id/contacts` e `/customers/:id/notes` — deliberado (regra 8):
  volume esperado por cliente é baixo; se isso deixar de ser verdade, é assunto de uma fase futura.
- Verificação de UI em navegador real não foi possível neste ambiente (sem ferramenta de automação de
  browser disponível); a validação de frontend cobriu typecheck, lint e `next build` bem-sucedidos,
  além dos testes e2e reais contra a API.

## 8. Testes

`apps/api/test/customer-crm.e2e-spec.ts` (14 testes, requests reais contra o Postgres): regressão de
`Customer` (create/list/get, agora com phone/email/address), filtro `isActive`, `PATCH`, CRUD
completo de `CustomerContact` (incluindo 404 ao tentar acessar contato de outro cliente), criação e
listagem de `CustomerNote`, `summary` com e sem dados (nunca inventa), isolamento multi-tenant
(cliente/contato/observação de um tenant invisíveis para outro), RBAC (`DRIVER` bloqueado,
`AUDITOR` lê mas não escreve) e ausência de N+1 (contagem de queries fixa entre 5 e 20 clientes/
viagens). `trips.e2e-spec.ts` e `freight.e2e-spec.ts` (suítes diretamente afetadas por `Customer`)
reexecutadas e continuam passando sem alteração (85 testes).
