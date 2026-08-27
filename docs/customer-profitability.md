# Rentabilidade por Cliente (Fase 97)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados `TripSettlementsService` (Fases 51/71 — metodologia de custo real
de viagem), `FreightDashboardService` (Fase 59 — dashboard comercial já filtrável por `customerId`),
`FleetOperationsMetricsService` (Fase 40/41 — `revenueByCustomer`), `docs/trip-financial-result.md` e o
módulo `finance` (Fase 74, `CashFlowService`/`FinanceController` — precedente de "módulo somente
leitura, consolidação sobre dados existentes, sem ledger novo").

### Conclusão da auditoria

- **A metodologia de custo real já existe e é única no projeto**: `TripSettlementsService.
  getFinancialDashboard` (Fases 51/71) define `totalCost = TripExpense(status=APPROVED) +
  FuelSupply.totalAmount + TollTransaction.chargedAmount`, sem incluir manutenção (sem vínculo confiável
  no schema — mesma limitação em toda parte). Esta fase **reaplica exatamente essa fórmula**, nunca uma
  variante.
- **`FreightDashboardService` já calcula `realizedRevenueTotal`/`realizedCostTotal`/`realResultTotal`
  por cliente** (via `customerId` no filtro) — mas esses agregados são **restritos a viagens com
  `TripFreight` aplicado** (`POST /freight/trips/:id/apply`) e o ranking existente (`topCustomers`) só
  ordena por **valor contratado**, nunca por resultado/margem real. Não cobre "ranking por resultado e
  margem" nem inclui viagens sem cotação de frete aplicada — por isso uma consolidação nova, mais
  abrangente, era necessária (não uma duplicação: o dashboard de Frete continua existindo, com seu
  próprio propósito de acompanhar contratos/tabelas).
- **`FleetOperationsMetricsService.revenueByCustomer`** agrupa receita usando `TripRevenue.customerId`
  diretamente (um campo **independente, opcional, editável por fora** — não deriva de `Trip.customerId`).
  Esta fase usa **`Trip.customerId`** como chave de agrupamento para receita, custo e contagem de
  viagens (ver seção 3) — decisão deliberada, documentada abaixo.
- **`FinanceModule`/`CashFlowService`** confirmam o padrão a seguir: módulo 100% leitura, mesmo grupo de
  roles (`FINANCE_READ_ROLES`), nenhuma mutação própria, agregação em memória sobre um lote fixo de
  queries.

### Por que `Trip.customerId`, não `TripRevenue.customerId`

`TripRevenue.customerId` é preenchido livremente no momento do lançamento da receita (ver
`TripRevenuesService.create`) e **pode divergir** do cliente real da viagem (`Trip.customerId`) ou ficar
nulo mesmo quando a viagem tem cliente. Como "quantidade de viagens" e "custo" só podem ser atribuídos
via `Trip.customerId` (nenhum dos modelos de custo tem `customerId` próprio), usar uma chave diferente
para a receita quebraria a consistência entre os três números. Por isso **toda a consolidação usa
`Trip.customerId`** como âncora única — receita, custo e contagem de viagens sempre se referem ao MESMO
conjunto de viagens do cliente. Isso é uma escolha metodológica distinta da já usada em
`FleetOperationsMetricsService` (que é sobre "receita lançada para este cliente", um recorte
propositalmente diferente) — nenhuma das duas está errada, cobrem perguntas diferentes; esta fase
documenta explicitamente qual delas usa.

## 2. Fórmulas (nunca persistidas — sempre calculadas ao vivo)

```
revenue      = SUM(TripRevenue.amount)                                  [viagens do cliente no período]
cost         = SUM(TripExpense.amount WHERE status = APPROVED)
             + SUM(FuelSupply.totalAmount)
             + SUM(TollTransaction.chargedAmount)                       [mesmas viagens]
result       = revenue - cost
marginPercent = (result / revenue) * 100     SE revenue > 0, senão null (nunca 0% mascarando ausência de receita)
tripsCount   = COUNT(Trip WHERE customerId = X AND deletedAt IS NULL [AND plannedDeparture no período])
```

Nenhuma despesa `PENDING`/`REJECTED`/`CANCELLED` entra no custo (mesma regra de
`getFinancialDashboard`). Nenhuma manutenção de veículo é alocada a viagens/clientes (sem vínculo
confiável no schema — mesma limitação documentada em `TripFinancialDashboardEntity.maintenanceCost`).

## 3. Período

`from`/`to` filtram **`Trip.plannedDeparture`** (campo sempre presente em toda viagem, nunca ambíguo
entre "criada em" e "realizada em"). Todas as viagens do cliente com `plannedDeparture` dentro da janela
entram no cálculo — junto com toda a receita/custo real vinculado a essas viagens (independente da data
da própria receita/despesa/abastecimento/pedágio).

## 4. Nenhum dado de Receivable/Payable/FinancialAccount/CashFlow

Deliberado: esses modelos acompanham **faturamento e cobrança** (o que foi faturado, cobrado, recebido,
pago), um conceito **distinto** de "receita/custo realizados" — mesmo raciocínio já documentado em
`docs/trip-financial-result.md` (`invoicedRevenue`/`receivedRevenue` vs. o resultado operacional). Esta
fase nunca lê nem altera `Receivable`/`Payable`/`FinancialAccount`/`CashFlow` — nenhum comportamento
deles muda.

## 5. Nenhum ledger, nenhuma persistência

Todo o cálculo acontece em memória, a cada requisição, sobre um lote fixo de queries (ver seção 7).
Nenhuma migration foi necessária — nenhuma tabela nova, nenhuma coluna nova em nenhum modelo existente.

## 6. APIs (`apps/api/src/customer-profitability`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/customer-profitability/dashboard` | Indicadores gerais (receita/custo/resultado/margem/viagens/clientes) + ranking top 10 por resultado e por margem |
| `GET` | `/customer-profitability/customers` | Listagem paginada, ordenável (resultado/margem/receita/custo/viagens), filtrável por cliente/período |
| `GET` | `/customer-profitability/customers/:customerId` | Rentabilidade de um cliente específico — nunca 404 por ausência de dados, só quando o cliente em si não existe |

RBAC: `FINANCE_READ_ROLES` (mesmo grupo do `CashFlowService`/Fase 74 — leitura ampla incluindo
`AUDITOR`; módulo 100% leitura, sem grupo de escrita). Sem gate de `TenantModule` — depende só de
`Trip`/`TripRevenue`/`TripExpense` (núcleo `TRIPS`), nunca do módulo `FREIGHT` (mesmo critério já usado
por Quotations/Proposals/Pipeline, Fases 94–96).

## 7. Performance / N+1

Lote **fixo** de queries, independente do número de clientes ou viagens: 1 `findMany` (viagens do
escopo) + 4 `groupBy` (`tripId` → soma de receita/despesa aprovada/combustível/pedágio) + 1 `findMany`
(nomes dos clientes envolvidos). A atribuição por cliente, ranking, ordenação e paginação da listagem
acontecem em memória sobre esse resultado já agregado — nunca uma consulta por cliente ou por viagem.
Testado: contagem de queries fixa entre 5 e 20 viagens no dashboard.

## 8. Frontend (`apps/admin-web`)

- **`/operations/finance/customer-profitability`**: indicadores gerais, ranking por resultado e por
  margem (gráficos de barra, reaproveitando `BarRankingChart` já existente da Fase 74), listagem
  paginada/ordenável com filtro por cliente/período, cada linha navega para `/customers/:id` (detalhe do
  cliente já existente).
- **`/customers/:id`**: nova seção "Rentabilidade" com receita/custo/resultado/margem reais deste
  cliente, ao lado das seções já existentes de Contratos/Faturamento/Contas a receber — sem substituir
  nenhuma delas (aquelas mostram valor contratado/faturado/a receber; esta mostra o resultado
  econômico real).
- Reaproveita integralmente `DataTable`/`FilterBar`/`Pagination`/`StatCard`/`BarRankingChart`/
  `EntitySelect`/`DatePicker`/`Badge` já existentes — nenhum componente de UI genérico novo.

## 9. Limitações reais (documentadas, não escondidas)

- **Sem alocação de custo de manutenção** — herdado de `getFinancialDashboard` (Fase 51), nunca
  "corrigido" aqui (mudaria uma regra de negócio já usada por outros três endpoints).
- **Duplicidade herdada, não introduzida**: se a operação lançar o mesmo abastecimento tanto como
  `FuelSupply` quanto como `TripExpense` categoria `FUEL` (ou o mesmo pedágio como `TollTransaction` e
  como `TripExpense` categoria `TOLL_EXTRA`), ambos entram no custo — mesma limitação já documentada em
  `docs/trip-financial-result.md`, fora do escopo desta fase corrigir.
- **Receita = `TripRevenue.amount` realizado, não contratado/faturado.** Para valor contratado e
  faturamento, os dashboards já existentes (`/freight/dashboard`, `/billing/dashboard`,
  `/receivables/dashboard`, todos filtráveis por `customerId` e já exibidos na página do cliente)
  continuam sendo a fonte — nunca duplicados aqui.
- **`tripsCount` conta todas as viagens do cliente no período**, independente de já terem receita/custo
  lançados — reflete "quantas viagens", não "quantas viagens com dados financeiros".
- **Ranking limitado a 10 posições** (`topByResult`/`topByMargin` no dashboard) — a listagem paginada
  (`/customer-profitability/customers`) não tem esse limite.

## 10. Testes

`apps/api/test/customer-profitability.e2e-spec.ts` (13 testes, requests reais contra o Postgres):
cálculo correto de receita/custo/resultado/margem (incluindo margem `null` sem receita válida), múltiplas
viagens do mesmo cliente somadas corretamente, filtro por período (`plannedDeparture`), cliente existente
sem viagens retornando zerado (nunca 404) e cliente inexistente retornando 404, cliente sem viagens
ausente do ranking/listagem, despesas `REJECTED`/`PENDING` nunca entrando no custo (ausência de dupla
contagem), dashboard com indicadores gerais e ranking por resultado/margem, ordenação da listagem por
todos os campos, isolamento multi-tenant, RBAC (`DRIVER` bloqueado, `AUDITOR` lê normalmente) e ausência
de N+1. Regressão executada em `customer-crm.e2e-spec.ts` (14), `trip-finance.e2e-spec.ts`,
`freight.e2e-spec.ts` (19) e `finance.e2e-spec.ts` — 60 testes no total, diretamente afetados por
dependerem de `Trip`/`TripRevenue`/`TripExpense`/`Customer`/financeiro — todos passando sem alteração.
