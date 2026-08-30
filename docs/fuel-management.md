# Abastecimento, Combustível e Controle de Consumo (Fase 65)

## Escopo

| Item | Status |
|---|---|
| Registro de abastecimento (litros, preço, valor calculado no backend) | ✅ (reaproveitado, já existia desde a Fase 18) |
| Validação de odômetro (nunca regressivo) | ✅ (reaproveitado) |
| Vínculo com viagem/motorista/veículo (derivação forçada) | ✅ (reaproveitado) |
| Idempotência via `deviceEventId` | ✅ (reaproveitado) |
| Custo integrado ao financeiro existente | ✅ (reaproveitado) |
| Consumo (km/L, custo/km, entre abastecimentos consecutivos) | ✅ (reaproveitado) |
| Anomalias/alertas (preço, consumo, volume, hodômetro regressivo) | ✅ (reaproveitado, nível de frota) |
| Dashboard de combustível (2 níveis) | ✅ (reaproveitado) |
| Postos/fornecedores (`FuelStation`, FK real) | ✅ (reaproveitado) |
| Driver App (offline-first, fila, idempotência) | ✅ (reaproveitado, já existia desde a Fase 25) |
| Overview do veículo mostrando último abastecimento/consumo/alerta | ❌ → ✅ (novo, gap real) |
| Correção de contrato divergente no client de API do admin-web | ❌ → ✅ (corrigido) |
| Ação de editar/excluir abastecimento na UI | ❌ → ✅ (novo, gap real) |
| Checagem de `Driver.status` ao registrar abastecimento pelo app | ✅ (já coberto por `DriverGuard`, sem necessidade de duplicar) |

## Auditoria prévia (o que já existia vs. o que foi criado)

O módulo de combustível **já era extremamente maduro** antes desta fase —
construído ao longo de três fases reais anteriores do projeto (comentários
no código citam explicitamente "Fase 18" para o CRUD básico e cálculo de
consumo, "Fase 25" para o fluxo do app do motorista, "Fase 42" para o
dashboard avançado com alertas e rankings). Nenhum desses arquivos foi
tocado nas Fases 61-64 desta sessão. A Fase 65 auditou tudo isso primeiro e
identificou apenas 3 gaps genuínos:

1. **`VehicleOverviewService` descartava dados já calculados.** A chamada a
   `FuelSuppliesService.getVehicleFuelHistory()` já existia (usada para
   preencher `metrics.fuelSuppliesCount`), mas o retorno completo
   (`totalLiters`, `totalAmount`, `averageConsumptionKmL`) era ignorado —
   o overview do veículo (pedido explícito da seção 12) não mostrava nada
   sobre o abastecimento mais recente nem consumo médio.
2. **Bug de contrato pré-existente no admin-web**:
   `apps/admin-web/src/lib/api/fleet.api.ts::getVehicleFuelHistory` estava
   tipado como `Paginated<FuelSupplyEntity>`, mas o backend
   (`GET /vehicles/:id/fuel-history`) sempre retornou `VehicleFuelHistoryEntity`
   (`{vehicleId, items, suppliesCount, totalLiters, totalAmount,
   averageConsumptionKmL}`, sem `.meta`). O frontend enviava `{ pageSize: 50 }`,
   mas o parâmetro real aceito pelo backend é `limit` — `pageSize` era
   silenciosamente ignorado. Corrigido nesta fase (não é invenção de
   escopo, é a mesma tela que a fase pede para consolidar).
3. **Sem ação de editar/excluir na tela `/fuel-supplies`**:
   `updateFuelSupply`/`deleteFuelSupply` já existiam no client de API, mas
   nenhum componente os chamava — pedido explícito da seção 17
   ("consolidar: ... edição").

