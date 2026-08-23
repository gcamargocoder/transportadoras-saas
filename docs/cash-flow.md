# Fluxo de caixa e liquidez consolidados (Fase 74)

## Objetivo

Consolidar, em uma única visão, o que as Fases 72 (Contas a Receber) e 73
(Contas a Pagar) já implementaram — sem criar nenhum ledger novo. Este
endpoint é uma **projeção calculada ao vivo** sobre `Receivable`/
`ReceivablePayment`/`Payable`/`PayablePayment`, exatamente como
`GET /trips/:id/financial-result` (Fase 71) é uma projeção sobre os
ledgers da viagem.

## Auditoria (o que já existia antes desta fase)

- `Receivable`/`ReceivablePayment` (Fase 72), `Payable`/`PayablePayment`
  (Fase 73) — os quatro ledgers financeiros reais do projeto.
- `ReceivablesDashboardService.getDashboard` e
  `PayablesDashboardService.getDashboard` — já calculam, cada um com
  **1 única `findMany`**, o resumo (total/aberto/vencido/a vencer),
  aging (5 faixas) e ranking (por cliente / por categoria). **Ambos
  reaproveitados integralmente** nesta fase — nenhuma dessas contas foi
  recalculada de novo.
- `common/utils/balance-status.util.ts` (Fase 73) — núcleo de status
  compartilhado entre `Receivable`/`Payable`. Esta fase reaproveita
  `computeBalance`/`round2` dele diretamente, sem duplicar a regra de
  saldo.
- `common/utils/monthly-series.util.ts` (Fase 19) — `buildMonthlyRange`
  já resolve "quais são os limites de cada um dos últimos N meses"; esta
  fase reaproveita essa função para a série mensal, em vez de reescrever
  a lógica de bucketing.
- Não existia nenhuma implementação prévia de `cash-flow`, `CashTransaction`,
  `BankTransaction`, `FinancialLedger` ou `AccountBalance` — confirmado por
  busca no código antes de iniciar.

## Por que um módulo novo (`finance`) e não dentro de `fleet-operations`

`fleet-operations` consolida indicadores de frota/veículos/viagens.
Contas a Receber e Contas a Pagar já vivem em seus próprios módulos de
topo (`/receivables`, `/payables`), não dentro de `fleet-operations`. Um
endpoint que combina AMBOS pertence ao mesmo nível arquitetural — por
isso `GET /finance/cash-flow`, um módulo novo e enxuto (`FinanceModule`,
somente leitura) que **importa** `ReceivablesModule`/`PayablesModule` e
injeta os dois `DashboardService` já existentes (exportados a partir
desta fase — mudança aditiva nos dois módulos, nenhuma quebra).

## Diferença fundamental: operacional vs. caixa

| Conceito | Fonte | Quando muda |
|---|---|---|
| **Faturado** | `TripBilling.invoicedAmount` | Ao faturar a viagem (Fase 60) |
| **Recebido** | `Receivable.receivedAmount` (= soma real de `ReceivablePayment`) | Só quando um pagamento é efetivamente registrado (Fase 72) |
| **Despesa lançada** | `TripExpense.amount` | Ao registrar/aprovar a despesa (Fase 16) |
| **Pago** | `Payable.paidAmount` (= soma real de `PayablePayment`) | Só quando um pagamento é efetivamente registrado (Fase 73) |

`GET /finance/cash-flow` **nunca** usa `TripBilling.status = PAID` como
entrada de caixa, e **nunca** usa `TripExpense.amount` como saída de
caixa. `totalReceived`/`totalPaid` vêm exclusivamente dos campos
materializados `receivedAmount`/`paidAmount`, que por construção (Fase
72/73) são sempre a soma exata dos respectivos ledgers de pagamento.

## KPIs (`summary`)

```
totalReceived          = Receivable.receivedAmount somado (não cancelados)      -- via ReceivablesDashboardService
totalPaid               = Payable.paidAmount somado (não cancelados)             -- via PayablesDashboardService
totalReceivableOpen     = saldo em aberto a receber (não pago/não cancelado)      -- "entrada prevista"
totalPayableOpen        = saldo em aberto a pagar (não pago/não cancelado)        -- "saída prevista"
totalReceivableOverdue  = parcela de totalReceivableOpen com dueDate no passado
totalPayableOverdue     = parcela de totalPayableOpen com dueDate no passado
projectedNetBalance     = totalReceivableOpen - totalPayableOpen                 -- ver seção "Saldo projetado"
receivedCount           = COUNT(ReceivablePayment) do tenant (histórico completo)
paidCount               = COUNT(PayablePayment) do tenant (histórico completo)
```

Os KPIs de resumo refletem o **estado atual** (não são filtrados por
`from`/`to` — mesmo comportamento já usado por
`GET /receivables/dashboard` e `GET /payables/dashboard`, que também
ignoram período por padrão nas páginas existentes).

## Fluxo mensal (`monthly`)

`from`/`to` (opcionais) definem a janela da série mensal — **somente
dela**, nunca dos KPIs de resumo. Sem `from`/`to`: últimos 12 meses
terminando hoje (mesma janela padrão já usada em `aggregateMonthlySeries`
desde a Fase 19/51/60). Cada ponto:

