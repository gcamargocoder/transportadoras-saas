# Gestão de Manutenção da Frota (Fase 45)

Módulo completo de manutenção preventiva e corretiva, integrado ao Fleet
Operations e ao dashboard executivo. **Não duplica** o domínio de
manutenção já existente desde a Fase 12/13 (`VehicleMaintenance`,
`MaintenancesService`, `/maintenances`) — estende o registro existente e
adiciona só o que realmente faltava: planos preventivos, peças itemizadas
e a camada de indicadores/rankings/alertas no dashboard.

## 1. O que já existia antes desta fase

- Model `VehicleMaintenance` completo: tipo, status, prioridade, datas,
  odômetro, oficina/fornecedor/mecânico, custos (labor/parts/total
  calculado), OS, garantia, próxima revisão.
- `MaintenancesService`/`MaintenancesController`: CRUD completo
  (`GET/POST/PATCH /maintenances`, `PATCH /maintenances/:id/status`,
  `DELETE /maintenances/:id`), com filtros (status/tipo/prioridade/
  veículo/placa/oficina/fornecedor/período/busca), paginação, RBAC
  (`FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`), auditoria.
- `GET /fleet-operations/maintenance` já existente desde a Fase 40/41:
  total/aberta/concluída, custo total, custo médio, duração média,
  breakdown por tipo/prioridade/oficina, ranking de veículos por custo e
  por quantidade, evolução mensal.
- Página `/operations/fleet/maintenance` (dashboard) e `/maintenances`
  (CRUD) já existentes no admin-web.

## 2. Lacunas reais encontradas (e por que cada uma foi corrigida)

| Lacuna | Correção |
|---|---|
| **Sem planos preventivos** — nada definia "a cada quanto tempo/km" um componente deve ser revisado. | Novo model `MaintenancePlan` + `MaintenancePlansService`/`MaintenancePlansController` (`/maintenance/plans`). |
| **Sem componente estruturado** — só texto livre em `description`/`notes`. | Novo enum `MaintenanceComponent` (catálogo fixo do pedido) + coluna `component` em `VehicleMaintenance`. |
| **Sem peças itemizadas** — `partsCost` só um valor solto. | Novo model `MaintenancePart` (itens por manutenção), `partsCost` passa a ser a soma quando há itens. |
| **Sem tempo parado real** — nenhum campo para isso. | Nova coluna `downtimeMinutes`, sempre informada explicitamente (nunca inferida de `openedAt`/`completedAt`). |
| **Bug real: manutenção `CANCELLED` contava nos indicadores** — `buildMaintenanceWhere` nunca excluía `CANCELLED` (mesma classe de bug já corrigida para `TripStop` na Fase 44 e `stops` na Fase 44). `completedCount` somava `COMPLETED + CANCELLED`. | `buildMaintenanceWhere` agora exclui `CANCELLED` por padrão; `completedCount`/`cancelledCount` contados separadamente via `groupBy(['status'])`. |
| **Sem custo/km, tempo parado, vencidas/próximas, rankings por componente, alertas específicos** no dashboard. | `FleetMaintenanceDashboardEntity` e `computeMaintenanceDashboard` (`FleetOperationsMetricsService`) estendidos — ver seções 6-9. |

## 3. Decisão arquitetural: nenhum service/dashboard paralelo

- **`MaintenanceRecordsService`** do pedido = o `MaintenancesService`
  já existente (`apps/api/src/fleet/services/maintenances.service.ts`),
  estendido — não recriado sob outro nome/rota. As rotas continuam
  `/maintenances`, não `/maintenance/records` (mesmo domínio, mesmo
  contrato, apenas mais campos).
- **`MaintenanceMetricsService`/`MaintenanceAlertsService`** do pedido =
  métodos privados dentro do `FleetOperationsMetricsService` já
  existente (`computeMaintenancePlanStatus`,
  `computeMaintenanceOutlierAlerts`), mesmo padrão já usado nas Fases
  43/44 para paradas (`computeStopDurationAlerts`) — evita "um segundo
  sistema de dashboards".
- **`MaintenancePlansService`** é o único service genuinamente novo —
  não havia nenhuma estrutura equivalente para recorrência preventiva.

## 4. Banco de dados

Migration `20260814190000_fleet_maintenance_module` (aditiva, sem
alteração destrutiva):