Confirmado explicitamente que **não é necessário** duplicar a checagem de
`Driver.status`/`isActive` em `FuelSuppliesService.assertDriverExists()`
(usada só no fluxo administrativo): o endpoint do app do motorista
(`POST /driver/trips/:id/fuel-supplies`) já roda atrás de `DriverGuard`
(`apps/api/src/driver-trips/guards/driver.guard.ts`), que bloqueia
qualquer usuário cujo `Driver.isActive` seja `false` (sincronizado com
`Driver.status`, Fase 61) **antes** de qualquer service ser chamado —
adicionar uma segunda checagem violaria a regra explícita da seção 11
("não duplicar regras de disponibilidade").

## 1. Abastecimento

Sem alteração de comportamento. `FuelSuppliesService.create`/`update`
sempre recalculam `totalAmount = liters * pricePerLiter` no backend
(`computeTotalAmount`, `common/utils/fuel-consumption.util.ts`) — o DTO
nem tem esse campo, então o valor enviado pelo cliente (se houver) é
simplesmente ignorado pelo `ValidationPipe` (`forbidNonWhitelisted`).

## 2. Odômetro

Sem alteração. `assertOdometerNotBelowVehicle`/`computeBumpedOdometer`
(`common/utils/odometer.util.ts`) já garantem que nenhum abastecimento
(administrativo ou do app) aceite `odometerKm` menor que
`Vehicle.odometerKm` atual, e que o odômetro do veículo seja avançado
automaticamente quando o novo valor é maior. **Fase 110**: a mesma regra
passou a ser reaproveitada também por `TiresService.createMovement`
(`odometerKm` de uma troca de pneu também avança `Vehicle.odometerKm`) --
ver `docs/tire-management.md` seção 2.

## 3. Vínculo com viagem/motorista/veículo

Sem alteração. Quando `tripId` é informado, `vehicleId`/`driverId` são
**sempre** derivados da viagem (`trip.composition.vehicleId`/`trip.driverId`)
— qualquer valor enviado pelo cliente nesse caso é ignorado, tanto na
criação quanto na edição (`tripId` é imutável, removido do DTO de
atualização via `OmitType`). Sem viagem, `vehicleId`/`driverId` tornam-se
obrigatórios e validados diretamente.

## 4. Duplicidade / idempotência

Sem alteração. `FuelSupply.deviceEventId String? @unique` já existe no
schema, usado exclusivamente por `createFromDriverApp`: reenvio do mesmo
evento (mesmo `deviceEventId`) retorna o registro já criado em vez de
duplicar ou lançar erro. O fluxo administrativo (`create()`) não usa esse
mecanismo por design — é preenchido por humano via UI, sem risco de reenvio
automático offline.

## 5. Custos / integração financeira

Sem alteração. `TripExpense.category` tem o valor `FUEL`, mas
**deliberadamente não há FK entre `TripExpense` e `FuelSupply`** (mesma
decisão arquitetural já documentada para manutenção/pneus nas Fases
63/64) — são dois lançamentos independentes. O custo de combustível
aparece nos dashboards financeiros consolidados (`GET /fleet-operations/costs`,
`getFinancialDashboard`) como categoria própria, nunca somado através de
um vínculo inexistente.

## 6. Consumo

Sem alteração. `computeFuelConsumptionSegments`/`computeConsumptionTotals`/
`computeAverageConsumptionKmL` (`common/utils/fuel-consumption.util.ts`,
Fase 18) já implementam o método "tanque cheio a tanque cheio": distância
= diferença de odômetro entre abastecimentos consecutivos (ordenados por
odômetro, nunca por data), consumo = distância / litros do abastecimento
mais recente do par. Retorna `null` com menos de 2 abastecimentos válidos
do mesmo veículo — nunca uma distância inventada.

## 7. Anomalias / alertas

Sem alteração dos 5 alertas já existentes no nível de frota
(`FUEL_PRICE_OUTLIER`, `CONSUMPTION_OUTLIER_HIGH`, `CONSUMPTION_OUTLIER_LOW`,
`SUPPLY_VOLUME_OUTLIER`, `ODOMETER_REGRESSION`), documentados em
[`docs/fuel-operations-dashboard.md`](./fuel-operations-dashboard.md).
`detectOdometerRegression` ordena por **data real** (`supplyDate`), distinto
da ordenação por odômetro usada no cálculo de consumo — um abastecimento
lançado com data anterior mas odômetro maior que um já registrado
posteriormente é uma inconsistência real (erro de digitação/lançamento
tardio), nunca produzida "por construção" pelas funções de consumo.

