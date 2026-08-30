# Pneus, Componentes e Controle de Desgaste (Fase 64)

## Escopo

| Item | Status |
|---|---|
| Cadastro de pneus (fabricante, modelo, medida, DOT, custo, status) | ✅ (reaproveitado, já existia desde a Fase 20) |
| Status do ciclo de vida (`TireStatus`) | ✅ (reaproveitado) |
| Instalação/retirada/transferência entre estoque/veículo/carreta | ✅ (reaproveitado) |
| Bloqueio de posição duplicada / pneu em dois lugares ao mesmo tempo | ✅ (reaproveitado) |
| Histórico imutável de movimentação | ✅ (reaproveitado) |
| Recapagem com custo | ✅ (reaproveitado) |
| Dashboard de pneus (dois níveis) | ✅ (reaproveitado + 2 indicadores novos) |
| Alerta de proximidade de troca | ✅ (reaproveitado no nível de frota + novo no nível de veículo) |
| Overview do veículo (Fase 62/63) mostrando seus pneus | ❌ → ✅ (novo, gap real) |
| Indicadores de vida útil por pneu (custo total, intervenções, dias instalado, custo/km) | ❌ → ✅ (novo, gap real) |
| "Pneus por posição" e "custo médio por pneu" no dashboard | ❌ → ✅ (novo, gap real) |
| Correção do payload de movimentação no admin-web (bug pré-existente) | ❌ → ✅ (corrigido) |
| Integração relacional pneu ↔ manutenção (`VehicleMaintenance`) | ❌ → ✅ (Fase 109, ver seção 9) |
| Taxonomia estruturada de eixo/lado | ❌ (decisão deliberada de não criar, ver seção 5) |
| Atomicidade/concorrência real na movimentação (`createMovement`) | ❌ → ✅ (Fase 109, ver seção 2) |

## Auditoria prévia (o que já existia vs. o que foi criado)

O módulo de pneus **já era completo e maduro** desde o commit que introduziu a
"Fase 20" (schema `Tire`/`TireMovement`/`TireRetread`/`TireInspection`/
`TireDisposal`, service `TiresService` com ~820 linhas, controller com 15
rotas, dois dashboards, frontend com listagem + detalhe de 5 abas + 5
modais, e ~30 casos de teste e2e em `tire-management.e2e-spec.ts` e
`fleet-operations-tires.e2e-spec.ts`). A Fase 64 auditou tudo isso primeiro
e não recriou nada — apenas preencheu gaps genuínos:

1. **`VehicleOverviewService` (Fase 62/63) não tinha nenhuma menção a
   pneus** — confirmado por busca no arquivo antes de qualquer alteração.
   O detalhe do veículo (`/vehicles/[id]`) não tinha aba "Pneus", apesar do
   pedido explícito da seção 15.
2. **`GET /tires/:id` não calculava nenhum indicador de vida útil** (custo
   total, intervenções, tempo instalado, custo/km) — só devolvia os campos
   brutos do cadastro. Seção 10 do pedido pede exatamente isso.
3. **O dashboard `GET /fleet-operations/tires` não tinha "pneus por
   posição" nem "custo médio"** — pedidos explicitamente nas seções 7 e 14.
4. **Bug pré-existente encontrado na auditoria**: o client de API do
   admin-web (`CreateTireMovementPayload`) enviava os campos
   `locationType`/`vehicleId`/`trailerId`/`position`, mas o
   `CreateTireMovementDto` do backend espera
   `newLocationType`/`newVehicleId`/`newTrailerId`/`newPosition`. Com o
   `ValidationPipe` global (`forbidNonWhitelisted: true`), toda chamada de
   "Nova movimentação" pela UI retornava 400 -- a funcionalidade estava
   **inoperante em produção**. Corrigido nesta fase (não é um gap de
   escopo, é uma correção de defeito real dentro do próprio objetivo da
   fase: "instalação do pneu" / seção 15).

## 1. Cadastro e status do pneu

Sem alteração. `Tire` já tem identificação única (`fireNumber`, único por
tenant), fabricante, modelo, medida, DOT, número de série, data/custo de
aquisição, sulco inicial/atual, e `TireStatus` (`NEW`/`IN_USE`/`STOCK`/
`RETREADED`/`SCRAPPED`). `TireLocationType` (`STOCK`/`VEHICLE`/`TRAILER`)
representa **onde** o pneu está, distinto de `TireStatus` (**qual estado**
ele está).

