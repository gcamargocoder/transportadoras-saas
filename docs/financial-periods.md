# Fechamento financeiro, competência e integridade de períodos (Fase 76)

## Objetivo

Criar uma **camada de controle** sobre os dados financeiros já existentes
(`Receivable`/`ReceivablePayment`, `Payable`/`PayablePayment`), que permita
"fechar" um mês (`YYYY-MM`) por tenant e, a partir daí, bloquear novas
mutações financeiras cuja **data de competência** caia dentro dele.

**Isto NÃO é um ledger novo.** `FinancialPeriod` armazena apenas o estado
(`OPEN`/`CLOSED`) de uma janela mensal — nenhum valor financeiro é
duplicado, somado ou snapshot-ado. Os dashboards (`/receivables/dashboard`,
`/payables/dashboard`, `/finance/cash-flow`, `/finance/reconciliation`)
continuam calculando tudo a partir das mesmas fontes de sempre.

## Model `FinancialPeriod`

```
FinancialPeriod { id, tenantId, year, month, status, openedAt, closedAt, openedBy, closedBy, createdAt, updatedAt }
```

- `status`: `OPEN` (nasce assim) ou `CLOSED`. **Não há reabertura nesta
  fase** — uma vez `CLOSED`, o período nunca volta a `OPEN` via API.
- `@@unique([tenantId, year, month])` — no máximo um período por mês por
  tenant, reforçado por constraint de banco (nunca só em memória, mesmo
  padrão de `Receivable.billingId`/`Payable.expenseId`).

## Endpoints (`/finance/periods`)

| Rota | Descrição |
| --- | --- |
| `POST /finance/periods` | Abre um período (`{ year, month }`), sempre `OPEN`. `409` se já existir. |
| `GET /finance/periods` | Lista paginada, filtros `year`/`status`, ordenada por `year DESC, month DESC`. |
| `GET /finance/periods/:id` | Detalhe + resumo calculado ao vivo (ver abaixo). |
| `POST /finance/periods/:id/close` | Fecha o período. `409` se já `CLOSED`, ou se houver inconsistência `CRITICAL` não resolvida (conciliação, Fase 75) no escopo do mês. |

O resumo do detalhe (`totalReceived`, `totalPaid`, `receivableOpen`,
`payableOpen`, `criticalReconciliationIssues`) **reaproveita**
`ReceivablesDashboardService`/`PayablesDashboardService`/
`FinanceReconciliationService`, filtrados por `issueDate` dentro do mês —
o mesmo critério que esses serviços já usam em `/receivables/dashboard` e
`/payables/dashboard`. Nada é persistido; ao fechar, só o `status` do
período é gravado (seção 8 do pedido).

## Data de competência de cada mutação

O guard não inventa uma data nova — ele usa a data financeira que a própria
entidade já usa. Mapeado a partir do código real (nunca assumido):

| Mutação | Data de competência | Origem |
| --- | --- | --- |
| `ReceivablePayment` (registro de recebimento) | `paymentDate` | `RegisterReceivablePaymentDto.paymentDate` (informada pelo usuário) |
| `PayablePayment` (registro de pagamento) | `paymentDate` | `RegisterPayablePaymentDto.paymentDate` (informada pelo usuário) |
| `Receivable` (criação, `POST /receivables/from-billing/:id`) | `issueDate` | Sempre `new Date()` no momento da criação (código pré-existente, Fase 72 — nunca alterado nesta fase) |
| `Receivable` (cancelamento) | `issueDate` **do próprio título** | O título já persistido, nunca a data do cancelamento |
| `Payable` (criação, `POST /payables/from-expense/:id`) | `issueDate` | Snapshot de `TripExpense.expenseDate` (código pré-existente, Fase 73 — nunca alterado nesta fase) |
| `Payable` (cancelamento) | `issueDate` **do próprio título** | O título já persistido, nunca a data do cancelamento |

`TripBilling`/`TripExpense` (os registros operacionais de origem) **não
foram protegidos nesta fase** — ver limitações abaixo.

## `FinancialPeriodGuardService` (o utilitário central)

`apps/api/src/financial-periods/services/financial-period-guard.service.ts`
expõe um único método:

```ts
assertPeriodOpenForDate(tenantId: string, financialDate: Date): Promise<void>
```