## 8. Overview do veículo (NOVO)

`GET /vehicles/:id/overview` (`VehicleOverviewService`) passou a
aproveitar o retorno **completo** de `getVehicleFuelHistory()` (já
buscado, nenhuma query nova):

- `metrics.lastFuelSupplyLiters` / `lastFuelSupplyAmount` / `lastFuelSupplyDate`
  -- do abastecimento mais recente (`items[0]`, já que a busca usa
  `limit=1` e `orderBy: supplyDate desc`).
- `metrics.averageFuelConsumptionKmL` -- mesmo cálculo já usado em
  `GET /vehicles/:id/fuel-history`, reaproveitado.
- Alerta `VEHICLE_FUEL_ODOMETER_REGRESSION` (severidade CRITICAL) quando
  `hasOdometerRegression` (ver seção 9) é `true`.

`GET /vehicles/:id/fuel-history` (`VehicleFuelHistoryEntity`) ganhou o
campo `hasOdometerRegression: boolean` (seção 9) -- **zero queries
adicionais**: a busca que já trazia `{id, odometerKm, liters}` de todas as
movimentações do veículo passou a trazer `supplyDate` também, reaproveitando
`detectOdometerRegression` (a mesma função já usada pelo alerta de frota).

## 9. Detecção de hodômetro regressivo por veículo (NOVO)

`hasOdometerRegression` em `VehicleFuelHistoryEntity` é `true` quando,
ordenando os abastecimentos do veículo por `supplyDate` real, algum
registro mais recente no tempo tem `odometerKm` menor que um anterior --
cenário possível mesmo com a validação de odômetro no `create()` (que só
compara contra o valor atual/máximo já registrado, não contra a ordem
cronológica): um abastecimento lançado tardiamente com uma data retroativa
mas valor de odômetro digitado incorretamente (maior que deveria) passa na
validação de criação, mas gera uma inconsistência real quando reordenado
pela data verdadeira -- exatamente o motivo de existir uma função dedicada
(`detectOdometerRegression`) distinta do cálculo de consumo.

## 10. Frontend

`/fuel-supplies` (evoluída): coluna "Ações" (só para `FUEL_SUPPLY_WRITE_ROLES`)
com Editar (`UpdateFuelSupplyModal`, novo -- reaproveita `PATCH /fuel-supplies/:id`,
`vehicleId`/`driverId`/`tripId` nunca editáveis ali de propósito, mesma
decisão já tomada para manutenção na Fase 63) e Excluir (`ConfirmDialog`
existente, reaproveita `DELETE /fuel-supplies/:id`).

`/vehicles/[id]` (aba Custos, evoluída): a lista de abastecimentos ganhou 4
`StatCard`s (litros totais, custo total, consumo médio, situação do
hodômetro) alimentados pelo **mesmo** `VehicleFuelHistoryEntity` já
buscado -- nenhuma query nova no frontend. Corrigido o bug de contrato
descrito na auditoria (`getVehicleFuelHistory` agora tipado e chamado
corretamente com `limit`).

`/operations/fleet/fuel` e `/fuel-stations`: **sem alteração de código** --
já completos desde a Fase 42/18.

## 11. Driver App

**Sem alteração** -- o fluxo de abastecimento (`FuelScreen.tsx`) já existia
desde a Fase 25, com o mesmo mecanismo genérico de fila offline-first
(`syncQueue.ts`: `submitOrQueue`/`flushQueue`) e idempotência
(`deviceEventId`) reaproveitado de todos os outros eventos do app
(comprovante de entrega, paradas, eventos de eixo, checklists). Nenhuma
fila ou mecanismo de retry paralelo foi criado, conforme exigido pela seção
13 do pedido.

