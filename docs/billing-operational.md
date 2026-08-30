# Faturamento Operacional e Conciliação Comercial (Fase 60, evoluído na Fase 103)

Camada de faturamento que conecta Operação → Contrato/Frete (Fase 59) →
Viagem → Receita (Fase 51) → Financeiro, sem emissão fiscal, sem consulta
SEFAZ, sem certificado digital, sem gateway de pagamento (Stripe/PIX/
débito automático) e sem alterar nenhuma regra das Fases 52-59.

## 1. Escopo

| Recurso | Status |
|---|---|
| Visão de faturamento/conciliação da viagem (contratado → calculado → faturado → recebido → saldo) | ✅ |
| Estados DRAFT/READY/PARTIALLY_INVOICED/INVOICED/PAID/CANCELLED | ✅ |
| Faturamento total e parcial, saldo calculado no backend | ✅ |
| Geração de receita idempotente (reaproveita TripRevenuesService.create) | ✅ |
| Cancelamento (bloqueia novos lançamentos, preserva histórico) | ✅ |
| Dashboard (`/operations/fleet/billing`) | ✅ |
| Seção "Faturamento" no detalhe do cliente (Fase 59) | ✅ |
| Seção "Faturamento" na aba Comercial da viagem (Fase 59) | ✅ |
| Descoberta de viagens elegíveis para faturamento (Fase 103) | ✅ |
| Competência financeira / `FinancialPeriodGuard` no faturamento (Fase 103) | ✅ |
| Snapshot congelado de `billableAmount` após o 1º lançamento (Fase 103) | ✅ |
| Emissão de CT-e/NF-e/MDF-e, consulta SEFAZ, certificado digital | ❌ fora de escopo |
| Stripe, PIX, débito automático, qualquer gateway de pagamento | ❌ fora de escopo |
| Faturamento em lote (bulk) | ❌ fora de escopo (Fase 103) |

## 2. Modelagem (migration aditiva, sem alterar tabelas existentes)

Auditoria prévia confirmou que **nenhuma estrutura existente** cobria
faturamento parcial/total com histórico auditável — `TripFreight.revenueId`
(Fase 59) só suporta um único lançamento de valor cheio, incompatível com
faturamento parcial. Por isso, 1 enum + 2 models novos, mesmo espírito de
`TenantSubscription`/`SubscriptionPayment` (Fase 50 — container mutável +
ledger imutável):

- **`TripBilling`** — container de faturamento, 1:1 com `Trip` (mesmo
  padrão de `TripFreight`/`TripSettlement`). `billableAmount` é lido do
  snapshot já gravado em `TripFreight` (`contractedAmount` →
  `finalAmount` → `estimatedAmount`, mesma prioridade já usada por
  `FreightPricingService.applyRevenue`, Fase 59) — nunca recalculado pelo
  motor de frete. **Desde a Fase 103**, essa leitura só acontece na
  **primeira** vez que um faturamento é iniciado para a viagem; a partir
  daí `billableAmount` fica congelado no valor já persistido, mesmo que
  `PATCH /freight/trips/:tripId` edite `contractedAmount`/`finalAmount`
  depois (ver seção 5.1). `invoicedAmount` é a soma das `TripBillingEntry`,
  nunca editado diretamente.
- **`TripBillingEntry`** — lançamento **imutável** (ledger append-only,
  mesmo espírito de `SubscriptionPayment`): nenhum endpoint de
  update/delete existe. Cada entrada gera exatamente 1 `TripRevenue`
  (`revenueId` `@unique`).

Nenhuma coluna foi adicionada a `Trip`/`TripFreight`/`TripRevenue` além de
relations 1:1 opcionais (`Trip.billing`, `TripRevenue.billingEntry`).
`@RequireModule` reaproveita `TenantModule.FREIGHT` já existente (Fase 59)
— nenhum novo valor de enum de módulo foi necessário.

## 3. Estados (`TripBillingStatus`)

