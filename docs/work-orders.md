# Ordens de Serviço de Manutenção (Fase 82)

## 1. Auditoria prévia e decisão arquitetural central

Antes de qualquer código, `apps/api/src/fleet/` (Vehicle/Maintenance/MaintenancePlan),
`VehicleAvailabilityService` (Fase 81), `AuditService`, o schema (`VehicleMaintenance`,
`MaintenancePart`, `MaintenancePlan`, `DocumentOwnerType`) e as telas
`apps/admin-web/src/app/(app)/maintenances` e `.../operations/fleet/maintenance` foram
auditados.

**Achado principal**: `VehicleMaintenance` (Fase 13, evoluído nas Fases 45/63) **já era**,
na prática, uma Ordem de Serviço — já tinha `status`, `type` (preventiva/corretiva/
inspeção/emergencial/outra), `priority`, `component`, datas (`openedAt`/`scheduledAt`/
`completedAt`), quilometragem, `workshop`/`supplier`/`mechanic`, `responsibleUserId`,
`description`/`notes`, custos (`laborCost`/`partsCost`/`totalCost` sempre recalculado),
peças itemizadas (`MaintenancePart`), vínculo com plano preventivo
(`maintenancePlanId` → `MaintenancePlan`), e até um `serviceOrderNumber`.

**Decisão**: `VehicleMaintenance` **é** a Ordem de Serviço — evoluída nesta fase, **nunca
duplicada em uma tabela `WorkOrder` paralela**. `VehicleMaintenance` = fonte de verdade
única, tanto para o histórico executado quanto para o processo operacional em curso (não
existe uma segunda entidade "processo" separada do "registro"). Isso preserva 100% da
integração já existente (dashboards da Fase 40-45, alertas da Fase 63-68, sincronização com
`Vehicle.status`, `GET /vehicles/:id/overview`, plano preventivo) sem duplicar dado nem
criar um segundo ledger de manutenção.

## 2. Ciclo de vida da OS

```
OPEN (aberta)
  → DIAGNOSING (diagnóstico)          [novo, Fase 82]
    → AWAITING_APPROVAL (aguard. aprovação) [novo, Fase 82]
      → APPROVED (aprovada)           [novo, Fase 82]
        → IN_PROGRESS (em execução)   [já existia]
          → COMPLETED (concluída)     [já existia]
  → CANCELLED (cancelada) -- a partir de qualquer estado não-terminal [já existia]
```

`WAITING_PARTS` (já existente desde a Fase 13) continua disponível como estado
intermediário de `IN_PROGRESS` (aguardando peça chegar), sem alteração de semântica.

**Migration aditiva** (`20260825000000_work_orders_lifecycle`): `ALTER TYPE
vehicle_maintenance_status ADD VALUE` × 3 (`DIAGNOSING`, `AWAITING_APPROVAL`, `APPROVED`)
+ `ALTER TABLE vehicle_maintenances ADD COLUMN started_at TIMESTAMP, ADD COLUMN diagnosis
TEXT, ADD COLUMN completion_odometer_km DECIMAL(10,2)` — nenhuma coluna/estado removido,
nenhum default alterado, nenhum dado migrado. `prisma migrate status`: em dia, sem drift.

**Campos novos** (mapeados 1:1 aos pedidos pela seção 2 da Fase 82, que já não existiam em
`VehicleMaintenance`):
- `diagnosis` (texto) — distinto de `description` (problema relatado) e `notes`
  (observações gerais).
- `startedAt` — data em que a execução de fato começou, distinta de `openedAt` (abertura)
  e `scheduledAt` (previsão).
- `completionOdometerKm` — quilometragem na conclusão, distinta de `odometerKm` (na
  abertura) e de `nextOdometerKm` (projeção da próxima manutenção deste componente).

"Origem da manutenção" (preventiva/corretiva/inspeção/outra) = o campo `type` já existente
(`VehicleMaintenanceType`), reaproveitado — não é um conceito novo.