## 12. API

Nenhum endpoint novo. Todos os endpoints pedidos na seção 18 já existiam
com nomenclatura idêntica: `GET/POST /fuel-supplies`, `GET/PATCH/DELETE
/fuel-supplies/:id`, `GET /fleet-operations/fuel`, `GET /vehicles/:id/fuel-history`.
`GET /fuel-supplies/dashboard` também já existia (mais simples, sem
filtros de data/veículo além dos já suportados por `FindFuelSuppliesQueryDto`).

## 13. RBAC / multi-tenant / limites de plano

Sem alteração -- `FuelSuppliesController`/`FuelStationsController` já
usam `@RequireModule(TenantModule.FUEL)` + `FUEL_SUPPLY_READ/WRITE_ROLES`
(mesmo padrão de `FLEET_READ/WRITE_ROLES`). Confirmado: **não existe**
nenhum limite de plano relacionado a abastecimentos em `TenantPlan` (só
`maxUsers`/`maxVehicles`/`maxDrivers`/`maxStorageMb`) -- não foi criado
nenhum limite novo.

## 14. Auditoria

Reaproveita `AuditService` integralmente -- `fuel_supply.created`,
`fuel_supply.updated`, `fuel_supply.deleted` já existiam e não foram
alterados (o pedido sugeria `fuel.created`/`fuel.updated`/`fuel.cancelled`
como "convenção equivalente" -- a convenção real do projeto usa
`fuel_supply.*`/`deleted` em vez de `cancelled`, já que não existe um
conceito de "cancelamento" distinto de exclusão para `FuelSupply`, mesma
decisão de reuso documentada para manutenção/pneus).

## 15. Performance / N+1

- `GET /vehicles/:id/fuel-history`: sem alteração de contagem de queries
  (3 fixas: `items`, `points`, `aggregate`) -- `hasOdometerRegression`
  reaproveita a query de `points`, só adicionou `supplyDate` ao `select`.
- `GET /vehicles/:id/overview`: sem alteração de contagem de queries -- os
  novos campos de `metrics` vêm do MESMO retorno de `getVehicleFuelHistory()`
  que já era buscado (chamada já existente desde a Fase 62).
- `GET /fuel-supplies`, `GET /fuel-supplies/dashboard`,
  `GET /fleet-operations/fuel`: sem alteração -- já comprovados sem N+1
  (`fleet-operations-fuel.e2e-spec.ts` já tinha suíte dedicada de
  verificação real de contagem de queries, 10 e 50 veículos).

## 16. Testes

- **E2E (novo)**: `apps/api/test/fuel-vehicle-integration.e2e-spec.ts` --
  6 casos: `hasOdometerRegression` falso/verdadeiro em `GET /vehicles/:id/fuel-history`,
  métricas de combustível + ausência/presença do alerta no overview,
  overview sem nenhum abastecimento (campos null/zero, nunca inventados),
  edição (recalcula `totalAmount`) e exclusão de abastecimento.
- **Regressão confirmada verde**: `fuel-management.e2e-spec.ts` +
  `fleet-operations-fuel.e2e-spec.ts` (32 casos, inclui o teste de N+1
  já existente), `driver-trips.e2e-spec.ts` (fluxo de abastecimento do
  app do motorista) + `vehicle-management.e2e-spec.ts` (59 casos),
  `maintenance-vehicle-integration.e2e-spec.ts` +
  `tire-vehicle-integration.e2e-spec.ts` (17 casos, garantindo que os
  overviews de manutenção/pneus das Fases 63/64 continuam intactos com a
  extensão de combustível).

## 17. Limitações reais

- Sem vínculo estrutural `FuelSupply` ↔ `TripExpense` (seção 5) -- decisão
  arquitetural já estabelecida antes desta fase, consistente com
  manutenção/pneus.
