# Múltiplas Entregas por Viagem (Fase 88)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `packages/database/prisma/schema.prisma`
(`Trip`, `RouteVersion`, `RouteEvent`, `RoutePlan`, `TripStop`, `TripOccurrence`, `Customer`,
`Location`, `Document`/`FiscalDocument`), `apps/api/src/trips/*` (`TripsService`,
`TripsController`, `RouteEventsService`, `LocationsService`, `CustomersService`), o módulo
`trip-operations` (`TripStopsService`, `TripOccurrencesService`), `apps/api/src/driver-trips/*`
(`DriverTripsController`, `DriverTripsService`), `apps/api/src/fleet/services/trip-compositions.service.ts`
(padrão de item ordenado — `TripCompositionTrailer.positionOrder`), o frontend em
`apps/admin-web/src/app/(app)/trips/[id]/page.tsx` e `apps/admin-web/src/features/trips/`, e o
Driver App em `apps/driver-app/src/api/driverTrips.*` e `apps/driver-app/src/screens/StopsScreen.tsx`.

### Conclusão da auditoria

**Trip já é a entidade única e correta para representar a viagem** — status
(`PLANNED -> WAITING_DRIVER -> WAITING_DEPARTURE -> IN_PROGRESS -> PAUSED -> COMPLETED | CANCELLED`),
motorista, composição, origem/destino (`Location`), cliente (`Customer`) e datas planejadas/reais
já existem e não foram tocados.