```
period            = "AAAA-MM" (mês do bucket, limites via buildMonthlyRange)
received          = soma de ReceivablePayment.amount com paymentDate no mês
paid              = soma de PayablePayment.amount com paymentDate no mês
net               = received - paid
receivableDue     = soma do SALDO de Receivable (não pago/não cancelado) com dueDate no mês
payableDue        = soma do SALDO de Payable (não pago/não cancelado) com dueDate no mês
receivableOverdue = parcela de receivableDue cujo dueDate já passou (hoje)
payableOverdue    = parcela de payableDue cujo dueDate já passou (hoje)
```

Para um mês já encerrado, `receivableDue`/`payableDue` tendem a ser
idênticos a `receivableOverdue`/`payableOverdue` (o vencimento já passou
por definição) — a diferença só aparece quando o título foi parcialmente
pago (o saldo restante continua vencido). Para um mês futuro,
`receivableOverdue`/`payableOverdue` são sempre `0`.

## Consolidação por cliente e por categoria

`topReceivableCustomers` e `topPayableCategories` **reaproveitam
diretamente** `ReceivablesDashboardService.byCustomer` e
`PayablesDashboardService.byCategory` (nenhuma nova agregação/consulta) —
apenas reordenados pelo saldo em aberto (`balance`) em vez do total
faturado/original, e limitados aos 10 primeiros. A "separação por mês de
vencimento" pedida (seção 4/5) é coberta pela própria série mensal
(`receivableDue`/`payableDue` por período) — não foi criada uma segunda
estrutura para isso.

## Saldo projetado — leia com atenção

```
projectedNetBalance = totalReceivableOpen - totalPayableOpen
```

**Isto NÃO é um saldo bancário.** O projeto:

- não possui nenhuma conta bancária cadastrada;
- não possui integração bancária (Open Finance, PIX automático, etc.);
- não possui conciliação bancária;
- não sabe quanto dinheiro existe fisicamente em caixa/banco hoje.

`projectedNetBalance` responde apenas: **se todo mundo que deve receber
receber, e todo mundo que deve pagar for pago, qual sobra?** — uma
projeção de liquidez sobre os títulos já cadastrados, nada mais. Nenhuma
funcionalidade de conta bancária, movimento bancário ou conciliação foi
criada nesta fase (explicitamente fora de escopo).

## Regra de OVERDUE (reaproveitada, não duplicada)

`OVERDUE` nunca é um valor persistido em `Receivable.status`/
`Payable.status` — é sempre `dueDate < agora` sobre um título ainda não
pago/cancelado, exatamente a mesma regra de `common/utils/
balance-status.util.ts` (Fase 73) usada por `ReceivablesDashboardService`/
`PayablesDashboardService`. Esta fase não reimplementa essa regra: usa
`computeBalance` do mesmo núcleo e replica apenas a comparação de data
(idêntica à já usada nos dois dashboards) para os buckets mensais.

## Performance

Número de queries **fixo**, independente da quantidade de
Receivables/Payables/pagamentos:

1. `ReceivablesDashboardService.getDashboard` — 1 `findMany` (já existente).
2. `PayablesDashboardService.getDashboard` — 1 `findMany` (já existente).
3. `receivablePayment.count` — 1 query.
4. `payablePayment.count` — 1 query.
5. `receivable.findMany` (bounded à janela mensal, para `receivableDue`/`receivableOverdue`).
6. `payable.findMany` (bounded à janela mensal).
7. `receivablePayment.findMany` (bounded à janela mensal, para `received`).
8. `payablePayment.findMany` (bounded à janela mensal, para `paid`).

Todas em `Promise.all` (paralelas). Nunca uma query por cliente,
categoria, mês ou título — confirmado por teste e2e com spy no Prisma
Client (mesmo número de chamadas com poucos e muitos registros).

## Limitações conhecidas

1. **Sem saldo bancário real** (ver seção "Saldo projetado").
2. **KPIs de resumo não são filtráveis por período** — refletem sempre o
   estado atual (mesmo comportamento dos dashboards de Receivables/
   Payables). Só a série mensal aceita `from`/`to`.
3. **Rótulo do mês (`period`) usa o fuso UTC** dos limites calculados por
   `buildMonthlyRange` — mesma convenção já usada pelos gráficos mensais
   existentes no projeto (Fase 19/51/60), não uma limitação nova.
4. **Herdadas das Fases 71-73**: possível dupla contagem entre
   `FuelSupply`/`TollTransaction` e `TripExpense` categoria `FUEL`/
   `TOLL_EXTRA`; geração manual de título (sem atualização automática se
   a despesa/faturamento original mudar depois).

## Fora do escopo desta fase

Conta bancária, movimento bancário, conciliação bancária, integração
bancária/Open Finance, PIX automático, boleto, CNAB, gateway de
pagamento, previsão por IA/machine learning, alertas de fluxo de caixa —
todos fora do escopo, sem alteração nesta fase.