- Novo enum `maintenance_component` (23 valores: catálogo do pedido +
  `OTHER`).
- `vehicle_maintenances`: `+component`, `+downtime_minutes`,
  `+next_odometer_km`, `+invoice_number`, `+maintenance_plan_id` (FK
  `ON DELETE SET NULL`).
- Nova tabela `maintenance_plans` (`tenant_id`, `vehicle_id`, `name`,
  `component`, `maintenance_type`, `interval_km`/`interval_days`/
  `interval_hours`, `alert_before_km`/`alert_before_days`, `active`),
  índices por `tenant_id`, `tenant_id+vehicle_id`, `tenant_id+active`.
- Nova tabela `maintenance_parts` (`maintenance_id` FK `ON DELETE
  CASCADE`, `name`, `quantity`, `unit_price`, `total_price`), índice por
  `maintenance_id`.
- `vehicle_maintenances`: novo índice `tenant_id+component`.

## 5. Endpoints

| Rota | RBAC | Descrição |
|---|---|---|
| `GET/POST /maintenances`, `GET/PATCH/DELETE /maintenances/:id`, `PATCH /maintenances/:id/status` | `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` | Já existentes, estendidos com `component`/`downtimeMinutes`/`nextOdometerKm`/`invoiceNumber`/`maintenancePlanId`/`parts`. |
| `GET/POST /maintenance/plans`, `PATCH/DELETE /maintenance/plans/:id` | `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` | Novo — CRUD de planos preventivos. |
| `GET /fleet-operations/maintenance` | `FLEET_OPERATIONS_READ_ROLES` | Dashboard, drasticamente estendido (seção 6). |

Nenhum `tenantId` é aceito do cliente em nenhuma rota — sempre via
`TenantContext.requireTenantId()`.

### Peças itemizadas

`POST`/`PATCH /maintenances` aceitam `parts: [{ name, quantity,
unitPrice }]`. Quando presente (mesmo vazio, para limpar a lista),
**substitui toda a lista** de `MaintenancePart` do registro e recalcula
`partsCost` como a soma — nunca aceita um `partsCost` solto divergente
junto de `parts`. Sem `parts` no body, `partsCost` continua aceito
diretamente (comportamento desde a Fase 13).

### Planos preventivos

Um plano precisa de **ao menos um** de `intervalKm`/`intervalDays`/
`intervalHours` (validado no service, `400` caso contrário). Não gera
`VehicleMaintenance` sozinho — é só a regra de recorrência; o registro
real é criado manualmente (administrativo, online) e pode referenciar o
plano via `maintenancePlanId`. Excluir um plano com manutenção vinculada
é bloqueado (`409`).

## 6. Indicadores do dashboard (`GET /fleet-operations/maintenance`)

Todos excluem `CANCELLED` (bug corrigido nesta fase).

| Campo | Cálculo | Indisponível quando |
|---|---|---|
| `totalCount`/`preventiveCount`/`correctiveCount`/`scheduledCount`/`completedCount`/`cancelledCount`/`openCount` | Contagens diretas (`groupBy(status)`/`groupBy(type)`) | — |
| `totalCost`/`laborCostTotal`/`partsCostTotal` | Somas diretas | — |
| `averageCostPerOccurrence` | `totalCost / count` | `null` sem registro com custo |
| `averageDurationHours` | Já existente (Fase 40), só `COMPLETED` | `null` sem concluída |
| `totalDowntimeMinutes`/`averageDowntimeMinutes` | Soma/média de `downtimeMinutes` — **só entre registros com o campo preenchido**, nunca inferido de datas | `null` sem nenhum registro com `downtimeMinutes` |
| `costPerKm` | Ver seção 7 | `available:false`, `reason:'INSUFFICIENT_ODOMETER_READINGS'` |
| `overdueCount`/`dueSoonCount` | A partir de `MaintenancePlan` — ver seção 8 | `0` (nunca inventa vencimento sem plano) |

## 7. Custo por km

Mesma metodologia já estabelecida para abastecimento
(`common/utils/fuel-consumption.util.ts`) e reaplicada aqui em
`maintenance-cost-per-km.util.ts`: para cada veículo com **≥ 2** registros
com `odometerKm` preenchido no escopo, distância = maior − menor
odômetro; soma-se distância e custo de todos os veículos elegíveis
**antes** de dividir (nunca uma média de razões). Veículo com < 2
leituras nunca contribui — nem com distância nem com custo — para não
distorcer o denominador com odômetro tratado como se fosse distância sem
base real.