| Status | Quando |
|---|---|
| `DRAFT` | Sem valor faturável ainda (`TripFreight` ausente ou sem valor). |
| `READY` | Valor faturável disponível, nada faturado ainda (`invoicedAmount = 0`). |
| `PARTIALLY_INVOICED` | `0 < invoicedAmount < billableAmount`. |
| `INVOICED` | `invoicedAmount >= billableAmount` (saldo zerado). |
| `PAID` | Confirmação **manual** de recebimento — nunca inferida automaticamente (sem gateway de pagamento nesta fase). Só pode ser setada quando já há algo faturado. |
| `CANCELLED` | Bloqueia qualquer novo lançamento; entradas/receitas já geradas nunca são apagadas. |

`DRAFT`/`READY`/`PARTIALLY_INVOICED`/`INVOICED` são sempre **derivados**
dos valores (`computeBillingStatusFromAmounts`, função pura testada
isoladamente) — nunca setados manualmente. `PAID`/`CANCELLED` são sempre
transições manuais explícitas, cada uma com seu próprio endpoint/guarda.

**Nota (Fase 103)**: pedidos posteriores que mencionem um catálogo
`DRAFT`/`ISSUED`/`CANCELLED` referem-se semanticamente a este mesmo
catálogo — `INVOICED` (saldo zerado) e `PARTIALLY_INVOICED` (parte já
faturada) já representam o momento em que o valor é reconhecido como
receita ("emitido"). Não existe nenhuma etapa formal adicional de emissão
fiscal por faturamento (sem integração com NF-e/CT-e); renomear o enum
quebraria a Fase 60/72 inteira já em produção, então o catálogo existente
foi mantido sem alteração.

## 4. Cálculo (reaproveita integralmente o motor da Fase 59)

O motor de cálculo comercial (`freight-calculation.util.ts`) **nunca é
reexecutado** neste módulo. `billableAmount` é lido diretamente do
snapshot já gravado em `TripFreight` no momento de cada consulta/ação —
revisar uma regra comercial depois (Fase 59, `POST
/freight/rules/:id/revise`) nunca recalcula um faturamento já feito
(testado explicitamente em `billing-operational.e2e-spec.ts`).

Funções puras (`billing-status.util.ts`, 17 testes unitários):
- `computeBillingStatusFromAmounts(billableAmount, invoicedAmount)`
- `computeBillingBalance(billableAmount, invoicedAmount)` — nunca negativo.
- `resolveInvoiceAmount(requestedAmount, balance)` — resolve o valor a
  faturar (total quando omitido, parcial quando informado), bloqueando
  excesso (`EXCEEDS_BALANCE`), valor inválido (`INVALID_AMOUNT`) e
  ausência de saldo (`NO_BALANCE`, garante idempotência).

## 5. Geração de receita e idempotência

`POST /operational-billing/trips/:tripId/invoice` reaproveita
**integralmente** `TripRevenuesService.create()` — nenhuma lógica de
criação de receita duplicada. Sequência: (1) resolve o valor a faturar via
`resolveInvoiceAmount`; (2) cria a `TripRevenue` via
`TripRevenuesService.create` (mesma auditoria própria daquele serviço,
`trip_revenue.created`); (3) numa transação Prisma, cria/atualiza o
`TripBilling` e cria a `TripBillingEntry` referenciando a receita.

**Idempotência**: uma vez que o saldo chega a zero, `resolveInvoiceAmount`
retorna `NO_BALANCE` e a ação é bloqueada com 409 — qualquer nova
tentativa (retry, duplo clique) nunca gera uma segunda receita para o
mesmo saldo. Testado explicitamente (`billing-operational.e2e-spec.ts`,
"segunda tentativa duplicada").

**Guarda mínima no endpoint antigo da Fase 59**: `POST
/freight/trips/:tripId/apply-revenue` (Fase 59, só sabe faturar o valor
cheio de uma vez) agora verifica se já existe um `TripBilling` para a
viagem — se existir, bloqueia com 409 orientando a usar o faturamento
operacional. Esta é a **única** alteração em código da Fase 59 (3 linhas
adicionadas, nenhuma removida) — necessária para nunca permitir que os
dois caminhos de geração de receita (Fase 59 de valor cheio + Fase 60
parcial/total) dupliquem ou ultrapassem o valor faturável da mesma
viagem. Nenhum teste pré-existente da Fase 59 é afetado (a guarda só
dispara quando um `TripBilling` já existe, o que nenhum teste da Fase 59
provoca).

