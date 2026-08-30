# Gestão de Manutenção e Ativos da Frota (Fase 63)

## Escopo

| Item | Status |
|---|---|
| Status/tipos de manutenção (OPEN/WAITING_PARTS/IN_PROGRESS/COMPLETED/CANCELLED, PREVENTIVE/CORRECTIVE/INSPECTION/EMERGENCY/OTHER) | ✅ (reaproveitado, já existia desde a Fase 13/45) |
| Validação de transição de status no backend | ✅ (novo) |
| Ordem/registro de manutenção (CRUD, itens/peças, custos) | ✅ (reaproveitado, já existia) |
| Fornecedor/oficina | ✅ (reaproveitado -- campos texto livre, sem catálogo estruturado) |
| Disponibilidade do veículo integrada com manutenção `IN_PROGRESS` | ✅ (novo) |
| Bloqueio real de nova viagem por manutenção `IN_PROGRESS` | ✅ (novo -- antes só funcionava via troca manual de `Vehicle.status`) |
| Alertas granulares (aberta/programada/em andamento/atrasada/indisponibilidade) | ✅ (novo, complementa o alerta agregado que já existia) |
| Dashboard de manutenção (`GET /fleet-operations/maintenance`) | ✅ (reaproveitado e estendido com 2 indicadores novos) |
| Integração com pneus | ❌ → ✅ (fechado na Fase 109, ver seção 7) |
| Integração com checklist | ❌ → ✅ (fechado na Fase 111, ver seção 8) |
| Integração com financeiro/`TripExpense` | ❌ (sem `tripId` em `VehicleMaintenance` -- ver Limitações) |
| Manutenção preventiva completa, estoque de peças, ordens de serviço | ❌ (fora do escopo desta fase) |

## Auditoria prévia (o que já existia vs. o que foi criado)

O módulo de manutenção já era muito maduro antes desta fase -- praticamente
todo o CRUD, custos, dashboard agregado e planos preventivos foram
implementados na Fase 13 e consolidados na Fase 45 (ver
[`docs/fleet-maintenance-dashboard.md`](./fleet-maintenance-dashboard.md),
que continua sendo a referência para tudo que já existia: `VehicleMaintenance`,
`MaintenancePlan`, `MaintenancePart`, `MaintenanceComponent`, o dashboard
`GET /fleet-operations/maintenance` completo com rankings/alertas/planos
vencidos-próximos, e o frontend em `/operations/fleet/maintenance`).

A auditoria desta fase identificou 4 gaps reais em relação ao pedido, e a
fase se limitou a preenchê-los -- nada do que já existia foi recriado:

1. **Não havia validação de transição de status** -- `PATCH /maintenances/:id/status`
   aceitava qualquer valor de `VehicleMaintenanceStatus` a partir de qualquer
   status atual (inclusive reabrir uma manutenção `COMPLETED`/`CANCELLED`).
2. **A disponibilidade do veículo (Fase 62) nunca considerava manutenção**:
   `Vehicle.status` e `VehicleMaintenanceStatus` eram completamente
   desacoplados -- era possível ter uma manutenção `IN_PROGRESS` enquanto o
   veículo continuava `ACTIVE`/`AVAILABLE`.
3. **O bloqueio de nova viagem por manutenção só funcionava via troca manual**
   de `Vehicle.status` para `MAINTENANCE` (`PATCH /vehicles/:id/status`) --
   `TripsService.assertCanStart` já tinha a checagem certa, mas nada
   disparava essa troca a partir de uma `VehicleMaintenance` real.
4. **O alerta de manutenção do veículo (`VEHICLE_OPEN_MAINTENANCE`, Fase 62)
   era só um contador agregado**, sem diferenciar aberta/programada/em
   andamento/atrasada.

## 1. Status e transições