## 3. Regras de transição

Duas camadas de validação, propositalmente distintas:

1. **`PATCH /maintenances/:id/status`** (genérico, existente desde a Fase 63) — mantido
   **inalterado**: `assertValidMaintenanceStatusTransition` só bloqueia transições
   originadas de um estado terminal (`COMPLETED`/`CANCELLED`); qualquer outra transição é
   aceita, incluindo pular direto para `COMPLETED` (fluxo real de serviço rápido resolvido
   na hora, já testado e documentado desde a Fase 63). **Não foi alterado** para não
   quebrar esse comportamento já em produção.

2. **Ações dedicadas da Fase 82** (`assertWorkOrderActionAllowed`) — guard mais estrito,
   por ação, usado só pelos 6 endpoints novos:

   | Ação | Origem aceita |
   |---|---|
   | `diagnose` | `OPEN` |
   | `submitForApproval` | `OPEN`, `DIAGNOSING` |
   | `approve` | `AWAITING_APPROVAL` |
   | `start` | `OPEN`, `DIAGNOSING`, `APPROVED`, `WAITING_PARTS` |
   | `complete` | qualquer não-terminal (preserva o atalho de serviço rápido) |
   | `cancel` | qualquer não-terminal |

   `start` propositalmente **não** aceita `AWAITING_APPROVAL` (não é possível começar a
   executar algo pendente de decisão sem aprovar ou reabrir antes).

`OPEN_MAINTENANCE_STATUSES` (constante que já existia, duplicada literalmente em 3 lugares
— `maintenance-status-transition.util.ts`, `FleetOperationsMetricsService`,
`DashboardService`) foi **consolidada em uma única fonte** exportada de
`maintenance-status-transition.util.ts`, agora incluindo os 3 novos estados. Os 2
consumidores (dashboards) passaram a importar essa constante em vez de manter cópias
locais — mesmo espírito de consolidação já aplicado ao `VehicleAvailabilityService` na Fase
81.

## 4. Impacto na disponibilidade do veículo (seção 5 do pedido)

**Nenhuma segunda máquina de estados foi criada.** `Vehicle.status` continua só com
`ACTIVE/INACTIVE/SUSPENDED/MAINTENANCE/SOLD` (Fase 62) — o gatilho que promove
`Vehicle.status` para `MAINTENANCE` continua sendo **exclusivamente** `VehicleMaintenance.
status === IN_PROGRESS` (`VehiclesService.syncStatusForMaintenance`, Fase 63,
**inalterado**). `DIAGNOSING`/`AWAITING_APPROVAL`/`APPROVED` **não** promovem o veículo a
`MAINTENANCE` — são estados de processo (o veículo pode nem estar fisicamente na oficina
ainda enquanto aguarda aprovação de orçamento); só quando a execução de fato começa
(`start` → `IN_PROGRESS`) é que o veículo fica indisponível, mesmo critério que já existia.

`VehicleAvailabilityService` (Fase 81) é **reaproveitado, não recriado**: a ação `start`
chama `vehicleAvailability.isOnTrip(tenantId, vehicleId)` antes de permitir a transição —
nenhuma lógica de disponibilidade nova foi escrita.

## 5. Conflito com viagem e com outra OS (seção 6/18)

`POST /maintenances/:id/start` valida, antes de aplicar a transição:

1. **Veículo em viagem agora?** — `VehicleAvailabilityService.isOnTrip()` (Fase 81). Se
   sim, `409 Conflict` ("o veículo está em viagem no momento").
