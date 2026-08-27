# Gestão de Entregas (Fase 99)

## 1. Contexto e auditoria prévia

Antes de codificar, foi auditado `TripDeliveryStop` (Fase 88) e tudo que já opera sobre ele: CRUD completo
por viagem (`TripDeliveryStopsService`), reordenação segura (swap em duas fases), roteirização (Fase 89,
`TripRoutingService`), ETA (Fase 91, `TripEtaService`), classificação de viagem vazia (Fase 92,
`empty-trip.util.ts`), leitura pelo Driver App (`DriverTripsController`) e a aba "Entregas" já existente
na página da viagem (`DeliveryStopsTab`). O modelo já era extenso e bem testado — a fase pediu
explicitamente para evoluir **somente onde houvesse lacunas reais**, nunca recriar o que já existia.

### Reaproveitado sem duplicação

- **`TripDeliveryStop`/`TripDeliveryStopsService`** — nenhuma tabela nova. Toda a Fase 99 é evolução do
  mesmo model: novos campos e um novo valor de status, mais dois métodos de LEITURA cross-trip no mesmo
  service (nunca um segundo service/controller "dono" da regra de negócio).
- **`Customer`/`Location`/`Trip`/`Driver`** — a listagem cross-trip só faz `include` das relações já
  existentes (`customer`, `location`, `trip.driver`, `trip.origin`, `trip.destination`) — nenhum dado é
  copiado/duplicado para uma tabela própria.
- **`assertTripPlanningAllowed`** (Fase 88) — reaproveitado sem alteração: continua sendo a única trava
  de "planejamento" (criar/editar/remover/reordenar paradas). Ela nunca se aplica a `updateStatus`, que
  segue livre enquanto a viagem não estiver `COMPLETED`/`CANCELLED` (mesmo comportamento já existente).
- **`AuditService`/`TenantContext`/`Roles`/`TRIP_READ_ROLES`/`TRIP_WRITE_ROLES`** — reaproveitados
  integralmente, sem nenhum grupo de papéis novo.
- **`ParseBooleanQuery`** (`common/decorators`) — reaproveitado para o filtro `late` (nunca a armadilha
  de `@Type(() => Boolean)`, que trata `"false"` como truthy).
- **Padrão "campo de motivo obrigatório em transição terminal"** (`PipelineOpportunity.lostReason`, Fase
  96) — reaproveitado para `TripDeliveryStop.failureReason`: mesmo espírito, mesma validação no service
  (nunca uma constraint de banco), mesmo texto de erro (`BadRequestException`).
- **`buildPaginationMeta`** e o padrão "paginar primeiro, incluir relações na mesma query" (mesmo de
  `ContractsService`/`FreightRulesService`) — reaproveitados para a listagem cross-trip.

### Estrutura genuinamente nova (lacunas reais identificadas)

1. **Execução real da entrega** — o model só tinha `plannedArrival` (previsão). Não havia nenhum campo
   para registrar quando a parada de fato começou a ser atendida ou quando foi concluída. Adicionados
   `actualArrival` e `deliveredAt`.
2. **"Problema/ocorrência" na própria entrega** — `CANCELLED` já existia, mas com um significado
   específico ("removida do planejamento, nunca chegou a ser tentada"). Não havia como distinguir isso de
   "a entrega foi tentada e não deu certo" (endereço não localizado, destinatário ausente etc.), pedido
   explicitamente pela fase ("identificar claramente... problemas/ocorrências"). Adicionado o status
   `FAILED` + `failureReason` (motivo obrigatório).
3. **Visão cross-trip com busca/filtros/paginação/dashboard** — só existia `GET /trips/:id/delivery-stops`
   (uma viagem por vez). Não havia nenhuma forma de listar/filtrar entregas do tenant inteiro nem um
   resumo operacional. Adicionados `GET /delivery-stops` e `GET /delivery-stops/dashboard`.

Nenhuma outra estrutura foi criada. POD, ocorrências formais (módulo dedicado), documentos e qualquer
ação do motorista sobre a entrega ficam para fases futuras, conforme pedido — os novos campos
(`actualArrival`, `deliveredAt`, `failureReason`) são justamente a preparação mínima para essas fases,
sem implementá-las agora.

