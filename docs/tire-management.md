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
| Integração relacional pneu ↔ manutenção (`VehicleMaintenance`) | ❌ (limitação real, ver seção 9) |
| Taxonomia estruturada de eixo/lado | ❌ (decisão deliberada de não criar, ver seção 5) |

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

Cálculo extraído para uma função pura testável:
`apps/api/src/tires/utils/tire-lifecycle.util.ts` (`computeTireLifecycle`,
9 casos de teste unitário).

Performance: 3 queries adicionais fixas em `TiresService.findOne` (agregar
recapagens, contar inspeções, buscar movimentações com odômetro), bounded a
UM pneu -- nunca escalam com o tamanho da frota, e nunca são executadas em
`findAll`.

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

## 9. Integração com manutenção (Fase 63) -- limitação real, não implementada

Reconfirmado: **não existe `tireId` em `VehicleMaintenance`, nem
`maintenanceId`/`vehicleMaintenanceId` em `Tire`/`TireMovement`/
`TireRetread`**. O enum `MaintenanceComponent` tem o valor `TIRES`, mas é
só uma categoria textual (sem FK real para um pneu específico). Criar esse
vínculo relacional exigiria uma migration e uma decisão de modelagem (uma
manutenção pode envolver múltiplos pneus? como registrar isso?) que o
pedido não especifica -- documentado como limitação real, nenhum dado foi
inventado para simular essa integração.

Conforme a seção 12 do pedido: quando um pneu está em manutenção/recapagem,
`Vehicle.status` **nunca** é alterado por isso -- só `VehicleMaintenance`
com status `IN_PROGRESS` controla a indisponibilidade do veículo (regra da
Fase 63, preservada sem alteração).

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

## 12. Alertas

`FleetAlertType` ganhou `VEHICLE_TIRE_NEAR_REPLACEMENT` (ver seção 8).
`TIRE_NEAR_REPLACEMENT` (nível de frota, já existente) não foi alterado.
Nenhum alerta "posição sem pneu" foi criado -- exigiria saber a
configuração esperada de eixos do veículo, que não existe no sistema (ver
seção 5); inventar isso violaria a regra "nunca inventar dados".

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

- Sem vínculo relacional pneu ↔ manutenção do veículo (seção 9) -- exigiria
  decisão de modelagem fora do escopo desta fase.
- `Tire.position` continua texto livre, sem taxonomia de eixo/lado (seção
  5) -- decisão deliberada de não migrar dado real já cadastrado sem
  requisito de negócio explícito.
- `byPosition`/`topVehiclesByTireCost` só consideram pneus atualmente
  montados em **veículo** (nunca carreta) -- mesma limitação já documentada
  desde antes desta fase para `byFleet`.
- Não existe fluxo "enviar para manutenção → retornar" distinto da
  recapagem (seção 4/8) -- decisão deliberada, ver seção 4.
- `costPerKm` por pneu depende de `TireMovement.odometerKm` ter sido
  preenchido em pelo menos 2 movimentações -- campo opcional, nem toda
  movimentação registrada historicamente tem esse dado.

## 19. Pendências reais

Nenhuma pendência de escopo desta fase.
