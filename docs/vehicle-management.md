# Gestão Avançada de Veículos e Frota (Fase 62)

## Escopo

| Item | Status |
|---|---|
| Status operacional (SUSPENDED) | ✅ |
| Classificação de propriedade (OWN/AGGREGATED/THIRD_PARTY) | ✅ |
| Disponibilidade derivada (AVAILABLE/ON_TRIP/UNAVAILABLE) | ✅ |
| Motorista atual + histórico (direção Vehicle → Driver) | ✅ |
| Viagem atual + viagens recentes | ✅ |
| Documentos do veículo (CRLV, ANTT, seguro, licenciamento...) | ✅ |
| Alertas operacionais do veículo | ✅ |
| Indicadores/métricas consolidados (`GET /vehicles/:id/overview`) | ✅ |
| `GET /vehicles/summary` agregado | ✅ |
| Dashboard de frota atualizado (suspensos + distribuição de propriedade) | ✅ |
| Manutenção completa / abastecimento avançado / Torre de Controle | ❌ (fases futuras) |

## Auditoria prévia (o que já existia vs. o que foi criado)

Antes de qualquer código, o módulo `apps/api/src/fleet/` (Vehicle/Trailer/Maintenance/
TripComposition/VehicleTag), `fleet-operations/` (dashboard consolidado) e o restante do
sistema foram auditados. Principais achados que guiaram todas as decisões:

- **`VehicleStatus`** já existia (`ACTIVE/INACTIVE/MAINTENANCE/SOLD`) — em vez de criar um
  `VehicleOperationalStatus` paralelo (como o pedido sugeria "preferencialmente"), o enum
  existente foi **estendido** com `SUSPENDED`. Nenhum campo `isActive` paralelo foi criado
  (diferente da Fase 61/Driver): `VehicleStatus` já era a única fonte de verdade.
- **Bloqueio de início de viagem já existia** em `TripsService.assertCanStart`
  (`apps/api/src/trips/services/trips.service.ts`): `vehicle.status !== VehicleStatus.ACTIVE`
  já lança `ConflictException`. Adicionar `SUSPENDED` ao enum fez esse bloqueio passar a
  cobrir o novo estado **automaticamente, com zero alterações nesse arquivo** — mesmo
  princípio de reaproveitamento usado na Fase 61 com `Driver.isActive`.
- **Classificação de propriedade não existia** (`category` era um campo de texto livre,
  não um enum) — foi criado `VehicleOwnershipType` (`OWN/AGGREGATED/THIRD_PARTY`), mesma
  nomenclatura de `DriverType` (Fase 61) por consistência.
- **`DriverVehicleAssignment`** (Fase 61) já existia — a direção Driver → Vehicle já era
  coberta; faltava apenas a direção inversa (Vehicle → Driver), implementada como uma
  nova query sobre a **mesma tabela**, nunca uma tabela nova.
- **Custos/financeiro por veículo já existiam** em `FleetOperationsMetricsService`
  (`getFinancialDashboard`, `getCosts`, `getDowntimeCost`, todos aceitando `?vehicleId=`).
  O overview do veículo reaproveita `getFinancialDashboard` diretamente — nenhum cálculo de
  receita/despesa/custo/margem foi duplicado.
- **`FleetAlertEntity`** (Fase 41, `fleet-operations/entities/fleet-alert.entity.ts`) já
  existia como camada de alertas em memória (nunca persistida). Os novos alertas de veículo
  reaproveitam **exatamente essa mesma classe**, apenas estendendo o union `FleetAlertType`
  com 7 valores novos (`VEHICLE_SUSPENDED`, `VEHICLE_INACTIVE`,
  `VEHICLE_DOCUMENT_EXPIRED`, `VEHICLE_DOCUMENT_EXPIRING_SOON`,
  `VEHICLE_DRIVER_UNAVAILABLE`, `VEHICLE_TRIP_DATA_INCONSISTENCY`,
  `VEHICLE_OPEN_MAINTENANCE`).
- **`Document`/`DocumentOwnerType.VEHICLE`** já existiam no schema (desde antes da Fase 61)
  mas nunca tinham service/controller — só o lado `DRIVER` estava implementado. O novo
  `VehicleDocumentsService` reaproveita o **mesmo model**, mesmo padrão de
  `DriverDocumentsService`.
- **`GET /vehicles/:id/maintenances`, `GET /vehicles/:id/fuel-history`** já existiam e
  já retornavam contagens/agregados prontos (`meta.total`, `suppliesCount`) — reaproveitados
  no overview em vez de novas contagens via Prisma direto.