- `hasOdometerRegression`/`averageFuelConsumptionKmL` no overview do
  veículo consideram o **histórico completo** do veículo (não um período
  filtrado) -- o overview não aceita filtro de data, diferente do
  dashboard de frota (`GET /fleet-operations/fuel`), que sim aceita.
- Sem checagem de `Driver.status` no fluxo administrativo (`create()`
  direto via admin-web) -- só o fluxo do app do motorista é protegido por
  `DriverGuard`; um administrador pode registrar um abastecimento avulso
  para um motorista `SUSPENDED`/`INACTIVE` pela tela `/fuel-supplies`, já
  que esse fluxo nunca teve essa restrição (mesmo comportamento de antes
  desta fase, fora do escopo estrito da seção 11, que fala especificamente
  do Driver App).

## 18. Pendências reais

Nenhuma pendência de escopo desta fase.

## 19. Fase 107 — Integração de Abastecimento com Operação

### Auditoria prévia

Objetivo da fase: "conectar definitivamente o abastecimento à operação
real" (vínculo com viagem, custo refletido nos dashboards, custo/km,
Driver App na mesma fonte de dados, offline/idempotência, RBAC/multi-
tenant/auditoria, sem N+1). A auditoria confirmou que **quase tudo já
existia**, construído nas Fases 18/25/42/51/65/71 — o schema já tinha
`FuelSupply.tripId` (opcional, com FK e índice), o service já derivava
`vehicleId`/`driverId` da viagem, já impedia odômetro regressivo e já
avançava `Vehicle.odometerKm` automaticamente, `fuelCost` já era somado
por `tripId` em `getFinancialDashboard`/`getFinancialResult` (Fase 51/71,
`docs/trip-financial-result.md`), custo/km já era calculado e exibido no
dashboard de frota (`GET /fleet-operations/fuel`, `/operations/fleet/fuel`,
`docs/fuel-operations-dashboard.md`), e o Driver App já registrava
abastecimento vinculado à viagem pela fila offline existente
(`syncQueue.ts`, idempotente por `deviceEventId`) desde a Fase 25.

Só 2 lacunas reais foram encontradas — as duas são de **apresentação**,
nunca de regra de negócio nova:

1. **Sem visibilidade do vínculo no admin-web.** O backend já filtrava por
   `tripId` (`FindFuelSuppliesQueryDto`), mas a tela `/fuel-supplies` não
   expunha esse filtro nem uma coluna "Viagem"; a página de detalhe da
   viagem não tinha nenhuma aba mostrando os abastecimentos vinculados a
   ela — o único jeito de ver o "contexto de combustível" de UMA viagem
   era ir à tela global e não havia como filtrar.
2. **`costPerKm` calculado mas não exibido em `/fuel-supplies`.**
   `FuelDashboardEntity.costPerKm` já existia no contrato HTTP (mesma
   fórmula do dashboard de frota), mas a tela simples de abastecimentos só
   mostrava consumo médio (km/L), não custo/km.

Nenhuma migration foi necessária — `tripId` já existe desde a Fase 25.

### Backend (aditivo, sem mudança de regra)

- **`tripLabel` denormalizado** em `FuelSupplyEntity` ("origem → destino"),
  mesma convenção já usada em `TripBillingEntity`/`FinanceReconciliationEntity`
  — `SUPPLY_INCLUDE` (`FuelSuppliesService`) ganhou `trip: { select:
  { origin: {select:{name:true}}, destination: {select:{name:true}} } } }`,
  um `select` mínimo dentro da MESMA query já existente (nunca uma
  consulta nova, nunca N+1 — é um `include`/join a mais na query única de
  sempre). `null` quando `tripId` é `null` (nunca inventado).
- Nenhum endpoint novo. `GET /fuel-supplies?tripId=...` (já existente,
  Fase 18) é reaproveitado tanto pela nova aba da viagem quanto pelo novo
  filtro da tela global.

### Frontend