## 2. Execução real: previsão × execução

`plannedArrival` continua sendo informado manualmente no planejamento (nunca calculado). Os dois novos
campos são **sempre derivados da própria transição de status** — nunca informados manualmente pelo
frontend ou pela API — mesmo espírito de `PipelineOpportunity.wonAt`/`lostAt`:

- `actualArrival`: gravado automaticamente na primeira vez que a parada entra em `IN_PROGRESS`. Reentrar
  em `IN_PROGRESS` (ex: parada previamente movida para outro status manualmente por engano, quando
  permitido) nunca sobrescreve o instante já gravado.
- `deliveredAt`: gravado automaticamente ao entrar em `COMPLETED`.

## 3. Status `FAILED`: identificando problemas sem implementar ocorrências

`FAILED` é alcançável tanto de `PENDING` (problema identificado antes de qualquer tentativa — ex.:
endereço inválido) quanto de `IN_PROGRESS` (tentativa mal sucedida no local), mesma simetria já aplicada
a `CANCELLED`. É terminal (nunca sai de `FAILED`). Exige `reason` no corpo da requisição — validado no
service (`BadRequestException` quando ausente), gravado em `failureReason`.

```
        IN_PROGRESS ──► COMPLETED
       ╱      │
PENDING       ├──► CANCELLED
       ╲      │
        ╲     └──► FAILED  (reason obrigatório)
         ╲──────────────╱
```

Diferença de `CANCELLED`: `CANCELLED` = a entrega nunca precisou/pôde ser tentada (removida do
planejamento); `FAILED` = a entrega foi tentada e não teve sucesso. Consumidores existentes que já
classificavam pelas 4 status originais foram ajustados para não perder `FAILED` do total:
`TripEtaService` (uma parada `FAILED` é terminal, não recebe mais cálculo de ETA, mesmo critério de
`COMPLETED`/`CANCELLED`) e `empty-trip.util.ts`/`EmptyTripsService` (Fase 92) — `FAILED` conta junto de
`CANCELLED` para o motivo `ALL_DELIVERIES_CANCELLED` (em ambos os casos a viagem saiu vazia sem nenhuma
entrega efetivada); documentado no próprio código, nenhum enum de motivo novo foi criado.

## 4. Visão cross-trip: `GET /delivery-stops` e `GET /delivery-stops/dashboard`

Distinta de `GET /trips/:id/delivery-stops` (uma viagem por vez, ordem operacional/sequência — já
existia e não mudou). A nova listagem atravessa todas as viagens do tenant:

- **Filtros**: `status`, `customerId`, `tripId`, `search` (nome do cliente ou do local, `ILIKE`),
  `plannedFrom`/`plannedTo` (período pela previsão de chegada), `late` (somente `PENDING`/`IN_PROGRESS`
  com `plannedArrival` no passado — mutuamente exclusivo com `status`, documentado no DTO).
- **Paginação**: sempre no banco (`page`/`pageSize`), nunca carrega o tenant inteiro em memória.
- **Dashboard**: contagem por status (`pendingCount`/`inProgressCount`/`completedCount`/`failedCount`/
  `cancelledCount`) + `lateCount` + `totalCount`, aceitando os mesmos filtros de cliente/período/busca
  (nunca `status`/`late`, que não fazem sentido num endpoint que produz a contagem por status).

## 5. APIs (`apps/api/src/trips`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/trips/:id/delivery-stops` | Entregas de UMA viagem, em ordem de sequência (Fase 88, inalterado) |
| `PATCH` | `/trips/:id/delivery-stops/:stopId/status` | Transição de status (`reason` obrigatório para `FAILED`) |
| `GET` | `/delivery-stops` | Entregas de TODAS as viagens do tenant — busca/filtros/paginação |
| `GET` | `/delivery-stops/dashboard` | Resumo operacional: contagem por status + atrasadas |

RBAC: `TRIP_READ_ROLES` (leitura) reaproveitado sem alteração. Gate `@RequireModule(TenantModule.TRIPS)`,
mesmo critério de `TripsController`.

## 6. Frontend (`apps/admin-web`)

