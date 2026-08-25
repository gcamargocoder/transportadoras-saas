# Planejamento de Viagens (Fase 87)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `packages/database/prisma/schema.prisma`
(`Trip`, `TripComposition`, `RouteVersion`, `Vehicle`, `Driver`), `apps/api/src/trips/services/trips.service.ts`
(`create`/`update`/`updateStatus`/`softDelete`/`assertCanStart`/`assertDriverAvailable`/
`assertVehicleAvailable`/`assertCompositionAvailable`), `VehicleAvailabilityService` (Fase 81/86),
`apps/api/test/trips.e2e-spec.ts` e todo o frontend já existente em
`apps/admin-web/src/app/(app)/trips/` e `apps/admin-web/src/features/trips/`.

**Conclusão da auditoria: o planejamento operacional de viagens já existia quase por
completo, desde fases muito anteriores (14, 26-29, 62...).** `Trip.status` já nasce como
`PLANNED` (default do schema), e o próprio comentário do schema já documenta o ciclo de vida
como `PLANNED -> IN_PROGRESS -> COMPLETED | CANCELLED`. Nada disso foi recriado.

| Item pedido pela Fase 87 | Já existia | Fase |
|---|---|---|
| Criação de planejamento (origem/destino/motorista/veículo/datas/observações) | `POST /trips` (`CreateTripDto`/`TripsService.create`) | 14/26/27 |
| Status do planejamento | `Trip.status` (`TripStatus.PLANNED` por padrão) | 14 |
| Associação com a viagem | **É o mesmo registro** — não existe uma entidade "plano" separada da "viagem"; o planejamento evolui via `Trip.status`, nunca uma segunda tabela | 14 |
| Validação de disponibilidade do motorista (ativo) | `assertDriverAvailable` (`Driver.isActive`) | 14 |
| Conflito de agenda (motorista e veículo, por sobreposição de `plannedDeparture`/`plannedArrival`) | `assertDriverAvailable`/`assertVehicleAvailable` (overlap de `NON_TERMINAL_STATUSES`) | 14 |
| Composição já vinculada a outra viagem | `assertCompositionAvailable` | 14 |
| Edição do planejamento (somente PLANNED) | `PATCH /trips/:id` (`TripsService.update`, bloqueia fora de PLANNED) | 14 |
| Cancelamento | `PATCH /trips/:id/cancel` + `PATCH /trips/:id/status` (`ALLOWED_TRANSITIONS`) | 14 |
| Visualização + filtros (período/status/veículo/motorista/busca) | `GET /trips` (`FindTripsQueryDto`: `status`, `driverId`, `vehicleId`, `departureFrom/To`, `search`) | 14/62 |
| Tela de listagem com filtros, paginação, criação, acesso ao detalhe | `apps/admin-web/.../trips/page.tsx` + `CreateTripModal` | 14+ |
| RBAC/isolamento multi-tenant | `TRIP_READ_ROLES`/`TRIP_WRITE_ROLES` + `TenantContext` | 6/14 |

Nenhum desses itens foi recriado ou duplicado. Todos os 65 testes pré-existentes de
`trips.e2e-spec.ts` (mais 40 de outras suítes de viagem afetadas — `driver-trips`,
`trip-operational-consolidation`, `trip-operations-load`, `trip-operations-monitor`,
`trip-stops`) continuam passando sem alteração.

## 2. Por que reaproveitar `Trip` em vez de criar `PlannedTrip`