### 5.1 Competência financeira (`FinancialPeriodGuard`, Fase 103)

Auditoria da Fase 103 encontrou uma lacuna real: `invoice()` gerava a
`TripRevenue` sem passar por `FinancialPeriodGuardService`
(Fases 76/79), ao contrário de `ReceivablesService`/`PayablesService`/
`FinancialTransactionsService`/`BankTransactionsService`, que já protegem
toda mutação com data financeira desde a Fase 76. Um período fechado não
impedia a geração de nova receita via faturamento operacional.

Corrigido: `TripBillingService.invoice()` agora chama
`periodGuard.assertPeriodOpenForDate(tenantId, financialDate)` — usando a
mesma data (`financialDate = new Date()`) gravada como `receivedAt` da
`TripRevenue` — **antes** de qualquer escrita. Período `CLOSED` bloqueia
com 409 (nenhum `TripBilling`/`TripRevenue` é criado); período inexistente
ou `OPEN` permite normalmente (mesma regra de Fase 76: "período inexistente
= operação permitida"). `FinancialPeriodGuardModule` foi importado em
`BillingOperationalModule` exatamente como já é feito em
`ReceivablesModule`/`PayablesModule` — nenhuma lógica de guarda
duplicada.

## 6. Faturamento parcial

`POST .../invoice` com `amount` no corpo fatura parcialmente; omitido,
fatura o saldo inteiro (total). Regras aplicadas sempre no backend
(`resolveInvoiceAmount`): valor nunca ultrapassa o saldo faturável, nunca
zero/negativo. Múltiplos lançamentos parciais são permitidos até o saldo
zerar, cada um gerando sua própria `TripBillingEntry` + `TripRevenue`
distintas — nenhuma delas é apagada/alterada depois (histórico completo
sempre visível na aba Comercial da viagem).

### 6.1 Snapshot do valor faturável (Fase 103)

Antes desta fase, `invoice()` recalculava `billableAmount` a partir de
`TripFreight` **a cada chamada**, inclusive em faturamentos parciais
subsequentes — sobrescrevendo o valor já persistido. Como
`PATCH /freight/trips/:tripId` permite edição humana de
`contractedAmount`/`finalAmount` **depois** de aplicado (edição direta,
distinta de revisar uma regra/tabela — ver seção 4), um faturamento
parcial em andamento podia ter seu valor total silenciosamente alterado
por uma edição posterior. Isso também divergia de `GET
/operational-billing/trips/:tripId`, que **já** exibia o valor
**persistido** (nunca recalculado) quando havia um `TripBilling` — ou
seja, a tela mostrava um valor "congelado" que a próxima ação de
faturar, na prática, não respeitava.

Corrigido: `billableAmount` só é lido de `TripFreight` quando ainda **não
existe** nenhum `TripBilling` para a viagem (primeiro lançamento). A
partir daí, todo faturamento subsequente reaproveita o valor já
persistido. Os campos informativos `contractedAmount`/`calculatedAmount`
exibidos ao lado do faturável **continuam** sempre lidos ao vivo de
`TripFreight` (propositalmente, para permitir comparar "o que está
contratado hoje" com "o que foi de fato faturado") — só o valor
efetivamente usado no cálculo de saldo é congelado.

## 7. Conciliação

`GET /operational-billing/trips/:tripId` (nunca 404 quando a viagem
existe — retorna um preview ao vivo quando nenhum faturamento foi
iniciado, mesmo espírito de `TripSettlementsService.getSettlement`)
expõe a visão completa: `contractedAmount` (TripFreight) →
`calculatedAmount` (TripFreight.estimatedAmount) → `billableAmount` →
`invoicedAmount` → `receivedAmount` → `balance`.

**Limitação real declarada**: `receivedAmount` é **sempre igual** a
`invoicedAmount`. O projeto não tem nenhuma integração de gateway de
pagamento/PIX/débito automático (fora de escopo, seção 18) — não existe
nenhuma fonte de dado que distinga "receita registrada" de "dinheiro
efetivamente recebido na conta". `receivedAmount` existe apenas para
satisfazer a visão de conciliação pedida, documentado explicitamente como
equivalente ao faturado. Nenhum novo mecanismo de pagamento foi criado.

## 8. Dashboard (`GET /operational-billing/dashboard`, `/operations/fleet/billing`)

Filtros: período (`TripBilling.createdAt`), cliente, frota
(`Vehicle.fleetId` via `Trip.composition.vehicle`), veículo
(`Trip.composition.vehicleId`), motorista (`Trip.driverId`), status —
mesmo escopo operacional já usado por `FleetOperationsQueryDto`/
`FindFreightDashboardQueryDto` (Fase 59).

Indicadores: `totalBillable`/`totalInvoiced`/`totalReceived` (= faturado,
seção 7)/`balanceToInvoice`, `readyForInvoicingCount` (viagens com valor
calculado nunca faturadas — inclui as que já têm `TripBilling` `READY` e
as que nunca tiveram nenhum faturamento iniciado),
`partiallyInvoicedCount` (`TripBilling` `PARTIALLY_INVOICED`),
`pendingCount` (soma dos dois anteriores — qualquer faturamento com saldo
em aberto), evolução mensal (reaproveita `aggregateMonthlySeries`,
`common/utils/monthly-series.util.ts`, já usado pela Fase 19), ranking por
cliente/frota/veículo (top 10), margem comercial (`totalInvoiced` menos o
custo realizado das viagens no escopo — `TripExpense` aprovado +
combustível + pedágio, **mesmas fontes** já usadas pelo financeiro/Fase
51/59, nenhum custo recalculado em paralelo).

### 8.1 Performance (sem N+1)

1 `findMany` de `TripBilling` no escopo do filtro (com `trip`/
`composition`/`vehicle`/`fleet` incluídos) + 3 agregações em paralelo
(despesa/combustível/pedágio, escopadas por `tripId IN (...)` do lote já
carregado) + 1 `count` bounded para viagens prontas para faturamento — 5
queries fixas, independente da quantidade de clientes/frotas/veículos.
Testado com 5 vs. 20 faturamentos (`billing-operational.e2e-spec.ts`,
contagem real de queries via `$extends`) — sem crescimento.

### 8.2 Viagens elegíveis para faturamento (`GET /operational-billing/eligible-trips`, Fase 103)

Lacuna real encontrada na auditoria da Fase 103: `GET /operational-billing`
(seção 8) só lista viagens que **já têm** um `TripBilling` persistido —
não existia nenhuma forma de descobrir viagens **candidatas** (com valor
comercial calculado e nenhum faturamento iniciado ainda) sem já saber o
`tripId` de antemão. O preview ao vivo de `GET .../trips/:tripId` (seção
7) só funciona para uma viagem por vez, já conhecida.

`BillingListService.findEligibleTrips` consulta `Trip` (nunca
`TripBilling`) com:

- valor comercial calculado (`freight` com `contractedAmount` OU
  `finalAmount` OU `estimatedAmount` não nulo — mesma exigência que já
  bloqueia `invoice()` com 409 quando ausente);
- saldo ainda a faturar: `billing` nulo (nunca faturada) OU
  `billing.status = PARTIALLY_INVOICED` (`INVOICED`/`PAID` já têm saldo
  zero; `CANCELLED` está bloqueado — nenhum dos três é elegível).

**Nunca exige `Trip.status = COMPLETED`** — o faturamento já funciona
independentemente do status da viagem desde a Fase 60 (confirmado pelos
próprios testes desta fase, que faturam viagens `PLANNED`). O filtro
opcional `tripStatus` é só uma conveniência de busca (a UI usa
`COMPLETED` como valor inicial, refletindo a viagem "concluída" que o
fluxo tipicamente fatura, mas o usuário pode limpá-lo).

Filtros adicionais: `customerId`, `fleetId` (via `composition.vehicle`),
`vehicleId`, `driverId` — mesmo escopo operacional das demais listagens
do módulo (seção 8). Resposta paginada reaproveita
`resolveTripFreightBestAmount` e `computeBillingBalance` (seção 4) —
nenhuma fórmula de valor/saldo duplicada. 1 `findMany` (com `select`
aninhado cobrindo cliente/motorista/veículo/frete/faturamento) + 1
`count`, nunca uma consulta por linha (testado 5 vs. 20 viagens
elegíveis).

Frontend: nova aba "Viagens elegíveis" na página
`/operations/fleet/billing` (componente `EligibleTripsPanel`), com os
mesmos filtros e uma ação "Faturar" por linha que reaproveita
integralmente `POST .../trips/:tripId/invoice` (a mesma ação já usada na
aba Comercial da viagem) — nenhuma lógica de faturamento nova no
frontend. Não existe faturamento em lote (bulk): cada linha dispara a
ação individual já existente, evitando um novo mecanismo de transação em
lote paralelo ao já testado desde a Fase 60.

## 9. Integração com a viagem e o cliente

**Aba "Comercial" da viagem** (`features/trips/tabs/billing-section.tsx`,
renderizado dentro de `freight-tab.tsx`, Fase 59 — nenhuma aba nova):
situação do faturamento, valor faturável/faturado/saldo, histórico de
lançamentos, ações "Faturar" (total), "Faturar parcialmente" (modal com
valor), "Marcar como recebido" (PAID) e "Cancelar faturamento"
(`ConfirmDialog` já existente).

**Detalhe do cliente** (`/customers/:id`, Fase 59): seção "Faturamento"
com total faturado, saldo, faturamentos registrados, viagens pendentes e
os 5 últimos faturamentos — reaproveita `GET /operational-billing/
dashboard?customerId=...` e `GET /operational-billing?customerId=...`,
nenhum endpoint novo.

## 10. Permissões

Mesmo grupo operacional já usado pelo módulo Freight (Fase 59):
`SUPER_ADMIN`/`ADMIN`/`MANAGER`/`OPERATOR`/`DISPATCHER` leem e escrevem;
`AUDITOR` só lê; `DRIVER` nunca acessa nenhuma rota (sem fluxo de
faturamento no Driver App). `SUPER_ADMIN` nunca é bloqueado por
`@RequireModule`/RBAC — mesmo comportamento global já garantido pelo
`RolesGuard`/`RequireModuleGuard` em toda a API, não uma exceção criada
por esta fase. Toda mutação relevante é auditada via `AuditService`
(`billing.created`, `billing.updated`, `billing.cancelled`,
`billing.revenue_generated`) — nenhum sistema de auditoria paralelo.

## 11. Segurança e isolamento multi-tenant

`TenantGuard`/`RolesGuard`/`RequireModuleGuard` em ambos os controllers.
Toda consulta é escopada por `tenantId` explicitamente (nunca `findUnique`
sem checar o tenant). Testado explicitamente: viagem de outro tenant
retorna 404 em GET/invoice/cancel; faturamento de um tenant nunca aparece
na listagem/dashboard de outro; tentativa de gerar receita usando uma
viagem de outro tenant é bloqueada pela mesma checagem de posse já usada
em `findTripContext`.

## 12. Testes

- **Unitário** (`billing-status.util.spec.ts`, 17 testes): cálculo de
  saldo (incluindo nunca negativo), transições de status (todas as
  combinações DRAFT/READY/PARTIALLY_INVOICED/INVOICED), resolução de
  valor a faturar (total, parcial, bloqueio de excesso, valor inválido,
  idempotência quando saldo já é zero).
- **E2e** (`billing-operational.e2e-spec.ts`, 18 testes originais da Fase
  60 + **16 novos na Fase 103 = 29 no total**): preview ao vivo sem
  faturamento, faturamento total, faturamento parcial, dois parciais
  somando o total, bloqueio de excesso, idempotência (segunda tentativa
  409, nenhuma receita duplicada), viagem sem `TripFreight` nunca
  faturável, alteração de regra comercial depois nunca recalcula um
  faturamento já feito, `PAID` bloqueado antes de faturar/permitido
  depois, cancelamento preserva entradas e bloqueia novos lançamentos,
  guarda no endpoint antigo da Fase 59, dashboard (totais/ranking/
  contadores), filtros (status/cliente), isolamento multi-tenant
  (cross-tenant em GET/invoice/cancel/listagem), RBAC (DRIVER 403,
  AUDITOR leitura-only, SUPER_ADMIN nunca bloqueado), N+1 do dashboard (5
  vs. 20 faturamentos). **Fase 103**: viagens elegíveis (aparece com
  frete aplicado e sem faturamento; nunca aparece sem frete; continua
  elegível após parcial, some após total; nunca reaparece após
  cancelamento; filtros/paginação; isolamento multi-tenant; RBAC),
  competência financeira (bloqueia 409 com período do mês atual `CLOSED`,
  nenhum `TripBilling`/`TripRevenue` criado; permite com período `OPEN`
  ou inexistente), snapshot (`billableAmount` permanece o mesmo entre
  dois parciais mesmo após editar `TripFreight.contractedAmount` via
  `PATCH` no meio do processo), N+1 de `GET .../eligible-trips` (5 vs. 20
  viagens elegíveis).
- **Regressão (Fase 103)**: suíte completa de `billing-operational.
  e2e-spec.ts` (29/29), `trips.e2e-spec.ts`, `receivables.e2e-spec.ts`,
  `financial-periods.e2e-spec.ts`, `customer-crm.e2e-spec.ts`,
  `quotations.e2e-spec.ts`, `proposals.e2e-spec.ts` e
  `fiscal-documents.e2e-spec.ts` — todos passando sem alteração de
  comportamento pré-existente.
- **Regressão (Fase 60, histórico)**: suíte completa `freight.e2e-spec.ts`
  (19) + `fiscal-documents.e2e-spec.ts` (58) + `billing-operational.
  e2e-spec.ts` (18) = 95/95 passando junto. 545/545 testes unitários da
  API (62 suítes). 200/200 testes do admin-web (34 arquivos) — inclusive
  `fleet-section-tabs.test.tsx`, que já cobria a aba "Faturamento" sem
  precisar de alteração.

## 13. Limitações reais / fora de escopo (declarado)

- Nenhuma emissão fiscal, consulta SEFAZ, certificado digital, Stripe,
  PIX, débito automático ou qualquer gateway de pagamento foi
  implementado — fora de escopo desta fase (seção 18 do pedido).
- `receivedAmount` sempre igual a `invoicedAmount` (seção 7) — o projeto
  não distingue "receita registrada" de "dinheiro recebido" sem uma
  integração de pagamento, que não existe e não foi criada.
- `PAID` é sempre uma confirmação manual — nunca uma automação inferida
  de qualquer fonte de dado.
- Concorrência: `invoice()` faz *check-then-act* (lê o saldo, decide,
  grava numa transação Prisma) — mesmo padrão já aceito no restante do
  projeto (nenhum lock otimista existe em nenhum módulo, incluindo
  `FreightRulesService.revise`, Fase 59). Duas requisições de faturamento
  *verdadeiramente simultâneas* sobre a mesma viagem poderiam, em teoria,
  ambas ler o mesmo saldo antes de uma commitar; nenhuma solução nova de
  concorrência foi criada especificamente para este caso, consistente com
  a tolerância já existente no projeto.
- **(Fase 103)** Sem faturamento em lote (bulk) — a aba "Viagens
  elegíveis" fatura uma viagem por vez, reaproveitando a mesma ação
  individual já existente; nenhum endpoint/transação de faturamento em
  lote foi criado.
- **(Fase 103)** `tripStatus` no filtro de viagens elegíveis é só uma
  conveniência de busca, nunca uma regra de negócio — o backend continua
  aceitando faturar viagens em qualquer status, exatamente como antes
  desta fase.