1. Deriva `year`/`month` (UTC) da data recebida.
2. Busca `FinancialPeriod` por `tenantId_year_month` (índice único — no
   máximo **1 consulta** por chamada, nunca 1 por título/pagamento em
   lote).
3. Se `CLOSED`, lança `ConflictException` (409) **antes** de qualquer
   escrita.
4. **Período inexistente = operação permitida.** O sistema nunca cria/abre
   um período automaticamente (decisão explícita da seção 9 do pedido, para
   não acoplar o guard ao resto do domínio).
5. O `where` sempre inclui `tenantId` — nunca há vazamento entre tenants.

Para evitar dependência circular (`FinancialPeriodsModule` precisa de
`PayablesModule`/`ReceivablesModule`/`FinanceReconciliationModule` para
montar o resumo do período, e `PayablesModule`/`ReceivablesModule`
precisam do guard), o guard vive em um módulo próprio e enxuto,
`FinancialPeriodGuardModule` — o único ponto importado de volta por
`PayablesModule`/`ReceivablesModule`.

## O que é bloqueado e o que não é

**Bloqueado** (se a data de competência cair num período `CLOSED`):
- Registrar `ReceivablePayment`/`PayablePayment`.
- Criar `Receivable`/`Payable` (idempotência de geração, Fases 72/73,
  continua valendo por cima disso).
- Cancelar `Receivable`/`Payable`.

**Nunca bloqueado nesta fase:**
- Leitura (`GET`) de qualquer endpoint financeiro.
- Criação/edição/aprovação de `TripExpense`, criação/faturamento de
  `TripBilling` — são registros **operacionais**, não o título financeiro
  em si; o título (`Payable`/`Receivable`) gerado a partir deles é que
  respeita o período. Proteger também os registros operacionais exigiria
  alterar `TripExpensesModule`/`BillingOperationalModule` sem necessidade
  clara nesta fase (seção 9 do pedido: "não alterar dezenas de serviços
  sem necessidade").
- `FuelSupply`/`TollTransaction` — não alimentam `Payable`/`Receivable`
  diretamente hoje.

## Fechamento e inconsistências críticas

`POST /finance/periods/:id/close`:
1. Rejeita se o período já estiver `CLOSED` (idempotente — nunca fecha
   duas vezes).
2. Reaproveita `FinanceReconciliationService.getReconciliation` (Fase 75)
   filtrado pelo mês do período; se `summary.criticalCount > 0`, rejeita
   com `409` e a contagem de inconsistências — **nunca corrige nada
   automaticamente**, apenas impede o fechamento até a origem dos dados
   ser corrigida.
3. Inconsistências `WARNING`/`INFO` **nunca bloqueiam** o fechamento
   (regra explícita da seção 7 do pedido).
4. Não há mecanismo de "resolver inconsistência" nesta fase — a única
   forma de destravar o fechamento é corrigir o dado de origem até a
   conciliação parar de reportar `CRITICAL` naquele mês.

## Multi-tenant

Toda consulta (`create`, `findAll`, `findById`, `close`, e o guard) inclui
`tenantId` no `where`. Testado explicitamente (`financial-periods.e2e-spec.ts`):
tenant B nunca lista/vê/fecha período do tenant A, e nunca sofre bloqueio
por um período fechado que pertence a outro tenant.

## RBAC

Reaproveita o mesmo grupo operacional dos demais módulos financeiros
(Fases 72–75): leitura ampla (inclui `AUDITOR`), escrita (`abrir`/`fechar`)
restrita a `SUPER_ADMIN`/`ADMIN`/`MANAGER`/`OPERATOR`/`DISPATCHER`.
`DRIVER` nunca acessa nenhuma rota do módulo. Nenhum RBAC paralelo criado.

## Limitações reais desta fase

- Sem reabertura de período.
- Sem fechamento automático (mensal, por cron, etc.).
- Sem snapshot financeiro persistido no fechamento.
- `TripBilling`/`TripExpense` (registros operacionais) não são protegidos
  pelo guard — só os títulos financeiros derivados deles.
- Nenhuma contabilidade formal (partidas dobradas, plano de contas, DRE
  contábil, SPED) — fora do escopo desta fase.