`Trip.status` já modela exatamente a distinção pedida pela regra 7 ("planejamento não
significa viagem iniciada"): `PLANNED` é um planejamento que ainda não iniciou;
`WAITING_DRIVER`/`WAITING_DEPARTURE`/`IN_PROGRESS`/`PAUSED` são a viagem em execução;
`COMPLETED`/`CANCELLED` são estados terminais. Criar uma tabela `PlannedTrip` paralela
exigiria (a) duplicar origem/destino/motorista/composição/datas/observações, (b) resolver
como "promover" um plano para uma viagem real (nova FK, nova migração de dados, um segundo
fluxo de disponibilidade), e (c) manter duas fontes de verdade para a mesma pergunta ("essa
composição está livre?"). Nada disso agrega correção — só risco. A regra 2 do pedido já
antecipava essa conclusão.

## 3. O que foi implementado (lacuna real)

### 3.1 Validação de disponibilidade do **veículo** no planejamento (create/update)

**Problema encontrado na auditoria**: `assertVehicleAvailable` (chamada por `create()` e por
`update()` quando a composição muda) já validava conflito de agenda (sobreposição de
período com outra viagem não-terminal), mas **nunca verificava o `Vehicle.status`** — um
veículo `INACTIVE`/`SUSPENDED`/`MAINTENANCE`/`SOLD` podia ser livremente planejado. Só o
**início** da viagem (`assertCanStart`, chamado ao transicionar para `IN_PROGRESS`) barrava
isso. Ou seja: a regra 4 ("não permitir planejamento com veículo indisponível") não estava
implementada — apenas a regra equivalente para o **início** da viagem.

**Solução**: `assertVehicleAvailable` passou a reaproveitar `resolveVehicleAvailability`
(Fase 81/86, importada de `fleet/services/vehicle-availability.service.ts` — nenhuma
segunda implementação da regra) para rejeitar (`409`) qualquer veículo com
`status != ACTIVE` no momento do planejamento (create ou update de composição).

```
resolveVehicleAvailability(vehicle.status, onTrip=false) === 'UNAVAILABLE' -> 409
```

`onTrip` é **forçado a `false`** de propósito: "estar em viagem agora" não impede planejar
uma viagem **futura** para o mesmo veículo (isso é papel exclusivo da checagem de conflito de
agenda, que já existia e continua inalterada) — só o **status** do veículo (inativo,
suspenso, em manutenção, vendido) bloqueia o planejamento em si. Essa distinção evita uma
falsa rejeição (um veículo que está em viagem agora mas ficará livre a tempo de uma nova
viagem planejada para semanas depois continua plenamente planejável).

O motorista já tinha o equivalente (`Driver.isActive`) desde a criação do módulo — não foi
alterado.

### 3.2 `TripsService.assertCanStart` — preservado sem alteração

Conforme a regra 6, `assertCanStart` (validação executada apenas na transição para
`IN_PROGRESS`) não foi tocado. Planejamento (regra 4, seção 3.1 acima) e início efetivo
(regra 6, já existente) continuam sendo duas checagens distintas, em dois momentos
distintos — exatamente como pedido.

### 3.3 Frontend: editar e cancelar o planejamento

**Problema encontrado**: a tela de detalhe da viagem (`apps/admin-web/.../trips/[id]/page.tsx`)
não tinha nenhum botão de "editar planejamento" (só um `<select>` genérico de status na aba
"Visão geral", que permite qualquer transição de status, sem UI dedicada para alterar
origem/destino/motorista/composição/datas) nem um botão de "cancelar" — apesar de
`cancelTrip` já existir no client de API (`lib/api/trips.api.ts`) **sem nenhum consumidor**.

**Solução**:
- `UpdateTripPlanModal` (novo, `features/trips/update-trip-plan-modal.tsx`) — reaproveita
  integralmente `createTripSchema`/`CreateTripFormValues` (mesmo formulário do
  `CreateTripModal`, mesmos componentes `EntitySelect`/`FormField`/`Modal`/`Input`/`Select`),
  chamando `updateTrip` (já existente). Só aparece quando `trip.status === 'PLANNED'` e o
  usuário tem papel de escrita (`TRIP_WRITE_ROLES`) — mesma regra já aplicada pelo backend em
  `TripsService.update`.
- Botão "Cancelar viagem" + `ConfirmDialog` (componente já existente, reaproveitado do mesmo
  padrão usado em `toll-routes/[id]`, `maintenances/[id]`, etc.) — finalmente conecta o
  `cancelTrip` já existente. Aparece enquanto o status não é terminal (`COMPLETED`/
  `CANCELLED`) — o backend (`ALLOWED_TRANSITIONS`) continua sendo a única fonte de verdade
  sobre quais transições são válidas; o frontend só evita mostrar a ação quando ela
  certamente falharia.

Nenhuma tela nova foi criada — a listagem (`/trips`, com filtros de busca/status/motorista/
veículo/cliente/origem/destino/período, paginação, criação, clique para o detalhe) e o
detalhe (`/trips/:id`) já existiam e cobriam a maior parte do pedido; esta fase apenas
evoluiu o detalhe.

### 3.4 Identificação de conflitos no frontend

Não foi criado um endpoint dedicado de "pré-checagem" de conflito. Tanto `CreateTripModal`
quanto o novo `UpdateTripPlanModal` já exibem a mensagem exata do `ConflictException` (409)
retornada pelo backend via `toFriendlyMessage(error)` num toast — as mensagens já são
específicas e distinguem os casos ("Motorista já possui outra viagem planejada/em andamento
no mesmo período.", "Veículo já possui outra viagem planejada/em andamento no mesmo
período.", "Veículo indisponível para planejamento (status diferente de ativo).", "Esta
composição já está vinculada a outra viagem."). Criar uma pré-checagem síncrona duplicaria a
mesma regra de conflito no frontend — rejeitado pela regra 2 do pedido (aplicada aqui por
analogia).

## 4. Estados do planejamento

`TripStatus`: `PLANNED` (planejamento, editável, cancelável) → `WAITING_DRIVER` →
`WAITING_DEPARTURE` → `IN_PROGRESS` (execução real) → `PAUSED` ⇄ `IN_PROGRESS` → `COMPLETED`.
`CANCELLED` é alcançável de qualquer estado não-terminal. Ver `ALLOWED_TRANSITIONS` em
`trips.service.ts` (inalterado nesta fase).

## 5. Validações (resumo)

| Validação | Quando | Fonte |
|---|---|---|
| Motorista existe e está ativo | create/update | `assertDriverAvailable` (existente) |
| Motorista sem conflito de agenda | create/update | `assertDriverAvailable` (existente) |
| Composição existe e está livre | create/update | `assertCompositionAvailable` (existente) |
| **Veículo com status ACTIVE** | create/update | `assertVehicleAvailable` (**novo nesta fase**, reaproveita `resolveVehicleAvailability`) |
| Veículo sem conflito de agenda | create/update | `assertVehicleAvailable` (existente) |
| Origem ≠ destino | create/update | `TripsService` (existente) |
| Chegada prevista > saída prevista | create/update | `TripsService` (existente) |
| Motorista ativo + sem viagem ativa concorrente | início (`IN_PROGRESS`) | `assertCanStart` (existente, inalterado) |
| Veículo ACTIVE (não `MAINTENANCE`/outro) + sem viagem ativa concorrente | início (`IN_PROGRESS`) | `assertCanStart` (existente, inalterado) |
| Só `PLANNED` pode ser editada | update | `TripsService.update` (existente) |
| Só `PLANNED`/`CANCELLED` pode ser excluída | delete | `TripsService.softDelete` (existente) |

## 6. Relação planejamento → viagem

Não há "associação" no sentido de uma FK entre duas entidades — **o planejamento é a
viagem**, no estado `PLANNED`. Ao avançar de status (despacho, início, conclusão), o mesmo
registro `Trip` passa a representar a execução real, preservando todo o histórico
(`RouteVersion`, `TripMetrics`, auditoria) desde o momento em que era só um plano. Isso
satisfaz literalmente a regra 7 ("planejamento não significa viagem iniciada") sem precisar
de nenhuma tabela ou campo de associação: a mesma `id` de `Trip` serve para as duas coisas em
momentos diferentes do ciclo de vida.

## 7. Arquivos criados/alterados

**Criados**:
- `apps/admin-web/src/features/trips/update-trip-plan-modal.tsx`
- `apps/admin-web/src/app/(app)/trips/[id]/page.test.tsx`
- `docs/trip-planning.md` (este arquivo)

**Alterados**:
- `apps/api/src/trips/services/trips.service.ts` — `assertVehicleAvailable` passa a checar
  `resolveVehicleAvailability` (import de `fleet/services/vehicle-availability.service.ts`)
- `apps/api/test/trips.e2e-spec.ts` — 4 testes novos (veículo indisponível no create, ok com
  veículo ativo, veículo indisponível no update, N+1 de `GET /trips`)
- `apps/admin-web/src/app/(app)/trips/[id]/page.tsx` — botões "Editar planejamento"/
  "Cancelar viagem" + `UpdateTripPlanModal`/`ConfirmDialog`

**Migrations**: nenhuma — nenhuma alteração de schema.

## 8. APIs

Nenhum endpoint novo. `POST /trips` e `PATCH /trips/:id` passam a rejeitar (`409`) veículos
com status diferente de `ACTIVE`. `PATCH /trips/:id/cancel` (já existente) passou a ser
efetivamente consumido pelo frontend.

## 9. Frontend

`apps/admin-web/.../trips/page.tsx` (listagem, filtros, criação) — inalterada, já cobria o
pedido. `apps/admin-web/.../trips/[id]/page.tsx` — evoluída com "Editar planejamento"
(enquanto `PLANNED`) e "Cancelar viagem" (enquanto não-terminal), ambos reaproveitando
`Modal`/`ConfirmDialog`/`FormField`/`EntitySelect`/`Select`/`Input`/`Button` já existentes.

## 10. Integrações

Nenhuma integração nova. Reaproveita `VehicleAvailabilityService`/`resolveVehicleAvailability`
(Fase 81/86), `Driver`/`Vehicle`/`Location`/`TripComposition` (já existentes).

## 11. Testes executados

- **E2e** (novo, em `trips.e2e-spec.ts`): rejeita planejamento com veículo
  `INACTIVE`/`SUSPENDED`/`MAINTENANCE`/`SOLD` (409, testado nos 4 status); permite
  normalmente com veículo `ACTIVE` (regressão do teste anterior); rejeita trocar para uma
  composição com veículo indisponível ao editar (409); N+1 de `GET /trips` (contagem de
  queries não cresce entre 3 e 15 viagens).
- **E2e** (regressão, sem alteração nos arquivos de teste existentes): `trips.e2e-spec.ts`
  (65/65, incluindo os 4 novos), `driver-trips.e2e-spec.ts` (66/66 combinado),
  `trip-operational-consolidation.e2e-spec.ts`, `trip-operations-load.e2e-spec.ts`,
  `trip-operations-monitor.e2e-spec.ts`, `trip-stops.e2e-spec.ts` (40/40).
- **Frontend** (novo): `trips/[id]/page.test.tsx` — 5 testes (botões aparecem em `PLANNED`,
  "Editar" some fora de `PLANNED`, ambos somem em estado terminal, ambos somem para perfil
  somente leitura, cancelamento chama `cancelTrip` após confirmação).
- **Frontend** (regressão): `reconciliation-tab.test.tsx`, `timeline-tab.test.tsx` — 9/9.
- **Typecheck**: `apps/api` e `apps/admin-web` (`tsc --noEmit`) — limpos.
- **Lint**: todos os arquivos alterados/criados — limpo.

Não foi executada a suíte completa do monorepo nem build — sem alteração de schema, o
escopo desta fase não justificava uma regressão ampla.

## 12. Performance / N+1

A nova checagem de disponibilidade do veículo adiciona **exatamente 1 query** por chamada de
`create()`/`update()` (operações de registro único, nunca em lote) — sem impacto em
listagem. `GET /trips` (visualização das viagens planejadas) já usava uma única query
paginada + `count` em paralelo (`TRIP_INCLUDE`, existente desde a Fase 14) — teste dedicado
confirma que isso continua valendo (contagem de queries não cresce entre 3 e 15 viagens).

## 13. Limitações reais

- Roteirização, cálculo de distância/ETA e otimização de múltiplas entregas **não foram
  implementados** (fora do escopo, conforme a própria Fase 87 — tratados nas fases
  seguintes). `plannedMetrics` (distância/duração/combustível/pedágio/custo previstos)
  continua sendo **informado manualmente pelo chamador**, nunca calculado ou inventado pelo
  sistema (regra 10, já era assim desde a criação do campo).
  ETA e "identificar conflitos de veículo/motorista" no frontend dependem inteiramente da
  mensagem de erro do backend no momento do envio do formulário — não há uma pré-visualização
  de conflitos antes de submeter (ex.: destacar no calendário os períodos já ocupados do
  motorista/veículo selecionado). Implementar isso exigiria um novo endpoint de consulta de
  disponibilidade por intervalo, fora do escopo mínimo desta fase.
- O dropdown de composição (`EntitySelect` em `CreateTripModal`/`UpdateTripPlanModal`) lista
  **todas** as composições do tenant, incluindo as já vinculadas a outra viagem ou com
  veículo indisponível — a rejeição só ocorre no envio do formulário (backend). Filtrar a
  lista exigiria um novo parâmetro `available` em `GET /trip-compositions` cujo impacto na
  edição (a composição atualmente vinculada à própria viagem precisa continuar aparecendo
  como opção) tornaria a mudança maior que o necessário para esta fase — não implementado.
- `TripsService.assertCanStart` continua sendo a única validação no momento do início efetivo
  da viagem — não foi tocado, conforme a regra 6.