**`TripStop` (Fase 25/43) NÃO é a estrutura equivalente a "parada/entrega planejada"** — é uma
parada **operacional**, detectada automaticamente pelo app do motorista quando o veículo fica
parado por tempo acima do limite configurado (`type: UNKNOWN/FUEL/REST/MEAL/... /CUSTOMER/...`),
sem sequência, sem cliente/local vinculados por FK, sem previsão de chegada e sem conceito de
"planejamento". Reaproveitar `TripStop` para o pedido desta fase (paradas **planejadas**, com
sequência, destinatário, local, ETA manual e edição enquanto a viagem não partiu) exigiria
sobrecarregar um model com dois significados incompatíveis — a regra 3 do pedido ("verificar se já
existe alguma estrutura equivalente" antes de criar) foi seguida, e a conclusão foi que não existe
equivalente: `TripStop` resolve outro problema.

**`Location` e `Customer` (já usados por `Trip.origin/destinationLocationId` e `Trip.customerId`)
são exatamente os cadastros a reaproveitar** para "endereço/local da entrega" e "cliente/destinatário
quando já existir" — nenhum cadastro paralelo de endereço/cliente foi criado.

**O padrão de sequência ordenada já existia** em `TripCompositionTrailer.positionOrder`
(`@@unique([tripCompositionId, positionOrder])`, validado em `TripCompositionsService.assertUniquePositions`)
— o mesmo princípio (posição inteira, única dentro do "dono") foi reaproveitado aqui.

## 2. O que foi criado: `TripDeliveryStop`

Como nenhuma estrutura equivalente existia, foi criado **um único novo model**,
`TripDeliveryStop` (tabela `trip_delivery_stops`), sub-recurso de `Trip` — nunca uma segunda
entidade de viagem (regra 1):

```prisma
model TripDeliveryStop {
  id             String                 @id @default(uuid())
  tenantId       String
  tripId         String                 // FK -> Trip, obrigatório
  sequence       Int                    // posição 1..N, única dentro da viagem
  customerId     String?                // FK -> Customer, opcional
  locationId     String                 // FK -> Location, obrigatório
  status         TripDeliveryStopStatus @default(PENDING)
  plannedArrival DateTime?              // informado manualmente, nunca calculado
  notes          String?
  createdAt      DateTime
  updatedAt      DateTime

  @@unique([tripId, sequence])
}

enum TripDeliveryStopStatus { PENDING, IN_PROGRESS, COMPLETED, CANCELLED }
```

Migration: `packages/database/prisma/migrations/20260828000000_trip_delivery_stops`.

### Por que um model novo e não campos extras em `Trip`

`Trip` já modela **uma única** origem e **um único** destino (`originLocationId`/
`destinationLocationId`) — o pedido é para múltiplas paradas intermediárias de entrega dentro da
mesma viagem, uma relação 1:N que não cabe em colunas escalares de `Trip` sem duplicar a viagem
inteira por parada (o que violaria a regra 1). `Trip` continua sendo a entidade principal — as
paradas apenas **pertencem** a ela (`tripId`, cascade delete).

### Isolamento multi-tenant e integridade

- `tenantId` em toda leitura/escrita (regra 4), com índices `(tenantId)`, `(tenantId, tripId)`,
  `(tenantId, customerId)`, `(tenantId, locationId)`.
- `@@unique([tripId, sequence])` garante que a sequência nunca duplica dentro da mesma viagem
  (regra 5) no nível do banco, não apenas na aplicação.
- Remoção de uma parada **renumera automaticamente** as remanescentes para fechar a lacuna
  (1, 2, 3 → remove a 2 → vira 1, 2), preservando a regra "sequência consistente" sem exigir uma
  chamada extra do frontend.
- Reordenação (`PUT .../reorder`) exige a lista **completa** das paradas da viagem (todos os ids
  atuais, cobrindo exatamente `1..N`) — rejeita subconjuntos, ids desconhecidos, lacunas e
  repetições antes de tocar o banco (regra 6, "nunca duplicação acidental").
- Tanto a remoção quanto a reordenação usam uma técnica de **duas fases** (sequência temporária
  negativa → sequência final) dentro da mesma transação, para nunca colidir com a constraint única
  ao trocar posições entre si.

## 3. Regras de imutabilidade (regras 7 e 8)

Reaproveita o **mesmo critério** já usado por `TripCompositionsService.assertCompositionNotLocked`
(Fase 66): uma vez que `Trip.actualDeparture` é gravado (a viagem partiu de fato, sinal já usado
em todo o sistema — nunca um segundo sinal paralelo), o **planejamento** das paradas fica
congelado — nenhuma criação, edição de conteúdo, remoção ou reordenação é aceita
(`ConflictException` 409). Viagem `CANCELLED` também bloqueia qualquer alteração de planejamento.

O **status operacional** de cada parada (`PENDING -> IN_PROGRESS -> COMPLETED`, ou `CANCELLED`)
é uma exceção deliberada a essa trava: continua editável enquanto a viagem não chega a um estado
terminal (`COMPLETED`/`CANCELLED`), inclusive com a viagem `IN_PROGRESS`/`PAUSED` — é exatamente
quando a entrega acontece de verdade. Nenhuma lógica de início de viagem foi alterada (regra 8):
`TripsService.updateStatus`/`assertCanStart` continuam exatamente como estavam.

## 4. Endpoints (`TripDeliveryStopsService`, sub-recurso de `TripsController`)

| Método | Rota | Regra de acesso |
|---|---|---|
| `GET` | `/trips/:id/delivery-stops` | `TRIP_READ_ROLES` |
| `POST` | `/trips/:id/delivery-stops` | `TRIP_WRITE_ROLES`; 409 se a viagem já partiu/cancelada |
| `PATCH` | `/trips/:id/delivery-stops/:stopId` | idem — edita cliente/local/ETA/observações |
| `PATCH` | `/trips/:id/delivery-stops/:stopId/status` | `TRIP_WRITE_ROLES`; 409 se viagem `COMPLETED`/`CANCELLED` |
| `PUT` | `/trips/:id/delivery-stops/reorder` | `TRIP_WRITE_ROLES`; lista completa, valida `1..N` |
| `DELETE` | `/trips/:id/delivery-stops/:stopId` | `TRIP_WRITE_ROLES`; renumera as remanescentes |
| `GET` | `/driver/trips/:id/delivery-stops` | Driver App, somente leitura |

Nenhum papel/role novo foi criado — `TRIP_READ_ROLES`/`TRIP_WRITE_ROLES` (já existentes em
`trips/constants/trip-roles.constants.ts`) foram reaproveitados integralmente.

Criação nunca aceita `sequence` do cliente — é sempre calculada como `max(sequence) + 1` da
viagem, dentro de uma transação. "Adicionar parada" e "alterar sequência" são ações distintas
(conforme pedido), a segunda exclusivamente pelo endpoint de reorder.

## 5. Performance (sem N+1)

`GET /trips/:id/delivery-stops` resolve a viagem (1 query, já necessária para tenant/ownership) e
as paradas com `include: { customer, location }` (1 query com `JOIN`) — **2 queries fixas**,
independente do número de paradas. Coberto por teste de regressão que conta queries reais
(`$extends`) com 5/15/30 paradas seguidas (mesmo mecanismo já usado em `trip-stops.e2e-spec.ts`).

## 6. Frontend (`apps/admin-web`)

Nova aba **"Paradas/Entregas"** em `trips/[id]/page.tsx`
(`features/trips/tabs/delivery-stops-tab.tsx`), reaproveitando `DataTable`/`Badge`/`Dropdown`/
`ConfirmDialog`/`EntitySelect` já existentes — nenhum componente de tabela/formulário novo criado
do zero. Mostra sequência, cliente, local (nome + endereço), status, previsão de chegada e
observações; permite adicionar (`DeliveryStopModal`), editar, remover e reordenar (botões
mover para cima/baixo, sem biblioteca de drag-and-drop nova) enquanto `planningAllowed` for
verdadeiro (mesmo critério do backend: `trip.status !== 'CANCELLED' && !trip.actualDeparture`,
calculado uma vez em `page.tsx` e passado para a aba). A mudança de status da parada fica
disponível separadamente enquanto a viagem não estiver `COMPLETED`/`CANCELLED`.

## 7. Driver App (`apps/driver-app`)

Adicionado **somente leitura**: `TripDeliveryStop`/`TripDeliveryStopStatus` em
`api/driverTrips.types.ts` e `getDeliveryStops(tripId)` em `api/driverTrips.api.ts`, consumindo
`GET /driver/trips/:id/delivery-stops` (o mesmo `TripDeliveryStopsService` do admin, exportado por
`TripsModule` e injetado em `DriverTripsController` exatamente como `TripsService` — nenhuma
consulta paralela). Nenhuma tela nova, nenhuma navegação/roteirização/atualização de status pelo
motorista nesta fase — a leitura fica pronta para a tela do Driver App consumir numa fase futura.

## 8. O que NÃO foi implementado (por escopo)

- Roteirização/otimização automática de sequência (Fase 89).
- Cálculo de ETA por algoritmo — `plannedArrival` é sempre informado manualmente.
- Navegação GPS ou atualização de status da parada pelo motorista.
- Qualquer lógica financeira nova (paradas não têm valor/custo próprio nesta fase).
- Vínculo direto entre `TripDeliveryStop` e `TripOccurrence`/`FiscalDocument` (comprovante de
  entrega) — os dois seguem por `tripId` como hoje; um vínculo por parada específica fica para
  quando o comprovante por entrega for de fato implementado, sem exigir mudança de modelo aqui
  (o id estável de `TripDeliveryStop` já permite essa FK opcional no futuro sem migração de dados).
- Exigência de pelo menos uma parada por viagem — viagens simples (só origem/destino) continuam
  funcionando exatamente como antes, sem nenhuma parada cadastrada.

## 9. Testes

`apps/api/test/trip-delivery-stops.e2e-spec.ts` (13 testes, requests reais contra o Postgres):
criação com sequência automática, rejeição de cliente/local inexistentes, trava de planejamento
após a partida (create/update/reorder/delete bloqueados, status permanece editável), reordenação
(sucesso, subconjunto inválido, sequência com lacuna/duplicada), remoção com renumeração, máquina
de estados do status (avanço, idempotência, transição inválida), isolamento multi-tenant, RBAC de
leitura/escrita, leitura pelo Driver App e ausência de N+1. As suítes `trips.e2e-spec.ts` (66
testes) e `driver-trips.e2e-spec.ts` foram reexecutadas e continuam passando sem alteração —
nenhuma regressão nas funcionalidades existentes de planejamento/execução de viagem.