- **Gap real encontrado durante a integração** (não fazia parte do pedido, mas foi corrigido
  por ser bloqueante para "motorista atual do veículo" funcionar corretamente):
  `DriversService.assignVehicle` (Fase 61) só fechava o vínculo aberto do **motorista** ao
  trocar de veículo, nunca o vínculo aberto de **outro motorista** no mesmo veículo — dois
  motoristas podiam ficar simultaneamente "atuais" no mesmo veículo. Corrigido com 4 linhas
  adicionais (fecha também o vínculo aberto do veículo, se pertencer a outro motorista),
  preservando 100% do histórico (nunca apaga, só `endedAt`).

## Modelagem (schema, migração aditiva)

```prisma
enum VehicleStatus {
  ACTIVE
  INACTIVE
  SUSPENDED   // novo
  MAINTENANCE
  SOLD
}

enum VehicleOwnershipType {
  OWN
  AGGREGATED
  THIRD_PARTY
}

model Vehicle {
  // ...campos existentes inalterados...
  status        VehicleStatus        @default(ACTIVE)
  ownershipType VehicleOwnershipType @default(OWN)  // novo
  // ...
  @@index([tenantId, ownershipType])  // novo
  @@index([tenantId, status])         // novo
}
```

Nenhum campo removido, nenhum default alterado, nenhuma tabela apagada. Migration
`20260817000000_vehicle_classification`: `ALTER TYPE vehicle_status ADD VALUE 'SUSPENDED'`
+ `CREATE TYPE vehicle_ownership_type` + `ALTER TABLE vehicles ADD COLUMN ownership_type
NOT NULL DEFAULT 'OWN'` + 2 índices. `prisma migrate status`: up to date, sem drift.

## Status operacional

| Status | Significado |
|---|---|
| `ACTIVE` | Operacional. |
| `INACTIVE` | Desativado. |
| `SUSPENDED` | Impedimento temporário (ex: pendência documental, decisão administrativa) — distinto de `MAINTENANCE` (fisicamente em oficina). |
| `MAINTENANCE` | Em manutenção (pré-existente). |
| `SOLD` | Vendido (pré-existente). |

Toda transição é auditada. Ações distintas (função pura
`resolveVehicleStatusChangeAction`, `apps/api/src/fleet/utils/vehicle-status-transition.util.ts`):

- `SUSPENDED → ACTIVE` → `vehicle.activated`
- `INACTIVE → ACTIVE` → `vehicle.reactivated`
- `* → SUSPENDED` → `vehicle.suspended`
- `* → INACTIVE` → `vehicle.deactivated`
- Qualquer transição envolvendo `MAINTENANCE`/`SOLD` → `vehicle.status_changed`
  (nome genérico **preservado de propósito** — comportamento pré-Fase 62 inalterado,
  garante que `fleet.e2e-spec.ts` continua passando sem alteração).

## Disponibilidade (derivada, nunca persistida)