**Decisão de reuso**: o pedido sugeria (seção 3) um enum alternativo com
`ACTIVE`/`IN_STOCK`/`MAINTENANCE`/`REMOVED`/`SCRAPPED`. O enum existente
(`TireStatus`) já cobre a mesma semântica com nomes diferentes — `IN_USE` ≈
`ACTIVE`, `STOCK` ≈ `IN_STOCK`, `SCRAPPED` = `SCRAPPED`. Não existe um
estado `MAINTENANCE` nem `REMOVED` distintos: uma recapagem é registrada
como evento já concluído (nunca fica "pendente"), e retirar um pneu do
veículo sempre resulta em `STOCK` (o sistema não distingue "removido mas
preservado" de "em estoque" -- são o mesmo conceito por design). Criar um
enum paralelo duplicaria semântica já coberta e violaria a seção 25
("reutilize o que já existe") -- não foi feito.

## 2. Instalação, retirada e transferência

Sem alteração de comportamento -- `POST /tires/:id/movements`
(`TiresService.createMovement`) já cobre os três fluxos com um único
endpoint genérico (o destino, `newLocationType`, decide o comportamento).
Já validava (antes desta fase):

- Pneu `SCRAPPED` não pode ser movimentado.
- Veículo/carreta de destino precisa existir no tenant.
- **Nenhuma posição pode ter dois pneus ao mesmo tempo** no mesmo veículo/
  carreta (`assertPositionAvailable`).
- Um pneu só tem uma localização por vez (garantido pelo próprio model
  `Tire`, que guarda um único snapshot atual).

Corrigido nesta fase: **o client de API do admin-web** (ver seção "bug
pré-existente" acima) -- `apps/admin-web/src/lib/api/tires.api.ts` e
`apps/admin-web/src/features/tires/create-movement-modal.tsx` agora enviam
`newLocationType`/`newVehicleId`/`newTrailerId`/`newPosition`, alinhados ao
DTO do backend.

### Fase 109 -- atomicidade / concorrência (gap real fechado)

**Lacuna real identificada na auditoria**: `createMovement` fazia a leitura
do pneu, a checagem `assertPositionAvailable` e as duas escritas
(`TireMovement.create` + `Tire.update`) como chamadas soltas sequenciais,
sem nenhuma transação. Como `Tire.position` é texto livre (sem constraint
única de banco -- seção 5), duas requisições concorrentes movendo pneus
DIFERENTES para a MESMA posição do MESMO veículo podiam ambas passar pela
checagem antes de qualquer uma commitar, violando a invariante "uma
posição, um pneu".

Fechado envolvendo a leitura+checagem+escrita numa única transação
`SERIALIZABLE` (`runSerializable`, `apps/api/src/tenants/utils/plan-limit.util.ts`
-- **mesmo utilitário já usado por `PartsService.applyMovement`** desde a
Fase 83, nenhum mecanismo novo). Sob conflito real, o Postgres aborta a
transação perdedora com `40001` e `runSerializable` reexecuta
automaticamente uma vez; a segunda tentativa então vê o estado já
committado e recebe o 409 esperado de `assertPositionAvailable` -- nunca um
lock explícito, nunca um mutex em memória. Comprovado com um teste real de
concorrência (duas requisições disparadas em paralelo via `Promise.all`,
não apenas sequenciais), ver seção 17.

### Fase 110 -- `odometerKm` da movimentação propaga para `Vehicle.odometerKm`

**Lacuna real identificada na auditoria**: `POST /tires/:id/movements` já
aceitava um `odometerKm` opcional (usado desde a Fase 64 só para calcular
`costPerKm`), mas essa leitura nunca era propagada para `Vehicle.odometerKm`
-- a mesma leitura real que o mecânico anota ao trocar um pneu ficava presa
no histórico do pneu, mesmo sendo, na prática, uma leitura do veículo tão
válida quanto a de um abastecimento. Resultado: o odômetro do veículo podia
ficar desatualizado mesmo com uma troca de pneu recente registrada.

Fechado reaproveitando **integralmente** a mesma regra "quilometragem só
anda para frente" já usada por abastecimento
(`assertOdometerNotBelowVehicle`/`computeBumpedOdometer`,
`apps/api/src/common/utils/odometer.util.ts`) -- nenhuma segunda regra de
odômetro. O veículo relevante é o de **destino** quando a movimentação
instala/transfere o pneu para um veículo, senão o veículo **atual** do pneu
quando a retirada é dele (volta ao estoque, troca para carreta); sem nenhum
veículo envolvido (ex.: estoque → carreta), não há o que checar -- nunca
inventa um veículo. Carreta nunca é candidata (não tem `odometerKm` no
schema). A leitura+checagem+escrita do odômetro roda **dentro da mesma
transação `SERIALIZABLE`** da subseção anterior, então também fica protegida
contra concorrência. `odometerKm` menor que o atual do veículo continua
rejeitado com 409 (mesmo comportamento de abastecimento); movimentação sem
`odometerKm` nunca altera `Vehicle.odometerKm` (regressão coberta por
teste).

## 3. Histórico de movimentação

Sem alteração -- `TireMovement` já é insert-only (nenhum `update`/`delete`
em nenhum service), com `GET /tires/:id/movements` paginado e
`GET /tires/:id/history` consolidando movimentações + recapagens +
inspeções + descarte numa timeline única.

## 4. Recapagem e manutenção do pneu

Sem alteração -- `TireRetread` já permite múltiplas recapagens por pneu,
com custo, empresa, data, garantia opcional, e atualiza `Tire.status =
RETREADED` automaticamente.

**Decisão deliberada de não implementar** um fluxo "enviar para manutenção
→ retornar" separado (pedido na seção 8/15): a recapagem já cobre
integralmente "pneu → manutenção/recapagem → custo" como evento pontual
registrado após a conclusão. Adicionar um sub-estado "pendente"/"em
andamento" exigiria uma nova máquina de estados e uma migration -- fora do
"mínimo necessário" desta fase, e o pedido explicitamente veda "criar um
ERP de oficina". As ações de instalar/retirar/transferir/recapar/
inspecionar/descartar continuam disponíveis integralmente em
`/tires/[id]` (nunca duplicadas em outra tela).

## 5. Posições do veículo

`Tire.position` continua sendo **texto livre** (nunca um enum de eixo/
lado). **Decisão deliberada**: o pedido pede "estrutura mínima... eixo;
lado; posição" apenas *"se não existir"* -- o campo `position` já
representa isso de forma flexível (ex.: `"Tração 1"`, `"Dianteiro
Esquerdo"`), e é a mesma estrutura usada desde a Fase 20 em produção,
com dados reais já cadastrados. Migrar para um enum estruturado exigiria:
(a) uma migration com mapeamento de todo o histórico textual existente,
(b) alterar `assertPositionAvailable`, os DTOs e o frontend, (c) risco real
de perder/deturpar posições já cadastradas com grafias variadas. A seção
25 pede "não fazer refatoração arquitetural ampla" -- este seria exatamente
esse tipo de refatoração, sem um requisito de negócio explícito que a
justifique além do texto livre já existente.

**Confirmado explicitamente que `Tire.position` NUNCA deve ser confundido
com `AxleConfiguration`/`AxleEvent`** (domínio de pedágio por eixo em
viagem, Fase 14/23, ligado a `TripComposition`/`Trip`/`TollPlaza`) -- são
estruturas completamente diferentes, sem nenhuma referência cruzada no
schema, e a Fase 64 não criou nenhuma.

## 6. Controle de desgaste

Sem alteração dos indicadores já existentes (`currentTreadDepthMm`,
`initialTreadDepthMm`, `wearPercentRemaining` = leitura direta, nunca
estimado). Nada foi inventado -- profundidade de sulco só aparece quando
há inspeção registrada.

## 7. Indicadores de vida útil por pneu (NOVO)

`GET /tires/:id` agora retorna `lifecycle: TireLifecycleEntity | null`
(populado **somente** aqui -- nunca em `GET /tires`, listagem paginada,
para não introduzir N+1 real):

- `totalCost`: `purchasePrice + soma(TireRetread.cost)`.
- `interventionsCount`: `count(TireRetread) + count(TireInspection)`.
- `daysInstalled`: dias corridos desde a movimentação mais recente que
  trouxe o pneu para a localização atual -- `null` quando o pneu está em
  estoque ou nunca foi movimentado (nunca `0` mascarando ausência).
- `costPerKm`: baseado na maior e menor leitura de `TireMovement.odometerKm`
  **já registradas** para aquele pneu (nunca uma distância estimada) --
  `{value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS'}`
  com menos de 2 leituras distintas, mesmo padrão já estabelecido em
  `FleetMaintenanceCostPerKmEntity`/`FleetFuelCostPerKmEntity`.

**Fase 110 -- indicadores por distância vs. vida útil esperada (NOVO)**:
`Tire.expectedLifespanKm` (campo já existente no cadastro desde a Fase
20/64) nunca era comparado contra o uso real até esta fase. Agora:

- `distanceTraveledSinceInstallKm`: `Vehicle.odometerKm` atual −
  `odometerKm` da movimentação que trouxe o pneu para a posição atual. Só
  calculado com o pneu **atualmente montado em VEÍCULO** (carreta não tem
  odômetro no schema) e com as duas leituras disponíveis; `null` quando a
  leitura atual é menor que a de instalação (dado inconsistente -- nunca
  mostra km negativo).
- `remainingLifespanKm`: `expectedLifespanKm − distanceTraveledSinceInstallKm`.
  Pode ser **negativo** (pneu já rodou além do esperado) -- isso é
  informação válida, não um erro.
- `lifespanUsedPercent`: `distanceTraveledSinceInstallKm / expectedLifespanKm
  × 100`. Pode passar de 100.

Todos os 3 ficam `null` sem `expectedLifespanKm` cadastrado ou sem as
leituras necessárias -- nunca estimados/inventados. Exibidos em
`/tires/[id]` junto aos indicadores existentes.

Cálculo extraído para funções puras testáveis:
`apps/api/src/tires/utils/tire-lifecycle.util.ts` (`computeTireLifecycle`
delega a `computeTireDistanceLifespan`, reaproveitada **integralmente**
pelo coletor de notificações e pelo dashboard de frota -- ver
`docs/notifications.md` seção 14 e `docs/fleet-operations-dashboard.md`;
15 casos de teste unitário no total).

Performance: **nenhuma query nova** em `TiresService.findOne` -- `Vehicle`
já vinha incluído (`TIRE_INCLUDE.vehicle`) e a movimentação de instalação
mais recente já era buscada para `daysInstalled`; só passou a também
selecionar `odometerKm`.

## 8. Overview do veículo (NOVO)

`GET /vehicles/:id/overview` (`VehicleOverviewService`, Fase 62/63) ganhou:

- `tires: VehicleTireSummaryEntity[]` -- pneus **atualmente montados**
  neste veículo (`status != SCRAPPED`), com posição, identificação,
  fabricante/modelo, status, sulco atual e data de instalação. 2 queries
  adicionais, sempre bounded a um veículo (nunca por pneu).
- `metrics.tiresCount` / `metrics.tiresNearReplacement`.
- Alerta `VEHICLE_TIRE_NEAR_REPLACEMENT` (severidade ATTENTION) quando
  `tiresNearReplacement > 0`, mesmo limiar (`NEAR_REPLACEMENT_THRESHOLD_MM
  = 3mm`) já usado em `TIRE_NEAR_REPLACEMENT` (dashboard de frota),
  reaproveitado via `import`, nunca duplicado.

Frontend: nova aba **"Pneus"** em `/vehicles/[id]`, listando os pneus
montados (posição, identificação, fabricante/modelo, sulco, instalado
desde, status) com link para o detalhe completo do pneu em `/tires/[id]`,
onde todas as ações (instalar/retirar/transferir/recapar/inspecionar/
descartar) já existem -- **decisão deliberada de não duplicar os 5 modais
de ação dentro da página do veículo**, evitando refatoração ampla e dois
lugares diferentes fazendo a mesma coisa.

## 9. Integração com manutenção -- fechado na Fase 109

**Até a Fase 108**: não existia `tireId` em `VehicleMaintenance`, nem
`maintenanceId`/`vehicleMaintenanceId` em `Tire`/`TireMovement`/
`TireRetread`. O enum `MaintenanceComponent` tem o valor `TIRES`, mas era
só uma categoria textual (sem FK real para um pneu específico).

**Fase 109** -- fechado com a MESMA decisão de modelagem já usada por
`PartStockMovement.maintenanceId` (Fase 83, "peças consumidas por uma OS"):
`TireMovement` ganhou um `maintenanceId` **opcional** (migration
exclusivamente aditiva -- coluna nullable + índice + FK
`ON DELETE SET NULL`, `20260909000000_tire_movement_maintenance_link`),
respondendo a pergunta que a Fase 64 tinha deixado em aberto ("uma
manutenção pode envolver múltiplos pneus? como registrar isso?") do mesmo
jeito que peças já respondem: múltiplas linhas de `TireMovement`, cada uma
com o mesmo `maintenanceId` -- nunca uma segunda máquina de estados
"pneu em manutenção" (a decisão da Fase 64 de não criar um sub-estado
"enviado para manutenção/retornou" continua válida, ver seção 4).

- `POST /tires/:id/movements` aceita `maintenanceId` opcional (validado
  contra o tenant, mesmo padrão de `PartsService.assertPartsBelongToTenant`
  -- só existência, sem checagem cruzada de veículo).
- `TireMovementEntity` ganhou `maintenanceId`/`maintenanceServiceOrderNumber`
  (rótulo denormalizado, mesmo padrão de `FuelSupplyEntity.tripLabel`,
  Fase 107) -- visível na aba "Movimentações" do pneu (`/tires/[id]`) e no
  histórico consolidado (`GET /tires/:id/history`, descrição ganha o
  sufixo `(OS ...)`).
- `MaintenanceEntity` ganhou `tireMovements: MaintenanceTireMovementEntity[]`,
  populado **somente** em `GET /maintenances/:id` (nunca em `findAll`,
  mesmo princípio de `TireEntity.lifecycle`/Fase 64 -- 1 query adicional
  bounded a UMA OS, nunca N+1) -- visível como card "Pneus" na tela da OS
  (`/maintenances/[id]`) quando há pelo menos uma movimentação vinculada.
- **Nenhum novo endpoint cross-pneu** foi criado -- reaproveita
  integralmente `GET /maintenances/:id` já existente, mesmo espírito de
  "reutilize o que já existe" desde a Fase 64.

Conforme a seção 12 do pedido original (Fase 64): quando um pneu está em
manutenção/recapagem, `Vehicle.status` **nunca** é alterado por isso -- só
`VehicleMaintenance` com status `IN_PROGRESS` controla a indisponibilidade
do veículo (regra da Fase 63, preservada sem alteração nesta fase também).
O vínculo `maintenanceId` é puramente de **rastreabilidade** -- não altera
`totalCost`/`partsCost` da OS nem o custo do pneu (`Tire.purchasePrice`/
`TireRetread.cost` continuam a única fonte de custo de pneu, ver seção 11 e
`docs/cost-per-km.md`) -- **sem dupla contagem**, conforme exigido.

## 10. Integração com viagem

Sem alteração -- `AxleConfiguration`/`TripComposition`/regras de pedágio
não foram tocadas. Nenhum histórico de pneu foi inventado a partir de dados
de viagem.

## 11. Dashboard de pneus (evoluído)

`GET /fleet-operations/tires` (`FleetTiresOverviewEntity`) ganhou, sem
nenhuma query adicional (calculados a partir dos mesmos dados já buscados
para os indicadores existentes):

- `byPosition: FleetTirePositionBreakdownEntity[]` -- agrupamento por
  `Tire.position` (texto livre), **só pneus atualmente montados em
  veículo** (mesmo escopo já usado por `byFleet`/`topVehiclesByTireCost` --
  pneus em carreta não têm frota associada de forma direta).
- `averageCostPerTire: number | null` -- `(investedValue + retreadValue) /
  totalTires`, `null` quando `totalTires = 0` (nunca dividir por zero).

`GET /tires/dashboard` (o dashboard simples, sem filtros) **não foi
alterado** -- os dois indicadores novos só fazem sentido no dashboard com
filtros (`/operations/fleet/tires`), que é o que a seção 14 do pedido
efetivamente evolui.

**Fase 110** -- `nearReplacementCount`/alerta `TIRE_NEAR_REPLACEMENT` deste
mesmo dashboard passaram a também contar/alertar pneus próximos da troca
**por distância percorrida** (não só por sulco), reaproveitando a mesma
`computeTireDistanceLifespan` da seção 7 -- adiciona 1 query em lote
(movimentações de instalação dos pneus elegíveis), ainda bounded e sem
N+1 (verificado por teste de contagem de queries). Ver
`docs/fleet-operations-dashboard.md` para o detalhe completo.

## 12. Alertas

`FleetAlertType` ganhou `VEHICLE_TIRE_NEAR_REPLACEMENT` (ver seção 8).
`TIRE_NEAR_REPLACEMENT` (nível de frota) **passou a também considerar
distância percorrida a partir da Fase 110** (ver seção 11) -- mesmo tipo de
alerta, sem enum novo. Nenhum alerta "posição sem pneu" foi criado --
exigiria saber a configuração esperada de eixos do veículo, que não existe
no sistema (ver seção 5); inventar isso violaria a regra "nunca inventar
dados".

## 13. API

Nenhum endpoint novo. Todos os endpoints pedidos na seção 16
(`GET/POST /tires`, `GET/PATCH /tires/:id`, `GET /tires/:id/history`,
`GET /vehicles/:id/tires`, dashboard) já existiam com nomenclatura
equivalente ou superior (o pedido sugeria `POST /vehicles/:id/tires/
install|remove|transfer`; o sistema já usa um único endpoint mais simples,
`POST /tires/:id/movements`, cobrindo os três fluxos):

| Pedido | Real (já existente) |
|---|---|
| `GET/POST /tires`, `GET/PATCH /tires/:id` | idêntico |
| `GET /tires/:id/history` | idêntico |
| `GET /vehicles/:id/tires` | `GET /tires?vehicleId=` (equivalente) + `GET /vehicles/:id/overview.tires` (novo, Fase 64) |
| `POST /vehicles/:id/tires/install\|remove\|transfer` | `POST /tires/:id/movements` (um único endpoint genérico, já cobre os 3 fluxos) |
| `GET /tires/dashboard` | idêntico + `GET /fleet-operations/tires` (com filtros) |

## 14. RBAC / multi-tenant / limites de plano

Sem alteração -- `TiresController` já usa `@RequireModule(TenantModule.TIRES)`
+ `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` (os mesmos de vehicles/
maintenances), `TenantGuard`/`RolesGuard`/`RequireModuleGuard` preservados.
Confirmado: **não existe `maxTires`** no `TenantPlan` (só `maxUsers`/
`maxVehicles`/`maxDrivers`/`maxStorageMb`) -- não foi criado nenhum limite
novo.

## 15. Auditoria

Reaproveita `AuditService` integralmente -- `tire.created`, `tire.updated`,
`tire.deleted`, `tire.moved`, `tire.retread_registered`, `tire.inspected`,
`tire.disposed` já existiam e não foram alterados.

## 16. Performance / N+1

- `GET /tires`: sem alteração -- continua 2 queries fixas (findMany +
  count), independente do número de pneus.
- `GET /tires/:id`: 4 queries fixas (era 1, ganhou 3 para o `lifecycle`),
  bounded a UM pneu -- nunca escala com o histórico dele nem com o
  tamanho da frota.
- `GET /vehicles/:id/overview`: 2 queries adicionais (pneus montados +
  movimentação mais recente de cada um), bounded a UM veículo -- endpoint
  de entidade única, sem risco de N+1 por natureza (não é uma listagem).
- `GET /fleet-operations/tires`: **zero queries adicionais** -- `byPosition`
  e `averageCostPerTire` são calculados a partir dos mesmos dados já
  buscados para `byStatus`/`investedValue`/`retreadValue`. O teste de N+1
  já existente (`fleet-operations-tires.e2e-spec.ts`, 10→50 pneus) continua
  verde.

## 17. Testes

- **Unitários** (novo): `apps/api/src/tires/utils/tire-lifecycle.util.spec.ts`
  -- 9 casos (totalCost com/sem purchasePrice, interventionsCount,
  daysInstalled em estoque/nunca movimentado/calculado, costPerKm
  indisponível/disponível).
- **E2E** (novo): `apps/api/test/tire-vehicle-integration.e2e-spec.ts` -- 8
  casos: overview mostra pneus montados + contagem + alerta; pneu
  descartado nunca aparece no overview; lifecycle (custo, intervenções,
  dias instalado, custo/km disponível e indisponível); listagem nunca
  calcula lifecycle; dashboard byPosition + averageCostPerTire; dashboard
  vazio nunca divide por zero.
- **Regressão confirmada verde**: `tire-management.e2e-spec.ts` (26 casos,
  junto com `fleet-operations-tires.e2e-spec.ts`), `vehicle-management.e2e-spec.ts`
  (20), `maintenance-vehicle-integration.e2e-spec.ts` (9), suíte completa
  de testes unitários da API, suíte completa do admin-web (vitest).

## 18. Limitações reais

- ~~Sem vínculo relacional pneu ↔ manutenção do veículo~~ -- **fechado na
  Fase 109**, ver seção 9.
- ~~Sem atomicidade real em `createMovement`~~ -- **fechado na Fase 109**,
  ver seção 2.
- ~~`TireMovement.odometerKm` nunca propagava para `Vehicle.odometerKm`~~ --
  **fechado na Fase 110**, ver seção 2.
- ~~`Tire.expectedLifespanKm` nunca era comparado contra o uso real~~ --
  **fechado na Fase 110**, ver seção 7.
- `Tire.position` continua texto livre, sem taxonomia de eixo/lado (seção
  5) -- decisão deliberada de não migrar dado real já cadastrado sem
  requisito de negócio explícito.
- `byPosition`/`topVehiclesByTireCost` só consideram pneus atualmente
  montados em **veículo** (nunca carreta) -- mesma limitação já documentada
  desde antes desta fase para `byFleet`.
- Não existe fluxo "enviar para manutenção → retornar" distinto da
  recapagem (seção 4/8) -- decisão deliberada, ver seção 4; o vínculo
  `maintenanceId` (Fase 109) é rastreabilidade sobre o evento pontual já
  existente (movimentação/recapagem), não um novo sub-estado.
- `costPerKm` por pneu depende de `TireMovement.odometerKm` ter sido
  preenchido em pelo menos 2 movimentações -- campo opcional, nem toda
  movimentação registrada historicamente tem esse dado.
- `maintenanceId` valida só existência no tenant, sem checar se o veículo
  da OS é o mesmo veículo da movimentação -- decisão deliberada (a OS pode
  legitimamente ser de um veículo relacionado, ex.: cavalo vs. carreta da
  mesma composição), mesmo princípio já usado para `MaintenancePartInputDto.partId`.
- **Decisão deliberada (Fase 110)**: `createMovement` não bloqueia
  movimentação de pneu enquanto o veículo está em viagem ativa (`Trip`
  `IN_PROGRESS`) -- bloquear isso impediria uma troca legítima de pneu
  furado na estrada (o cenário operacional mais comum de troca fora da
  base). Nenhum requisito explícito do pedido pede esse bloqueio; a
  consistência entre pneus instalados/removidos/transferidos já é garantida
  pela atomicidade `SERIALIZABLE` da Fase 109 (seção 2), independente do
  estado da viagem.

## 19. Pendências reais

Nenhuma pendência de escopo conhecida ao final da Fase 110 para o pedido
avaliado.

## 20. Fase 109 -- auditoria prévia e testes

Antes de qualquer código, todo o módulo (`Tire`/`TireMovement`/
`TireRetread`/`TireInspection`/`TireDisposal`, `TiresService`, os dois
dashboards, o frontend completo) foi reauditado a partir desta própria
documentação (Fase 64) -- confirmado que **praticamente tudo pedido já
existia**: posição/localização, instalação/remoção/transferência,
histórico completo, quilometragem, desgaste, indicadores por veículo/frota,
integração com custo/km (`docs/cost-per-km.md`, linha "Pneus"), alertas
(`TIRE_NEAR_REPLACEMENT`, já ligado ao Centro de Notificações desde a Fase
69 -- `NotificationsService.collectTireNearReplacement`) e visão
operacional no veículo (`/vehicles/[id]`, aba "Pneus"). Só 2 gaps reais
foram encontrados e fechados (seções 2 e 9); nenhuma estrutura de estoque
de pneus paralela foi criada (o "estoque" de pneu já é o próprio
`TireLocationType.STOCK`, reaproveitado como sempre); nenhum ledger
financeiro novo; nenhuma regra financeira alterada.

- **E2E** (`tire-management.e2e-spec.ts`, estendido): +4 casos --
  concorrência real (duas requisições simultâneas para a mesma posição via
  `Promise.all`, não apenas sequenciais), vínculo de movimentação com OS
  (aparece em `GET /maintenances/:id`), movimentação sem `maintenanceId`
  nunca aparece em nenhuma OS (regressão), `maintenanceId`
  inexistente/de outro tenant rejeitado (404). Suíte completa: 19/19.
- **Regressão confirmada verde**: `fleet-operations-tires.e2e-spec.ts`,
  `tire-vehicle-integration.e2e-spec.ts`, `maintenances.e2e-spec.ts`,
  `work-orders.e2e-spec.ts`, `fleet-maintenance.e2e-spec.ts` (73 casos).
- **Frontend** (novo): `create-movement-modal.test.tsx` (2 testes -- envio
  condicional de `maintenanceId`), `maintenances/[id]/page.test.tsx` (+2 --
  card "Pneus" aparece/some conforme `tireMovements`).

## 21. Fase 110 -- auditoria prévia e testes

Módulo reauditado especificamente contra o que a Fase 109 (recém-concluída)
**não** cobria -- evitando reimplementar qualquer coisa. Confirmado por
leitura de código (não só desta documentação) que: (a) `TireMovement.odometerKm`
nunca era propagado para `Vehicle.odometerKm` (grep por
`assertOdometerNotBelowVehicle`/`computeBumpedOdometer` em `tires.service.ts`
não retornava nenhum resultado antes desta fase, apesar do padrão já existir
em `FuelSuppliesService` desde a Fase 18/27); (b) `Tire.expectedLifespanKm`
nunca era comparado contra `TireMovement.odometerKm`/`Vehicle.odometerKm`
(leitura completa de `tire-lifecycle.util.ts`). Só esses 2 gaps reais foram
encontrados e fechados (seções 2 e 7), com efeito propagado para o Centro de
Notificações (`docs/notifications.md` seção 14) e o dashboard de frota
(`docs/fleet-operations-dashboard.md`) -- reaproveitando a mesma fórmula em
todos os 3 pontos (`computeTireDistanceLifespan`), nunca uma segunda regra.
Nenhuma estrutura de estoque/ledger financeiro nova; nenhuma regra
financeira alterada; nenhuma migration (nenhum campo novo era necessário --
`Tire.expectedLifespanKm`/`Vehicle.odometerKm`/`TireMovement.odometerKm` já
existiam todos).

- **Unitário** (`tire-lifecycle.util.spec.ts`, estendido): 15 casos no
  total (+7 -- `computeTireDistanceLifespan` extraída e testada
  isoladamente: sem veículo montado, sem uma das 2 leituras, leitura atual
  menor que a de instalação, cálculo normal, sem `expectedLifespanKm`,
  cálculo de `remainingLifespanKm`/`lifespanUsedPercent`, valor negativo
  quando já passou da vida útil esperada).
- **E2E** (`tire-vehicle-integration.e2e-spec.ts`, estendido): +8 casos --
  bump de odômetro na instalação/remoção, rejeição de `odometerKm` menor
  que o atual do veículo, nenhuma alteração sem `odometerKm` (regressão),
  nenhuma tentativa de alterar odômetro em movimentação estoque↔carreta,
  indicadores de distância/vida útil (indisponível, calculado, `null` em
  carreta). Suíte completa: 16/16.
- **E2E** (`notifications.e2e-spec.ts`, estendido): +3 casos --
  `collectTireLifespanNearReplacement` gera `TIRE_NEAR_REPLACEMENT` com
  `entityType='TireLifespan'` quando ≥90% da vida útil, nunca gera abaixo do
  limiar, nunca gera sem `expectedLifespanKm` cadastrado. Suíte completa:
  30/30.
- **E2E** (`fleet-operations-tires.e2e-spec.ts`, estendido): +2 casos --
  `nearReplacementCount`/`tireAlerts` também reagem à distância percorrida,
  nunca contam pneu sem `expectedLifespanKm`/abaixo do limiar. Suíte
  completa: 13/13 (inclui o teste de ausência de N+1 já existente,
  confirmado verde com a nova query em lote).
- **Regressão confirmada verde**: `tire-management.e2e-spec.ts` (19/19,
  isolado -- falha isolada observada rodando em paralelo com outra suíte
  pesada foi resource contention, não regressão, confirmada reexecutando
  sozinho), `maintenances.e2e-spec.ts` + `maintenance-vehicle-integration.e2e-spec.ts`
  (24/24), `fleet-maintenance.e2e-spec.ts` + `work-orders.e2e-spec.ts`
  (39/39), `maintenance-providers.e2e-spec.ts` + `cost-per-km.e2e-spec.ts`
  (17/17), `trips.e2e-spec.ts` (27/27, nenhum código de viagem foi tocado
  nesta fase -- checagem de sanidade).
- **Frontend** (novo): `tires/[id]/page.test.tsx` (2 testes -- indicadores
  de distância/vida útil exibidos como "Indisponível" ou calculados).
