# Operação de Frota (Fase 81)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, o schema (`packages/database/prisma/schema.prisma`),
o módulo `apps/api/src/fleet/` (Vehicle/Fleet/Trailer/Maintenance/TripComposition), o
módulo `apps/api/src/fleet-operations/` (dashboards) e as telas `apps/admin-web/src/app/(app)/vehicles`
e `.../operations/fleet` foram auditados. **Conclusão da auditoria: quase todo o escopo
pedido pela Fase 81 já havia sido entregue pelas Fases 40-41 (dashboard consolidado) e
62-68 (gestão avançada de veículo/frota)** — ver `fleet-operations-dashboard.md` e
`vehicle-management.md`. Esta fase não recriou nada disso; apenas fechou 2 lacunas reais
encontradas na auditoria (seção 3) e documentou o que já existia (seção 2).

## 2. O que já existia (reaproveitado, não recriado)

| Item pedido pela Fase 81 | Fonte já existente | Fase |
|---|---|---|
| Status operacional da frota (ativo/disponível/em viagem/manutenção/inativo/bloqueado) | `VehicleStatus` (`ACTIVE/INACTIVE/SUSPENDED/MAINTENANCE/SOLD`) + `VehicleEntity.availability` derivado | 62 |
| Dashboard operacional da frota | `GET /fleet-operations/dashboard`, `GET /fleet-operations/vehicles`, `GET /vehicles/summary` | 40/41/62 |
| Listagem operacional (busca, filtro status/tipo/disponibilidade/propriedade, paginação, motorista atual) | `GET /vehicles` + `FindVehiclesQueryDto` + `apps/admin-web/.../vehicles/page.tsx` | 62 |
| Detalhe operacional do veículo (identificação, situação, viagem atual, motorista atual, histórico, alertas, custos, pneus, documentos) | `GET /vehicles/:id/overview` (`VehicleOverviewService`) + `apps/admin-web/.../vehicles/[id]/page.tsx` | 62/63/64/65/68 |
| Integração veículo ↔ viagem (composição → motorista → rota → status) | `Trip`/`TripComposition`/`RouteVersion`, "em viagem agora" = composição vinculada a `Trip.status IN (IN_PROGRESS, PAUSED)` | 41/62 |
| Motorista + veículo | `DriverVehicleAssignment` (Fase 61), consultado nos dois sentidos (`GET /drivers/:id/vehicle-assignments` e `GET /vehicles/:id/driver-assignments`) | 61/62 |
| Composição veicular (cavalo + carretas + eixos) | `TripComposition`/`Trailer`/`AxleConfiguration`, dashboard dedicado `GET /fleet-operations/compositions` | 41 |
| Alertas operacionais do veículo | `FleetAlertEntity` (computado em memória, nunca persistido), estendido a cada fase com novos tipos (`VEHICLE_SUSPENDED`, `VEHICLE_OPEN_MAINTENANCE`, `VEHICLE_OCCURRENCE_CRITICAL`, etc.) | 41/62/63/64/65/68 |
| Dashboard geral integrando frota/viagens/motoristas/ocorrências | `FleetOperationsMetricsService.getConsolidatedDashboard()` | 40/41 |

Nenhum desses itens foi alterado nesta fase — todos os 63 testes e2e de
`vehicle-management.e2e-spec.ts`, `fleet.e2e-spec.ts` e
`fleet-operations-vehicles.e2e-spec.ts` continuam passando sem modificação.

## 3. O que foi implementado nesta fase (lacunas reais)

### 3.1 Centralização da regra de disponibilidade operacional

**Problema encontrado**: a regra "esse veículo pode ser usado agora?" já existia, mas
fragmentada — `resolveAvailability` era uma função **privada e não exportada** dentro de
`vehicle.mapper.ts`, e a constante `ACTIVE_TRIP_STATUSES` (`[IN_PROGRESS, PAUSED]`) estava
duplicada em 4 arquivos (`vehicles.service.ts`, `vehicle-overview.service.ts`,
`fleet-operations-metrics.service.ts`, `dashboard.service.ts`). Nenhum outro módulo
conseguia reutilizá-la.

**Solução**: nova fonte central `apps/api/src/fleet/services/vehicle-availability.service.ts`:

- `resolveVehicleAvailability(status, onTrip)` — função pura (mesma lógica exata que já
  existia, apenas extraída/exportada).
- `onTripWhereFragment()` — fragmento Prisma reaproveitável (veículo com composição
  vinculada a viagem `IN_PROGRESS`/`PAUSED`).
- `VehicleAvailabilityService` (injetável, exportado por `FleetModule`) — `isOnTrip()` e
  `getAvailability()` (retorna `{ availability, canBeUsedNow }`), pensado para reuso futuro
  por despacho, manutenção, abastecimento, pneus e Driver App (seção 5 da Fase 81).

`vehicle.mapper.ts` e `vehicles.service.ts` foram atualizados para importar dessa fonte
única em vez de manter cópias locais — **comportamento idêntico**, mesma saída para os
mesmos dados (confirmado pelos 63 testes e2e que passam sem alteração).