- **Aba "Combustível" na viagem** (`apps/admin-web/src/features/trips/tabs/
  fuel-tab.tsx`, novo) — lista os abastecimentos vinculados via
  `GET /fuel-supplies?tripId=...` (mesmo endpoint/serviço da tela global,
  nenhuma consulta nova), com totais de valor/litros e botão "Registrar
  abastecimento" que abre o MESMO `CreateFuelSupplyModal` já existente, só
  com a viagem pré-selecionada.
- **`CreateFuelSupplyModal`** ganhou a prop opcional `defaultTripId` (mesmo
  padrão já usado por `CreateTollModal.tripId`) — pré-preenche o campo
  "Viagem" sem travá-lo, comportamento idêntico ao já existente quando
  aberto a partir da tela global (sem prop).
- **`/fuel-supplies`**: coluna "Viagem" (`tripLabel ?? '—'`), filtro por
  viagem (`EntitySelect` + `listTrips`, mesmo padrão já usado em outros
  filtros) e `StatCard` "Custo por km" (`costPerKm`, já calculado pelo
  backend, só não estava sendo exibido).

### Driver App

**Sem alteração** — o fluxo (`FuelScreen.tsx` → `syncQueue.ts` `kind:
'fuel-supply'` → `POST /driver/trips/:id/fuel-supplies`) já usa
integralmente a MESMA tabela/serviço (`FuelSuppliesService.
createFromDriverApp`) que o fluxo administrativo, já é idempotente por
`deviceEventId` e já funciona offline (fila existente) — confirmado, não
duplicado.

### Testes

- **Backend** (`test/fuel-management.e2e-spec.ts`, estendido): `tripLabel`
  correto quando vinculado / `null` quando não vinculado (+ refletido na
  listagem por `tripId`); RBAC novo — `DRIVER` (papel de usuário, distinto
  do fluxo `/driver/*`) bloqueado 403 em leitura/escrita, `AUDITOR` lê mas
  não escreve (403); N+1 novo — contagem de queries de `GET /fuel-supplies`
  e `GET /fuel-supplies/dashboard` comprovadamente fixa (não cresce de 5
  para 25 abastecimentos). Suíte completa: 18/18.
- **Regressão confirmada verde**: `fuel-vehicle-integration.e2e-spec.ts`
  (6), `fleet-operations-fuel.e2e-spec.ts` (18, N+1 de frota já existente),
  `driver-trips.e2e-spec.ts` (39, fluxo de abastecimento do app), `trip-
  finance.e2e-spec.ts` (19, `fuelCost` por `tripId` em
  `getFinancialDashboard`/`getFinancialResult`).
- **Frontend** (novo): `fuel-supplies/page.test.tsx` (5 testes — StatCard de
  custo/km disponível/indisponível, coluna "Viagem" com/sem vínculo, filtro
  por viagem reenviando `tripId`) e `features/trips/tabs/fuel-tab.test.tsx`
  (4 testes — estado vazio, listagem com totais, RBAC de leitura para
  `AUDITOR`, modal pré-preenchido). Suíte completa do admin-web: 246/247
  (única falha pré-existente e não relacionada em `parts/page.test.tsx`).

### Limitações reais (preexistentes, não alteradas nesta fase)

- **Sem vínculo estrutural `FuelSupply` ↔ `TripExpense`** (categoria
  `FUEL`) — já documentado na seção 5; se a operação lançar o mesmo
  abastecimento nos dois lugares, `fuelCost` e `expenseCost` somam
  separadamente (`docs/trip-financial-result.md`, seção "Limitações
  conhecidas", item 3). Corrigir isso exigiria mudar uma regra de negócio
  de um endpoint já usado por `TripMetrics.actualTotalCost`/
  `FreightPricingService.getProfitability` — fora do escopo desta fase, que
  pede explicitamente para **não** criar integração financeira automática
  nova, apenas preservar a arquitetura existente e documentar o ponto (o
  que esta seção faz).
- `tripId` continua imutável após a criação (mesma decisão já tomada para
  `TripExpense`/`TripRevenue`/`TripAdvance`) — não é possível vincular
  retroativamente um abastecimento histórico a uma viagem pela UI.