2. **Outra OS já `IN_PROGRESS` para o mesmo veículo?** — 1 query (`findFirst`) restrita ao
   veículo, excluindo a própria OS. Se sim, `409 Conflict` ("já existe outra OS em execução
   para este veículo") — evita duas equipes "executando" fisicamente o mesmo veículo ao
   mesmo tempo.

O `PATCH /status` genérico **não** ganhou essa validação (permanece como estava, permitindo
inclusive múltiplas `IN_PROGRESS` simultâneas — comportamento já testado desde a Fase 63 em
`maintenance-vehicle-integration.e2e-spec.ts`); a validação de conflito é exclusiva da ação
dedicada `start`, o ponto de entrada recomendado para a Fase 82 em diante.

## 6. Integração com manutenção preventiva (seção 7)

Nenhuma alteração em `MaintenancePlan`/`evaluateMaintenancePlan` (Fase 45). O vínculo
`VehicleMaintenance.maintenancePlanId` já existia e continua sendo a ponte: uma OS aberta a
partir de um plano preventivo apenas referencia o plano, e passa pelo mesmo ciclo de vida
novo (diagnose/approve/start/complete) normalmente.

## 7. Custos, anexos e financeiro (seções 8/9) — deliberadamente fora de escopo

- **Custos**: estrutura já suficiente (`laborCost`/`partsCost`/`totalCost`/`MaintenancePart`)
  — nada novo criado. Nenhum `Payable`/`FinancialTransaction`/`TripExpense` é criado
  automaticamente por nenhuma ação da OS (regra explícita da fase).
- **Anexos**: `DocumentOwnerType` (`VEHICLE/TRAILER/DRIVER/TENANT`) **não** possui um valor
  para manutenção/OS hoje. Estender esse enum seria criar infraestrutura nova, não
  reaproveitar a existente — **não feito nesta fase** (pendência real, seção 10 abaixo).

## 8. Histórico e auditoria (seções 10/23)

Reaproveita 100% `AuditService` (nenhum sistema de auditoria paralelo). Novo `GET
/maintenances/:id/history` espelha exatamente `VehiclesService.getHistory`/`GET
/vehicles/:id/history` (Fase 62): `AuditService.findByEntity(tenantId, 'VehicleMaintenance',
id, pagination)`.

Ações de auditoria novas (`resolveMaintenanceStatusChangeAction` estendido, nomenclatura já
existente `maintenance.*` reaproveitada, não criada do zero):

| Transição | Ação de auditoria |
|---|---|
| `-> DIAGNOSING` | `maintenance.diagnosing` |
| `-> AWAITING_APPROVAL` | `maintenance.awaiting_approval` |
| `-> APPROVED` | `maintenance.approved` |
| `-> IN_PROGRESS` | `maintenance.started` (já existia) |
| `-> COMPLETED` | `maintenance.completed` (já existia) |
| `-> CANCELLED` | `maintenance.cancelled` (já existia) |

"Quem abriu"/"quem aprovou"/"quem concluiu" são derivados do próprio `AuditLog.userId` de
cada evento — nenhuma coluna `approvedBy`/`approvedAt` foi adicionada ao model (o audit log
já captura ator + timestamp de cada transição, evitando duplicar essa informação).

## 9. APIs

Nenhum controller novo — as 6 ações + histórico foram adicionadas ao **mesmo**
`MaintenancesController` (`/maintenances`), reaproveitando `RequireModule(MAINTENANCE)`,
`FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` (Fase 6) já existentes. Não foi criado
`/maintenance/work-orders` (evitaria duplicar o recurso `/maintenances` já maduro e
integrado em toda a aplicação).

| Método | Rota | Observação |
|---|---|---|
| POST | `/maintenances/:id/diagnose` | `{ diagnosis: string }` — `OPEN -> DIAGNOSING` |
| POST | `/maintenances/:id/submit-for-approval` | sem corpo — `-> AWAITING_APPROVAL` |
| POST | `/maintenances/:id/approve` | sem corpo — `-> APPROVED` |
| POST | `/maintenances/:id/start` | sem corpo — `-> IN_PROGRESS`; valida conflito de viagem/OS concorrente |
| POST | `/maintenances/:id/complete` | `{ completedAt?, completionOdometerKm? }` — exige custo total > 0 |
| POST | `/maintenances/:id/cancel` | sem corpo — `-> CANCELLED` |
| GET | `/maintenances/:id/history` | histórico de auditoria (paginado) |
| GET/POST/PATCH/DELETE | `/maintenances`, `/maintenances/:id`, `/maintenances/:id/status` | inalterados; `GET`/`POST`/`PATCH` passaram a incluir `vehiclePlate` na resposta (join com `Vehicle`, ver seção 11) |

## 10. Segurança e isolamento multi-tenant (seção 17)

Reaproveita integralmente `FLEET_READ_ROLES` (inclui `AUDITOR`, exclui `DRIVER`) e
`FLEET_WRITE_ROLES` (`SUPER_ADMIN/ADMIN/MANAGER`) — nenhuma constante nova. Todas as 6 ações
+ histórico passam por `findOwnedOrThrow(tenantId, id)` antes de qualquer operação — OS de
outro tenant sempre `404`, nunca `403` (não revela existência). Coberto por
`work-orders.e2e-spec.ts` (isolamento multi-tenant + RBAC DRIVER/AUDITOR).

## 11. Frontend

- **`/maintenances`** (listagem, evoluída): filtros novos — busca livre (nº OS/descrição/
  oficina/fornecedor/mecânico), placa, tipo, prioridade, período de abertura (além de
  status/componente já existentes). Colunas novas — nº OS + placa, prioridade, previsão,
  conclusão. Linha agora navega para o detalhe (`onRowClick`); botões de ação rápida
  existentes (Editar/Iniciar/Concluir/Cancelar) preservados com `stopPropagation` para não
  disparar a navegação.
- **`/maintenances/:id`** (nova) — centro operacional da OS: identificação, veículo (link),
  problema/diagnóstico, datas/quilometragem, execução (oficina/fornecedor/mecânico), custos
  + peças, aba de histórico (auditoria). Ações mostradas **somente quando válidas para o
  status atual** (mesma tabela de `assertWorkOrderActionAllowed`, espelhada no frontend só
  para UX — o backend continua sendo a autoridade, retornando 409 se necessário).
- **`/vehicles/:id`** (aba Custos) — tabela de manutenções ganhou navegação para o detalhe
  da OS (`onRowClick`). Nenhuma página nova de veículo criada.
- **`/operations/fleet/maintenance`** (dashboard, Fase 45) — novo card "OS atrasadas"
  (`lateWorkOrdersCount`, seção 15 do pedido). Nenhum dashboard novo criado.

`vehiclePlate` foi adicionado a `MaintenanceEntity` (backend + tipos do frontend) via join
com `Vehicle` nos endpoints de leitura/escrita principais (`GET /maintenances`, `GET
/maintenances/:id`, `POST`, `PATCH`) — as 6 ações de ciclo de vida e o `PATCH /:id/status`
genérico **não** fazem esse join (retornam `vehiclePlate: null`), preservando o
comportamento pré-existente de não incluir `parts` nessas respostas; o frontend sempre
invalida e recarrega a OS após qualquer ação, então isso não afeta a UI.

## 12. Driver App

Nenhuma alteração — o Driver App não expõe OS/manutenção hoje, e a Fase 82 não introduziu
nenhum requisito que force uma mudança lá.

## 13. Performance / N+1

- Listagem: paginação e todos os filtros aplicados no banco (`Prisma.findMany` + `count`
  em paralelo), como já era. O join com `Vehicle` (`select: { plate: true }`) é parte da
  mesma query, não uma consulta adicional por linha.
- Detalhe (`GET /maintenances/:id`, `GET /maintenances/:id/history`): 1-2 consultas,
  mesmo padrão de detalhe já usado no resto do projeto.
- `start()`: 2 consultas adicionais (disponibilidade + OS concorrente), ambas O(1),
  independentes do volume de dados.

## 14. Testes direcionados

- **Unitário** (`maintenance-status-transition.util.spec.ts`, estendido): +9 testes —
  `isMaintenanceOpenStatus` com os 3 novos estados, `assertWorkOrderActionAllowed` para as
  6 ações (incluindo os casos de rejeição).
- **E2e** (`work-orders.e2e-spec.ts`, novo, 11 cenários): ciclo de vida completo (OPEN →
  DIAGNOSING → AWAITING_APPROVAL → APPROVED → IN_PROGRESS → COMPLETED, com sincronização de
  `Vehicle.status`), transições inválidas (diagnose fora de OPEN, approve sem submit, start
  a partir de AWAITING_APPROVAL, qualquer ação após CANCELLED), os 2 conflitos de
  disponibilidade (viagem ativa, OS concorrente), isolamento multi-tenant (404 em todas as
  6 ações + histórico), RBAC (DRIVER 403 em tudo; AUDITOR 200 no histórico, 403 nas ações de
  escrita), e histórico refletindo a sequência de ações.
- **Regressão** (não alterada, apenas reexecutada): `maintenances.e2e-spec.ts` (CRUD),
  `maintenance-vehicle-integration.e2e-spec.ts` (sincronização Vehicle↔Maintenance da Fase
  63), `fleet-maintenance.e2e-spec.ts`, `dashboard.e2e-spec.ts`, `fleet-operations.e2e-spec.ts`
  — 98 testes, todos passando sem nenhuma alteração nos arquivos de teste (comportamento
  100% preservado pela consolidação de `OPEN_MAINTENANCE_STATUSES` e pelo join de
  `vehiclePlate`).
- **Frontend** (vitest): `maintenances/page.test.tsx` (5, estendido com mock de
  `useRouter`), `maintenances/[id]/page.test.tsx` (6, novo), `operations/fleet/maintenance/
  page.test.tsx` e `operations/fleet/page.test.tsx` (fixtures atualizadas com o campo novo
  `lateWorkOrdersCount`) — todos passando.

Não foi executada a suíte completa do monorepo (regra da Fase 82, seção 20) — a mudança de
schema é aditiva e o raio de impacto (constantes de "OS em aberto" + join de `vehiclePlate`)
foi verificado diretamente nos 5 arquivos de teste e2e que dependem desses módulos.

## 15. Limitações reais

- Sem anexos/fotos/orçamento/laudo na OS — `DocumentOwnerType` não cobre manutenção hoje;
  estender esse enum é trabalho de fase futura (não "já suportado pela infraestrutura
  existente").
- `vehiclePlate` não está disponível na resposta direta das 6 ações de ciclo de vida nem do
  `PATCH /:id/status` genérico (só nas rotas de leitura/criação/edição) — mesma limitação
  pré-existente que já afetava `parts` desde a Fase 63; documentado, não corrigido (fora de
  escopo, sem impacto real na UI por causa da invalidação/refetch do React Query).
- `start`/`complete`/`cancel` dedicados não têm limite de tentativas concorrentes além do
  que o banco já garante via transação (`$transaction` em `applyStatusChange`) — não foi
  identificado um risco real de duas requisições simultâneas para a MESMA OS além do que já
  é coberto (a segunda requisição sempre lê o estado pós-commit da primeira); nenhum lock
  adicional foi criado, conforme instrução de não criar locks complexos sem necessidade
  concreta.

## 16. Pendências reais

- Integração de anexos (seção 9) — pendência real, aguardando decisão de estender
  `DocumentOwnerType` ou criar infraestrutura de anexos própria (fase futura).
- Integração operacional → financeiro (Payable/FinancialTransaction a partir do custo da
  OS) — deliberadamente não implementada nesta fase, conforme escopo.
- Fase 83 (Estoque de Peças) poderá substituir `MaintenancePartInputDto` (texto livre por
  peça) por um vínculo com um catálogo de peças real, quando esse módulo existir.