**Decisão deliberada de não alterar `TripsService.assertCanStart`**: esse método já tem sua
própria validação de disponibilidade, mais específica (checa sobreposição por **janela de
data**, não só estado atual — ver `assertVehicleAvailable`), testada e usada em produção.
Precedente já registrado desde a Fase 62 (`isVehicleAssignableToTrip` em
`vehicle-status-transition.util.ts` também é "função pura testável, nunca uma segunda
checagem" — nunca consumida por `TripsService`). Forçar esse refactor arriscaria regressão
num caminho crítico sem ganho real: o novo `VehicleAvailabilityService` fica disponível
para os módulos que ainda **não têm** essa checagem (Fases 82-88), não para substituir uma
que já funciona.

`fleet-operations-metrics.service.ts` e `dashboard.service.ts` mantêm suas próprias cópias
de `ACTIVE_TRIP_STATUSES` — são agregações amplas (dashboards) com formato de consulta
diferente do usado por disponibilidade de 1 veículo; consolidá-las não fazia parte do
pedido da Fase 81 e ampliaria o raio de risco sem necessidade.

### 3.2 Filtro por tipo na listagem operacional (`/vehicles`)

**Problema encontrado**: o backend já aceitava `?type=` (`FindVehiclesQueryDto.type`), mas
a tela `apps/admin-web/src/app/(app)/vehicles/page.tsx` não expunha esse filtro (só
Status/Propriedade/Disponibilidade) — lacuna direta da seção 3 da Fase 81 ("filtro por
tipo").

**Solução**: adicionado `Select` de Tipo reaproveitando `VEHICLE_TYPE_LABELS` (já existente,
já usado na coluna da tabela), seguindo o mesmo padrão dos demais filtros da página.

## 4. Arquivos alterados/criados

**Criados**:
- `apps/api/src/fleet/services/vehicle-availability.service.ts`
- `apps/api/src/fleet/services/vehicle-availability.service.spec.ts` (3 testes unitários da função pura)
- `docs/fleet-operations.md` (este arquivo)

**Alterados**:
- `apps/api/src/fleet/mappers/vehicle.mapper.ts` — usa `resolveVehicleAvailability` importado
- `apps/api/src/fleet/services/vehicles.service.ts` — usa `ACTIVE_TRIP_STATUSES`/`onTripWhereFragment` importados
- `apps/api/src/fleet/fleet.module.ts` — registra e exporta `VehicleAvailabilityService`
- `apps/admin-web/src/app/(app)/vehicles/page.tsx` — filtro de Tipo

**Migrations**: nenhuma — nenhuma alteração de schema foi necessária.

## 5. APIs

Nenhum endpoint novo. Nenhum contrato de resposta alterado. O único novo artefato é
interno (`VehicleAvailabilityService`, injetável por outros módulos do backend), sem
endpoint HTTP próprio nesta fase — os campos `availability`/`currentDriverId`/etc. já eram
expostos por `GET /vehicles`, `GET /vehicles/:id` e `GET /vehicles/:id/overview` desde a
Fase 62.

## 6. RBAC

Inalterado — reaproveita integralmente `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` (Fase 6) e
`FLEET_OPERATIONS_READ_ROLES` (Fase 40), já testados.

## 7. Driver App

Nenhuma alteração. `VehicleAvailabilityService` fica disponível (via `FleetModule`) para uma
futura integração do Driver App com a situação operacional do veículo, mas nenhuma fase
anterior ou esta expôs esse dado ao app — permanece pendência real para as Fases 86/91.

## 8. Testes direcionados executados

- **Unitário** (novo): `vehicle-availability.service.spec.ts` (3 testes) — comportamento da
  função pura `resolveVehicleAvailability`.
- **Unitário** (regressão mínima): `vehicle-status-transition.util.spec.ts` (8 testes) —
  precedente conceitual citado na seção 3.1, confirmado ainda válido.
- **E2e** (regressão do módulo alterado): `fleet.e2e-spec.ts`, `vehicle-management.e2e-spec.ts`,
  `fleet-operations-vehicles.e2e-spec.ts` — **63/63 passando**, sem alteração nos arquivos de
  teste (comportamento 100% preservado pelo refactor).
- **Typecheck**: `apps/api` (`tsc --noEmit`) e `apps/admin-web` (`tsc --noEmit`) — limpos.
- **Lint**: todos os arquivos alterados (`eslint`) — limpo.

Não foi executada a suíte completa do monorepo — não houve alteração de schema nem de
contrato compartilhado que justificasse uma regressão ampla (regra da Fase 81, seção 16).

## 9. Limitações reais

- `VehicleAvailabilityService` não é consumido ainda por nenhum outro módulo além do
  próprio `fleet` (mapper/service) — fica pronto para reuso, mas a integração de fato com
  despacho/manutenção/abastecimento/pneus/Driver App é trabalho das Fases 82-88/91, não
  desta fase.
- "Km rodados"/"distância real acumulada" por veículo continua indisponível (limitação já
  auditada e documentada em `vehicle-management.md` — nenhuma fonte confiável no schema
  atual, não reavaliada nesta fase).
- Alertas/ocorrências **não aparecem como coluna** na listagem `/vehicles` (só no detalhe,
  via `/overview`) — calcular alertas por linha exigiria replicar `buildAlerts` em lote só
  para a listagem; como o status/disponibilidade já sinalizam os casos mais críticos
  (SUSPENSO/MANUTENÇÃO/EM VIAGEM) na própria tabela, e o restante é visível a 1 clique no
  detalhe, optou-se por não duplicar esse cálculo apenas para a listagem nesta fase.

## 10. Pendências reais

Nenhuma pendência de escopo da Fase 81. Preparação para as próximas fases (82 —
Abastecimento, 83 — Manutenção, 84 — Pneus, 85 — Checklist, 86 — Jornada do motorista, 87 —
Telemetria, 88 — Despacho/Torre de controle) permanece: todas podem consumir
`VehicleAvailabilityService` (via `FleetModule`) em vez de recalcular a disponibilidade.