## 8. Planos preventivos — vencidas/próximas

`maintenance-plan-status.util.ts` (`evaluateMaintenancePlan`, pura,
testada isoladamente): para cada `MaintenancePlan` ativo, busca a
**última `VehicleMaintenance` `COMPLETED`** vinculada a ele
(`maintenancePlanId`) e o `Vehicle.odometerKm` atual (campo já
existente). Critério por km: `dueOdometerKm = ultimoOdometro +
intervalKm`; por data: `dueDate = ultimaConclusao + intervalDays`.
`OVERDUE` se qualquer critério já venceu; `DUE_SOON` se dentro de
`alertBeforeKm`/`alertBeforeDays`; senão `OK`.

**Plano sem nenhum serviço concluído ainda nunca aparece como
vencido/próximo** — sem uma última manutenção real, não há base de
cálculo (nunca inventa uma data/km de referência a partir da criação do
plano ou de qualquer outra suposição).

`intervalHours` é aceito e armazenado, mas **nunca avaliado** — o
sistema não rastreia horas de motor atuais em nenhum lugar (`Vehicle` só
tem `odometerKm`). Documentado como limitação real, não uma
funcionalidade quebrada.

**Fase 108** — a mesma avaliação passou a ser devolvida também pelas
rotas de CRUD `GET/POST/PATCH /maintenance/plans` (`MaintenancePlanEntity`
ganhou `status`/`dueOdometerKm`/`dueDate`/`overdueByKm`/`overdueByDays`),
não só pelo dashboard consolidado — reaproveitando `evaluateMaintenancePlan`
e o MESMO padrão de 2 queries em lote (`MaintenancePlansService.
evaluatePlansInBatch`), nunca uma segunda função de vencimento. Fecha a
lacuna de "informação operacional relevante no veículo": a seção "Planos
de manutenção preventiva" (`apps/admin-web/src/features/fleet-operations/
maintenance-plans-section.tsx`) agora mostra um badge Vencida/Próxima/Em
dia/Sem histórico por plano, e a mesma condição `OVERDUE`/`DUE_SOON`
passou a gerar notificação no Centro de Alertas (`docs/notifications.md`,
seção 13) — antes só aparecia neste dashboard.

## 9. Rankings e breakdowns novos

`byComponent`, `topComponentsByCost`, `topComponentsByCount` (groupBy
`component`, 1 query, nunca por componente em loop). `bottomVehiclesByCost`
(mesmo `rankTopVehicles` já existente, `direction: 'asc'`).
`topVehiclesByDowntime` (groupBy `vehicleId` já usado para custo,
reaproveitado com `_sum.downtimeMinutes`).

## 10. Alertas (`maintenanceAlerts`, nunca persistidos)

Reaproveita o `FleetAlertEntity`/`FleetAlertType` genérico já existente
(Fase 41), estendido com 6 novos tipos:

| Tipo | Regra |
|---|---|
| `MAINTENANCE_OVERDUE`/`MAINTENANCE_DUE_SOON` | A partir de `overdueMaintenances`/`upcomingMaintenances` (seção 8). |
| `HIGH_COST` | Custo de manutenção do veículo no período > 2x a média da frota (`MAINTENANCE_HIGH_COST_MULTIPLIER`, mesmo multiplicador 2x já usado em todos os outros outliers deste dashboard — não um número novo inventado). |
| `EXCESSIVE_BREAKDOWN` | Quantidade de manutenções **`CORRECTIVE`** do veículo no período > 2x a média da frota. |
| `EXCESSIVE_DOWNTIME` | `downtimeMinutes` total do veículo no período > 2x a média da frota. |
| `CRITICAL_COMPONENT` | Manutenção `priority=CRITICAL` ainda **em aberto** (`OPEN`/`IN_PROGRESS`/`WAITING_PARTS`) — flag direta, sem multiplicador (não é um outlier estatístico, é um item crítico não resolvido). |

Não há configuração por tenant para os multiplicadores 2x (reaproveitar
o padrão já estabelecido no arquivo evitou criar uma estrutura de
threshold nova só para isso — diferente do caso de `stopDurationThresholdsMinutes`
na Fase 44, onde não havia nenhum precedente de valor a reaproveitar).

## 11. Frontend

- **`/operations/fleet/maintenance`**: cards principais, evolução
  mensal, custo por veículo/componente (top e bottom), distribuição
  preventiva/corretiva (tabela "Por tipo"), rankings, alertas,
  vencidas/próximas, tabela completa de registros (filtros: tipo/status/
  prioridade/componente/fornecedor + paginação, detalhe em modal com
  peças), gestão de planos preventivos (`MaintenancePlansSection`: lista,
  criar, ativar/desativar, excluir).
- **`/operations/fleet`** (executivo): nova seção "Manutenção" — custo
  total, preventivas vencidas, corretivas, veículo com maior custo,
  tempo total parado, alertas críticos, link "Ver detalhes".
- **`/maintenances`**: campo/filtro de componente adicionado ao
  formulário e à listagem existentes (sem nova página).

## 12. Segurança

Testado (`fleet-maintenance.e2e-spec.ts`): isolamento multi-tenant em
planos e no dashboard (criar/ler/editar/excluir plano de outro tenant →
404; dashboard de tenant sem dado → zerado/vazio, nunca vaza dado de
outro tenant); RBAC de leitura (inclui `AUDITOR`) e escrita (`AUDITOR`/
`DRIVER` bloqueados, `403`); `maintenancePlanId` de outro tenant rejeitado
(`404`); validação financeira (`laborCost`/`partsCost`/`unitPrice`
nunca negativos); validação de relacionamento (veículo inexistente/de
outro tenant → `404`).

## 13. Performance / N+1

Todas as consultas novas são agregadas (`groupBy`/`aggregate`) ou
`findMany` em lote (nunca 1 query por veículo/componente/plano).
Verificado com o mesmo mecanismo de contagem real de queries das Fases
42-44 (`$extends` do Prisma): `GET /fleet-operations/maintenance` com
10/25/50/100 veículos (cada um com plano + manutenção vinculada) — Θ(1),
sem crescimento (`fleet-maintenance.e2e-spec.ts`).

## 14. Testes

- **Unitários**: `maintenance-plan-status.util.spec.ts` (12 casos —
  critério km/data, empate, plano sem histórico, sem odômetro atual),
  `maintenance-cost-per-km.util.spec.ts` (6 casos — insuficiência de
  dados, soma de segmentos por veículo, exclusão de veículo com 1
  leitura).
- **E2E** (`fleet-maintenance.e2e-spec.ts`, 22 casos, Postgres real):
  CRUD de planos, validações (sem intervalo, veículo inválido, exclusão
  bloqueada), campos novos do registro + peças itemizadas,
  `maintenancePlanId` de outro tenant, filtro por componente, exclusão de
  cancelada dos indicadores (bug corrigido), contagens separadas,
  custo de peças/mão de obra, tempo parado disponível/indisponível,
  custo/km disponível/indisponível, breakdown/ranking por componente,
  `bottomVehiclesByCost`/`topVehiclesByDowntime`, vencida/próxima com
  alerta, plano sem histórico nunca vencido, `CRITICAL_COMPONENT`,
  isolamento multi-tenant, N+1.
- **E2E existente**: `maintenances.e2e-spec.ts` (15 casos, já cobria
  CRUD/RBAC/isolamento do registro) — revalidado sem regressão.
- **Frontend**: `operations/fleet/maintenance/page.test.tsx` (9 casos),
  `operations/fleet/page.test.tsx` (executivo, revalidado),
  `maintenances/page.test.tsx` (5 casos novos — filtro de componente,
  permissão de escrita, criação com componente).

## 15. Limitações reais

- `intervalHours` de um plano nunca é avaliado para vencimento — o
  sistema não rastreia horas de motor atuais (seção 8).
- Sem histórico de manutenção concluída vinculada a um plano, ele nunca
  aparece como vencido/próximo, mesmo que o veículo já tenha rodado muito
  (nenhuma data/km de referência inventada).
- Multiplicadores de outlier (`HIGH_COST`/`EXCESSIVE_BREAKDOWN`/
  `EXCESSIVE_DOWNTIME`) não são configuráveis por tenant nesta fase
  (reaproveitam o 2x já padrão do dashboard).
- `MaintenancePlan` não gera `VehicleMaintenance` automaticamente — a
  criação do registro real continua manual (administrativo, online),
  conforme escopo desta fase.