`VehicleMaintenanceStatus` (já existia): `OPEN`, `WAITING_PARTS`,
`IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Não foi criado um enum
`MaintenanceStatus` paralelo -- este já cobre semanticamente o que o pedido
descreve (`WAITING_PARTS` no lugar de um `SCHEDULED` dedicado; "programada"
é representada pelo campo `scheduledAt`, já existente, combinado com
`OPEN`/`WAITING_PARTS`).

Novo: `apps/api/src/fleet/utils/maintenance-status-transition.util.ts`
(`assertValidMaintenanceStatusTransition`, `resolveMaintenanceStatusChangeAction`,
`isMaintenanceOpenStatus`), mesmo padrão de
`vehicle-status-transition.util.ts`/`driver-status-transition.util.ts`:

- `COMPLETED` e `CANCELLED` são **terminais** -- nenhuma transição a partir
  deles é aceita (`409 Conflict`). Não existe "reabrir" uma manutenção
  encerrada por design; se foi um erro, corrija criando um novo registro.
- A partir de qualquer estado não-terminal (`OPEN`/`WAITING_PARTS`/`IN_PROGRESS`),
  qualquer outro status é aceito -- inclusive ir direto para `COMPLETED` sem
  passar por `IN_PROGRESS` (fluxo real: serviço rápido resolvido na hora,
  já coberto por `maintenances.e2e-spec.ts`).
- As validações de conclusão que já existiam (`completedAt` obrigatório,
  `completedAt >= openedAt`, `totalCost > 0`) foram preservadas sem
  alteração.
- Auditoria: ações específicas por transição (`maintenance.started`,
  `maintenance.completed`, `maintenance.cancelled`), com
  `maintenance.status_changed` genérico preservado para `WAITING_PARTS`
  (mesmo padrão de `resolveVehicleStatusChangeAction`).

## 2. Disponibilidade do veículo integrada (Fase 62)

`VehiclesService.syncStatusForMaintenance` (novo) sincroniza `Vehicle.status`
com a existência de uma `VehicleMaintenance` `IN_PROGRESS` para aquele
veículo -- o **mesmo mecanismo** já usado por `Driver.isActive`/`Driver.status`
na Fase 61 (campo persistido sincronizado, nunca uma segunda flag
derivada). Chamado por `MaintenancesService.updateStatus`, dentro da mesma
transação Prisma da própria atualização de status da manutenção.

Regras:

- Só uma manutenção **`IN_PROGRESS`** (fisicamente na oficina agora) afeta
  o veículo -- `OPEN`/`WAITING_PARTS` não, por decisão explícita do pedido
  ("Quando manutenção estiver IN_PROGRESS o veículo deve ser considerado
  indisponível").
- Se o veículo estava `ACTIVE`, vira `MAINTENANCE` quando a primeira
  manutenção entra em `IN_PROGRESS`.
- Se o veículo estava `SUSPENDED`/`INACTIVE`, **não é sobrescrito** -- já
  era mais restritivo que `MAINTENANCE`, e sobrescrever apagaria o motivo
  real da indisponibilidade.
- Quando a **última** manutenção `IN_PROGRESS` do veículo é concluída ou
  cancelada, e o veículo estava `MAINTENANCE`, ele volta para `ACTIVE`.
  Duas manutenções `IN_PROGRESS` simultâneas: concluir uma não libera o
  veículo enquanto a outra continuar aberta (testado em
  `maintenance-vehicle-integration.e2e-spec.ts`).
- Cada sincronização automática é auditada como `Vehicle`/`vehicle.status_changed`
  (reaproveita `resolveVehicleStatusChangeAction`), com o mesmo `actor` que
  disparou a mudança de status da manutenção.

**Nenhuma alteração foi necessária em `resolveAvailability`/
`buildAvailabilityWhere`/`getSummary` (`vehicle.mapper.ts`/`vehicles.service.ts`)**:
todos já liam `Vehicle.status` como única fonte de verdade da
disponibilidade derivada (AVAILABLE/ON_TRIP/UNAVAILABLE) desde a Fase 62 --
ao sincronizar o campo já existente, a disponibilidade passou a refletir
manutenção automaticamente, sem duplicar lógica.

## 3. Bloqueio de nova viagem

`TripsService.assertCanStart` **não foi alterado** -- já bloqueava
`vehicle.status !== ACTIVE` (mensagem específica para `MAINTENANCE`) desde
antes desta fase. Como a sincronização da seção 2 agora seta
`Vehicle.status = MAINTENANCE` automaticamente a partir de uma
`VehicleMaintenance` real, o bloqueio passou a funcionar de ponta a ponta
sem nenhum segundo guard ou validação duplicada em controller -- exatamente
como pedido. Testado em `maintenance-vehicle-integration.e2e-spec.ts`
("manutenção IN_PROGRESS (não apenas status manual) bloqueia início de
viagem").

## 4. Itens, custos e fornecedor/oficina

Sem alteração -- `MaintenancesService.resolvePartsCost`/`computeTotalCost`
(peças itemizadas sempre recalculadas como `quantity * unitPrice`,
`totalCost = laborCost + partsCost`, nunca aceito do cliente) já atendiam
integralmente a regra do pedido. `workshop`/`supplier` continuam campos de
texto livre (sem FK) -- não existe nenhuma entidade `Supplier`/`Vendor` no
schema, e criar uma agora seria um catálogo de fornecedores fora do escopo
desta fase (pedido explicitamente veda "CRM de fornecedores").

## 5. Alertas (GET /vehicles/:id/overview)

O alerta agregado `VEHICLE_OPEN_MAINTENANCE` (Fase 62, "N manutenção(ões)
em aberto") foi **preservado sem alteração de comportamento**. Quatro
alertas novos foram adicionados, computados a partir das mesmas linhas já
buscadas (nenhuma query nova -- a busca que antes trazia só um `count()`
passou a trazer `{status, scheduledAt}` das manutenções não-concluídas/
canceladas do veículo):

| Alerta | Severidade | Critério |
|---|---|---|
| `VEHICLE_MAINTENANCE_IN_PROGRESS` | ATTENTION | Manutenção(ões) com status `IN_PROGRESS` |
| `VEHICLE_MAINTENANCE_SCHEDULED` | INFO | Não iniciada, `scheduledAt` no futuro |
| `VEHICLE_MAINTENANCE_OVERDUE` | CRITICAL | Não iniciada, `scheduledAt` no passado |
| `VEHICLE_UNAVAILABLE_MAINTENANCE` | ATTENTION | `Vehicle.status === MAINTENANCE` |

Nunca inventa "atrasada" para um registro sem `scheduledAt` preenchido (sem
base real de cálculo).

## 6. Dashboard (GET /fleet-operations/maintenance)

Praticamente todos os indicadores pedidos já existiam (ver tabela completa
em `docs/fleet-maintenance-dashboard.md`): abertas (`openCount`),
concluídas (`completedCount`), canceladas (`cancelledCount`), preventivas/
corretivas (`preventiveCount`/`correctiveCount`), custo total (`totalCost`),
custo por veículo (`topVehiclesByCost`/`bottomVehiclesByCost`), atrasadas
(`overdueCount`/`overdueMaintenances`, baseado em `MaintenancePlan`). Dois
indicadores foram adicionados (aditivos, sem alterar nenhum campo
existente):

- `inProgressCount`: subconjunto de `openCount`, só status `IN_PROGRESS`.
- `vehiclesInMaintenanceCount`: veículos **distintos** com pelo menos uma
  manutenção `IN_PROGRESS` agora (1 `groupBy` agregado a mais, sempre
  independente do número de veículos -- ver seção Performance).

## 7. Integração com pneus -- fechado na Fase 109

**Até a Fase 63/64**: não existia nenhum campo `tireId` em
`VehicleMaintenance` nem `maintenanceId` em `Tire`. O único ponto de
contato era o enum `MaintenanceComponent.TIRES`, um rótulo livre sem join
real.

**Fase 109** -- `TireMovement` (não `VehicleMaintenance`) ganhou um
`maintenanceId` opcional, mesmo padrão relacional já usado por
`PartStockMovement.maintenanceId` (Fase 83): uma OS pode estar ligada a
várias movimentações de pneu (troca de mais de um pneu na mesma visita),
cada uma sua própria linha. `GET /maintenances/:id` passou a devolver
`tireMovements: MaintenanceTireMovementEntity[]` (populado só ali, nunca
em `findAll` -- sem N+1). Detalhes completos em
[`docs/tire-management.md`](./tire-management.md), seção 9 (fonte de
verdade deste vínculo, para não duplicar a documentação aqui).

## 8. Integração com checklist -- fechado na Fase 111

**Até a Fase 110**: não existia nenhum vínculo entre `VehicleMaintenance`
e `ChecklistExecution` -- uma não-conformidade crítica encontrada num
checklist pré/pós-viagem (freio, cinto, etc.) precisava ser transcrita
manualmente para uma OS nova, sem nenhuma referência de origem.

**Fase 111** -- `VehicleMaintenance` ganhou um `checklistExecutionId`
opcional (migration aditiva --
`20260910000000_vehicle_maintenance_checklist_link`), mesma decisão de
modelagem já usada pela seção 7 acima (`TireMovement.maintenanceId`), só
que na direção oposta (aqui é a própria OS que aponta para o checklist,
não uma movimentação secundária). Preenchido **somente** quando o admin
abre a OS explicitamente a partir de uma execução com
`hasCriticalNonConformity=true` (ação "Abrir OS a partir desta não
conformidade" em `/checklists/:id`) -- nunca criado automaticamente.
`GET /checklists/executions/:id` passou a devolver
`maintenances: ChecklistExecutionMaintenanceEntity[]` (populado só ali,
nunca em `findAll` -- sem N+1). Detalhes completos em
[`docs/checklist-module.md`](./checklist-module.md), seção 13 (fonte de
verdade deste vínculo, para não duplicar a documentação aqui).

## 9. Integração com financeiro -- limitação real, não implementada

`VehicleMaintenance` não tem `tripId` e `TripExpense` não tem
`maintenanceId`/`vehicleMaintenanceId` -- confirmado no schema. O custo de
manutenção já aparece nos dashboards financeiros (`GET /fleet-operations/costs`,
`getFinancialDashboard`) **ao lado de** `TripExpense`, como categoria de
custo consolidado independente -- nunca somado através de um vínculo que
não existe. Criar esse vínculo exigiria decidir uma regra de negócio (quando
uma manutenção "pertence" a uma viagem específica) que o pedido não
especifica; nenhum dado foi inventado para simular essa transformação
automática, conforme instruído.

## 10. API

Nenhum endpoint novo foi necessário -- todos os endpoints pedidos na seção
17 (`GET/POST /maintenance`, `GET/PATCH /maintenance/:id`,
`PATCH /maintenance/:id/status`, `GET /maintenance/dashboard`) já existiam
com nomenclatura equivalente:

| Pedido | Real (já existente) |
|---|---|
| `GET/POST /maintenance` | `GET/POST /maintenances` |
| `GET/PATCH /maintenance/:id` | `GET/PATCH /maintenances/:id` |
| `PATCH /maintenance/:id/status` | `PATCH /maintenances/:id/status` (agora com validação de transição + sincronização de veículo) |
| `GET /maintenance/dashboard` | `GET /fleet-operations/maintenance` (agora com `inProgressCount`/`vehiclesInMaintenanceCount`) |

## 11. Frontend

`/maintenances` (evoluída): a tela só permitia criar e visualizar --
`updateMaintenance`/`updateMaintenanceStatus`/`deleteMaintenance` já
existiam no client de API (`apps/admin-web/src/lib/api/fleet.api.ts`) mas
nunca eram chamadas por nenhum componente. Foram adicionadas:

- Coluna "Ações" (só para `FLEET_WRITE_ROLES`): Editar (`UpdateMaintenanceModal`,
  novo -- reaproveita `PATCH /maintenances/:id`), Iniciar (`OPEN`/`WAITING_PARTS`
  → `IN_PROGRESS`), Concluir (abre um modal pedindo a data de conclusão,
  chama `PATCH /maintenances/:id/status`), Cancelar (`ConfirmDialog`
  existente). Botões desaparecem sozinhos para manutenção já `COMPLETED`/
  `CANCELLED` (mesma regra da state machine do backend).
- "Programar" é feito editando `scheduledAt` no modal de edição -- não
  precisa de uma ação/endpoint dedicado, já que é só um campo do registro.

`/vehicles/[id]` (aba Custos) e `/operations/fleet/maintenance`: **sem
alteração de código** -- a aba de custos já lista manutenções via
`getVehicleMaintenances`, e o dashboard de frota já renderiza `overview.alerts`
genericamente (por `type`/`severity`/`message`), então os 4 alertas novos da
seção 5 aparecem automaticamente sem nenhuma mudança no componente.

## 12. RBAC / multi-tenant / limites de plano

Sem alteração -- `MaintenancesController` continua com
`@RequireModule(TenantModule.MAINTENANCE)` + `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`
por rota, `TenantGuard`/`RolesGuard`/`RequireModuleGuard` preservados. Não
existe (nem foi criado) `maxMaintenances` -- confirmado que `TenantPlan` só
limita `maxUsers`/`maxVehicles`/`maxDrivers`/`maxStorageMb`; manutenção é
apenas um módulo habilitável (`TenantModule.MAINTENANCE`), sem contagem.

## 13. Auditoria

Reaproveita `AuditService` integralmente. Ações novas:
`maintenance.started`, `maintenance.completed`, `maintenance.cancelled`
(antes só existia o genérico `maintenance.status_changed`, preservado para
`WAITING_PARTS`). A sincronização automática de `Vehicle.status` audita
como `Vehicle`, reaproveitando `resolveVehicleStatusChangeAction` (mesma
função da Fase 62) -- nenhum sistema de auditoria paralelo.

## 14. Performance / N+1

- `GET /vehicles/:id/overview`: a query que antes trazia `count()` de
  manutenções abertas passou a trazer as linhas (`{status, scheduledAt}`)
  -- continua sendo exatamente 1 query, bounded ao veículo (nunca cresce
  com o número de manutenções da frota).
- `GET /fleet-operations/maintenance`: 1 `groupBy(['vehicleId'])` a mais
  (para `vehiclesInMaintenanceCount`), sempre presente independente do
  número de veículos/manutenções -- o teste de N+1 já existente
  (`fleet-maintenance.e2e-spec.ts`, 10/25/50/100 veículos) continua verde
  porque a contagem de queries não cresce com a escala, só teve +1 query
  constante.
- `MaintenancesService.updateStatus`: passou a rodar dentro de uma
  `$transaction` (atualiza a manutenção + sincroniza o veículo) -- ainda
  assim 2 queries fixas (`vehicleMaintenance.update` + a leitura/escrita de
  `syncStatusForMaintenance`), nunca proporcional a nada.

## 15. Testes

- **Unitários** (novo): `apps/api/src/fleet/utils/maintenance-status-transition.util.spec.ts`
  -- transições válidas/inválidas, nomeação de ação de auditoria,
  `isMaintenanceOpenStatus`.
- **E2E** (novo): `apps/api/test/maintenance-vehicle-integration.e2e-spec.ts`
  -- validação de transição terminal (409), sincronização
  `Vehicle.status`/disponibilidade (básica, cancelamento, duas manutenções
  simultâneas, veículo `SUSPENDED` preservado), bloqueio real de nova
  viagem via manutenção `IN_PROGRESS`, alertas granulares do overview,
  novos indicadores do dashboard.
- **Regressão confirmada verde**: `maintenances.e2e-spec.ts` (15),
  `fleet-maintenance.e2e-spec.ts` (22, inclui o teste de N+1 10-100
  veículos), `trips.e2e-spec.ts` + `driver-trips.e2e-spec.ts` (62),
  `vehicle-management.e2e-spec.ts` (20).

## 16. Limitações reais

- Sem vínculo estrutural manutenção ↔ viagem/despesa (seção 9) -- exigiria
  decisão de schema/negócio fora do escopo das fases já entregues;
  documentado, nunca simulado. Manutenção ↔ pneu (seção 7, Fase 109) e
  manutenção ↔ checklist (seção 8, Fase 111) já foram fechados.
- `workshop`/`supplier` continuam texto livre -- duas grafias diferentes da
  mesma oficina aparecem como entradas separadas no breakdown
  `byWorkshop` do dashboard (limitação já documentada desde a Fase 45).
- A sincronização de `Vehicle.status` só reage a manutenção `IN_PROGRESS`
  (não a `WAITING_PARTS`) -- decisão literal do pedido; um veículo com
  manutenção `WAITING_PARTS` continua aparecendo como `ACTIVE`/`AVAILABLE`
  mesmo que fisicamente ainda esteja na oficina aguardando peça.

## 17. Pendências reais

Nenhuma pendência de escopo desta fase.