- **Aba "Entregas" da viagem** (`DeliveryStopsTab`, já existente): nova coluna "Execução" (chegada real/
  entrega concluída, ou motivo da falha quando `FAILED`); menu de ação ganhou "Marcar como com falha",
  que abre `FailDeliveryStopModal` (motivo obrigatório) em vez de mutar direto — mesmo padrão de
  `MoveStageReasonModal` (Fase 96, movimentação para estágio de perda no Pipeline).
- **`/operations/deliveries`** (nova página): indicadores (total/pendentes/em andamento/concluídas/com
  falha/atrasadas) + listagem com busca/filtros (cliente, status, período, atraso)/paginação, cada linha
  aponta para a viagem de origem. Reaproveita `DataTable`/`FilterBar`/`Pagination`/`StatCard`/
  `EntitySelect`/`Select`/`Badge`/`DatePicker` já existentes — nenhum componente de UI genérico novo.

## 7. Performance / N+1

- `GET /trips/:id/delivery-stops`: inalterado (já era O(1), 1 query com `include`).
- `GET /delivery-stops`: 1 query paginada com `include` (customer/local/viagem/motorista/origem/destino)
  + 1 `count()` — nunca 1 query por entrega/viagem, independente de quantas viagens distintas aparecem na
  página. Testado: contagem de queries fixa entre 5 e 30 viagens (uma entrega cada).
- `GET /delivery-stops/dashboard`: `groupBy(status)` + 1 `count()` (atrasadas) — 2 queries fixas,
  independente do volume de entregas do tenant.

## 8. Limitações reais (documentadas, não inventadas)

- **`actualArrival`/`deliveredAt` são sempre derivados da transição de status** — não há como
  registrá-los com um instante diferente do momento real da chamada (ex.: lançar retroativamente uma
  chegada de ontem). Não foi pedido pela fase e evita abrir uma segunda forma de "editar" a execução por
  fora da máquina de estados.
- **`FAILED` não gera notificação nem ocorrência formal ainda** — a fase pediu explicitamente para não
  implementar o módulo de ocorrências agora; `failureReason` fica disponível no registro e no
  `AuditLog` para as fases futuras construírem em cima, sem que nada precise migrar depois.
- **Sem POD (assinatura/foto) e sem ação do motorista sobre a entrega** — fora de escopo desta fase,
  como pedido; o Driver App continua somente leitura sobre `TripDeliveryStop` (Fase 88, inalterado).
- **`late` é calculado no momento da consulta, nunca persistido** — não existe um job/flag "atrasada" na
  tabela; mudar o relógio ou o `plannedArrival` muda o resultado imediatamente, por design.

## 9. Testes

`apps/api/test/trip-delivery-stops.e2e-spec.ts` (22 testes, requests reais contra o Postgres — 14 já
existentes da Fase 88, mais 8 novos desta fase): criação/edição/consulta e regras de bloqueio por
planejamento (regressão), reordenação segura (regressão), transição `PENDING → IN_PROGRESS → COMPLETED`
com gravação de `actualArrival`/`deliveredAt` (idempotente — não sobrescreve o primeiro instante real),
`FAILED` exigindo `reason` e alcançável de `PENDING`/`IN_PROGRESS` (terminal), listagem cross-trip
(contexto da viagem, filtros por cliente/viagem/status/busca/período/atraso, paginação, isolamento
multi-tenant, RBAC), dashboard (contagem por status + atrasadas), isolamento multi-tenant e RBAC
(regressão), leitura pelo Driver App (regressão) e ausência de N+1 (regressão da listagem por viagem +
novo teste da listagem cross-trip, 5 a 30 viagens).

Regressão executada: `trips.e2e-spec.ts` (viagens em geral), `trip-routing.e2e-spec.ts` (roteirização
sobre as mesmas paradas), `driver-trips.e2e-spec.ts` (Driver App), `trip-eta.e2e-spec.ts` (ETA — ajustado
para tratar `FAILED` como terminal), `trip-empty-runs.e2e-spec.ts` (classificação de viagem vazia —
ajustada para não perder `FAILED` da contagem) e `fleet-operations.e2e-spec.ts` — todos passando.
`empty-trip.util.spec.ts` (unitário) atualizado com os novos casos de `FAILED`.