`VehicleEntity.availability` é calculada em tempo de leitura, nunca armazenada em coluna
(pedido explícito da Fase 62: "não transformar isAvailable em campo com duplicação de
estado"):

- `status !== ACTIVE` → `UNAVAILABLE` (cobre INACTIVE/SUSPENDED/MAINTENANCE/SOLD —
  todos com dado 100% confiável, nenhuma heurística).
- `status === ACTIVE` e o veículo tem composição vinculada a uma viagem `IN_PROGRESS`/
  `PAUSED` agora → `ON_TRIP` (mesmo critério de `countVehiclesOnTrip`, já usado desde a
  Fase 41 no dashboard).
- `status === ACTIVE` e sem viagem em andamento → `AVAILABLE`.

Como os três fatores (status, manutenção, viagem em andamento) são sempre confiáveis nesta
base, **não existe estado `UNKNOWN`** — diferente do que a especificação previa como
possibilidade, os dados disponíveis cobrem os três casos com certeza.

Resolvida em lote: `GET /vehicles` resolve motorista atual + "em viagem agora" de toda a
página em 2 queries (nunca 1 por linha).

## Classificação de propriedade

`VehicleOwnershipType` (`OWN`/`AGGREGATED`/`THIRD_PARTY`), mesma nomenclatura de
`DriverType`. Mudança de classificação audita `vehicle.ownership_changed` (distinto do
`vehicle.updated` genérico), mesmo padrão de `driver.classification_changed`.

## Motorista atual e histórico

Reaproveita 100% a tabela `DriverVehicleAssignment` (Fase 61) — nenhuma tabela nova.
`GET /vehicles/:id/driver-assignments` é a consulta pela ótica do veículo (`WHERE
vehicleId = :id`), o inverso exato de `GET /drivers/:id/vehicle-assignments`. Histórico
nunca apagado (só `endedAt`).

## Viagem atual

Reaproveita `Trip`/`TripComposition`/`TripStatus` — nenhum status novo. "Em andamento" =
composição do veículo vinculada a um `Trip` com status `IN_PROGRESS`/`PAUSED` (mesmo
critério de `countVehiclesOnTrip`). Se mais de uma viagem em andamento for encontrada
simultaneamente para o mesmo veículo (inconsistência de dados, jamais deveria ocorrer dado
o restante da aplicação), o sistema **não escolhe arbitrariamente**: `currentTrip` retorna
`null`, `currentTripInconsistent: true`, e um alerta `CRITICAL` (`VEHICLE_TRIP_DATA_INCONSISTENCY`)
é emitido listando os IDs conflitantes.

## Documentos

Reaproveita o model `Document` genérico (`DocumentOwnerType.VEHICLE`, já existente no
schema desde antes da Fase 61, mas sem service/controller). Novo `VehicleDocumentsService`
espelha `DriverDocumentsService`. Indicador de vencimento (`resolveDocumentExpiryStatus`,
limiar de 30 dias — mesmo limiar já usado por `cnhExpiringThreshold` do módulo de
motoristas): `VALID` / `EXPIRING_SOON` / `EXPIRED` / `NO_EXPIRY`.
`documentsProblematic` no overview = contagem de documentos `EXPIRED` (não existe no
model nenhum outro sinal de "problema estrutural" — nunca inventado).

## Alertas

Reaproveita a classe `FleetAlertEntity` (Fase 41, `fleet-operations/entities/fleet-alert.entity.ts`),
apenas estendendo o union `FleetAlertType`. Nenhum sistema de alertas paralelo. Gerados
apenas na visão do veículo (`GET /vehicles/:id/overview`), nunca persistidos:

- `VEHICLE_SUSPENDED` (CRITICAL) / `VEHICLE_INACTIVE` (ATTENTION)
- `VEHICLE_DOCUMENT_EXPIRED` (CRITICAL) / `VEHICLE_DOCUMENT_EXPIRING_SOON` (ATTENTION)
- `VEHICLE_DRIVER_UNAVAILABLE` (CRITICAL) — motorista atual SUSPENDED/INACTIVE
- `VEHICLE_TRIP_DATA_INCONSISTENCY` (CRITICAL)
- `VEHICLE_OPEN_MAINTENANCE` (ATTENTION) — manutenção com status fora de
  COMPLETED/CANCELLED (mesmo critério já usado por `VehiclesService.softDelete`)

## Indicadores (`GET /vehicles/:id/overview`)

Todos reaproveitados de serviços já existentes, nunca recalculados em paralelo:

| Indicador | Fonte |
|---|---|
| Receita/despesas/custo/resultado/margem | `FleetOperationsMetricsService.getFinancialDashboard({vehicleId})` |
| Quantidade de manutenções | `MaintenancesService.findAllForVehicle(...).meta.total` |
| Quantidade de abastecimentos | `FuelSuppliesService.getVehicleFuelHistory(...).suppliesCount` |
| Total/concluídas/em andamento/canceladas (viagens) | `groupBy` em `Trip` filtrado por composição do veículo |
| Distância total percorrida | **`null`** — sem fonte agregada confiável nesta fase (ver Limitações) |

## `GET /vehicles/summary`

Agregado via `groupBy`/`count` em paralelo (independente da quantidade de veículos):
`total`, `totalActive/Inactive/Suspended/Maintenance`, `totalAvailable/Unavailable/OnTrip`,
`totalOwn/Aggregated/ThirdParty`.

## Driver App

**Nenhuma alteração.** O Driver App não interage com dados de veículo além do que já
existia (placa, composição). Nada nesta fase toca `DriverGuard`, `syncQueue`,
`deviceEventId` ou qualquer mecanismo offline-first.

## Permissões

Reaproveita integralmente `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`
(`apps/api/src/fleet/constants/fleet-roles.constants.ts`), já existentes desde a Fase 6 —
nenhuma constante nova. `DRIVER` continua sem acesso a este módulo.

## Limite de plano

Reaproveita o enforcement `maxVehicles` (Fase 48) já existente em `VehiclesService.create`
— nenhum limite novo. `ownershipType` nunca é considerado no cálculo (todos os veículos
contam igualmente, independente da classificação).

## API

| Método | Rota | Observação |
|---|---|---|
| GET | `/vehicles` | + filtros `ownershipType`, `currentDriverId`, `availability` |
| GET | `/vehicles/summary` | Novo |
| GET | `/vehicles/:id` | + `ownershipType`, `currentDriverId`, `currentDriverName`, `availability` |
| GET | `/vehicles/:id/overview` | Novo |
| POST/PATCH | `/vehicles`, `/vehicles/:id` | + `ownershipType` |
| PATCH | `/vehicles/:id/status` | Contrato inalterado (`{status}`) — `VehicleStatus` só ganhou um valor novo |
| GET | `/vehicles/:id/driver-assignments` | Novo |
| GET/POST | `/vehicles/:id/documents` | Novo |
| GET | `/fleet-operations/dashboard`, `/fleet-operations/vehicles` | + `suspendedVehicles`/`suspendedCount`, `byOwnershipType` (aditivo, campos existentes preservados) |

## Regras implementadas

- `SUSPENDED` bloqueia início de viagem via a validação central já existente
  (`TripsService.assertCanStart`), sem duplicar lógica.
- Toda mudança de status/classificação é auditada com ação distinta.
- `ownershipType` nunca burla o limite de plano.
- Histórico de motorista/veículo nunca é apagado.
- Mudança de status de motorista/veículo nunca altera dados históricos de viagens já
  registradas (fiscal, comprovantes, checklist, paradas, abastecimento, custos,
  faturamento, lucratividade — todos continuam referenciando o registro histórico).

## Performance / N+1

- `GET /vehicles`: motorista atual + "em viagem agora" resolvidos em 2 queries para a
  página inteira (nunca 1 por linha). Teste real de contagem de queries confirma
  comportamento constante entre 10 e 50 veículos.
- `GET /vehicles/summary`: 4 queries agregadas em paralelo, independente do volume.
- `GET /vehicles/:id/overview`: ~10 queries paralelas (`Promise.all`), todas O(1) por
  veículo — adequado para uma tela de detalhe (não uma listagem), consistente com o padrão
  já usado pelos demais endpoints de detalhe do projeto.

## Testes

- **Unitário**: `vehicle-status-transition.util.spec.ts` (7 testes, todas as transições),
  `document-expiry.util.spec.ts` (5 testes) — 13 novos, todos passando.
- **E2e**: `vehicle-management.e2e-spec.ts` (novo, 20 testes: classificação, status,
  compatibilidade com viagens/manutenção pré-existentes, motorista atual + histórico,
  overview completo, alertas, documentos, summary, filtros, limite de plano, isolamento
  multi-tenant, RBAC, N+1 real com 10 vs. 50 veículos) — 20/20 passando.
- **Regressão**: `driver-management`, `drivers.e2e`, `trips.e2e`, `fleet.e2e`,
  `driver-trips` — 132/132 passando (inclui a correção em `DriversService.assignVehicle`).
  Suíte completa de unitários da API: 565/565. Suíte completa de testes do admin-web:
  200/200. Regressão e2e completa oficial (`test:e2e`, `--runInBand`): ver relatório final.
- **Flakiness identificada e triada**: ao rodar `fleet-operations-fuel`,
  `fleet-operations-financial` e `fleet-operations.e2e-spec` **em paralelo** (fora do
  script oficial `test:e2e`, que roda `--runInBand`), 2 testes falharam com
  `"Transaction failed due to a write conflict or a deadlock"` — conflito de transação
  `Serializable` sob concorrência real entre múltiplas suítes pesadas escrevendo
  simultaneamente no mesmo banco de desenvolvimento. Reproduzido e confirmado como
  pré-existente ao enforcement de limite de plano (Fase 48, `runSerializable`), não
  relacionado a nenhuma mudança da Fase 62: ambos os testes passam 100% quando executados
  isoladamente ou pelo script oficial `--runInBand`.

## Limitações reais

- `totalDistanceKm` no overview é sempre `null` — não existe nesta fase uma fonte agregada
  confiável de distância **realizada** por veículo (`RoutePlan.plannedDistanceKm` é uma
  estimativa de planejamento, nem toda viagem possui `RoutePlan`). Nunca inventado.
- `documentsProblematic` é equivalente a "documentos vencidos" — o model `Document` não
  possui nenhum outro sinal de "problema estrutural" para diferenciar as duas categorias.
- Não existe endpoint para vincular motorista a partir da tela do veículo (`POST
  /vehicles/:id/driver-assignments`) — a mutação continua exclusivamente pelo lado do
  motorista (`POST /drivers/:id/vehicle-assignments`, Fase 61), evitando duplicar a lógica
  de abertura/fechamento de vínculo. O veículo só **lê** o vínculo atual/histórico.
- Estrutura de propriedade (agregado/terceiro) permanece deliberadamente mínima nesta
  fase — sem contrato dedicado, sem cálculo de repasse, mesma decisão já tomada para
  motoristas na Fase 61.

## Pendências reais

Nenhuma pendência de escopo da Fase 62.
