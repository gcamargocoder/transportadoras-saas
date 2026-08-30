# Contas a receber (Fase 72 + Fase Financeiro CP/CR)

## Objetivo

Transformar o faturamento operacional já existente (Fase 60, `TripBilling`)
em uma visão de **cobrança e acompanhamento**: quanto está em aberto,
vencido, a vencer, recebido — por título e por cliente. Não é um segundo
sistema financeiro. Na Fase 72, `Receivable` só podia ser gerado **a
partir de** um `TripBilling` existente. A fase "Financeiro CP/CR"
(auditoria/consolidação do módulo, ver seção abaixo) adicionou uma
segunda origem: **criação manual**, para receitas sem vínculo com uma
viagem (serviço avulso, locação, ressarcimento). `TripBilling` continua
sendo a única fonte de verdade do faturamento **operacional** da viagem —
a criação manual nunca duplica nem substitui isso.

## Auditoria (o que já existia antes desta fase)

- **Onde nasce o valor faturado**: `TripBilling.invoicedAmount` (Fase 60),
  incrementado a cada `POST /operational-billing/trips/:tripId/invoice`.
- **Onde fica registrado**: `TripBilling` (1:1 com `Trip`) +
  `TripBillingEntry` (ledger imutável de cada lançamento de faturamento).
- **Vencimento**: não existia nenhum campo de `dueDate` associado ao
  faturamento, ao cliente ou ao contrato (`Contract.commercialTerms` é
  texto livre, sem estrutura). Por isso `dueDate` é sempre informado
  explicitamente na geração do título — nunca inferido.
- **Recebimento real**: não existia. `TripBillingEntity.receivedAmount`
  sempre espelha `invoicedAmount` (limitação documentada desde a Fase 60 —
  "o projeto não tem nenhuma confirmação de recebimento distinta do
  registro da receita, sem gateway de pagamento").
- **Histórico de recebimentos**: não existia.
- **Saldo**: não existia (só existia saldo a *faturar*, `TripBilling.balance
  = billableAmount - invoicedAmount`).
- **Cliente vinculado**: sim, via `Trip.customerId` → `Customer`.
- **Relação direta com viagem**: sim, `TripBilling.tripId` é 1:1 com `Trip`.

Conclusão da auditoria: nada no projeto representava "conta a receber com
vencimento e histórico de recebimento real" — daí a criação de `Receivable`
e `ReceivablePayment` (seção 3/4 do pedido), mas **sempre derivados** de um
`TripBilling` existente, nunca criados soltos.

## Modelo

### `Receivable` (título)

Gerado por `POST /receivables/from-billing/:billingId`. Campos-chave:

- `billingId` — **`@unique`**: garante por constraint de banco que um
  mesmo faturamento nunca gera dois títulos (idempotência, seção 19).
- `originalAmount` — **snapshot** de `TripBilling.invoicedAmount` no
  momento da geração. Nunca recalculado depois — alterar o faturamento
  (ex.: faturar mais depois) não muda um título já gerado (ver limitação
  abaixo).
- `receivedAmount` — **materializado**: soma de `ReceivablePayment.amount`,
  atualizado dentro da mesma transação que cria cada pagamento. Mesmo
  padrão já usado por `TripBilling.invoicedAmount` (soma de
  `TripBillingEntry`), pelo mesmo motivo: permitir filtrar/paginar por
  saldo sem exigir uma agregação por linha a cada listagem.
- `status` — enum **`ReceivableStatus`** (`OPEN`, `PARTIALLY_RECEIVED`,
  `PAID`, `CANCELLED`). **Nunca contém `OVERDUE`** — vencimento depende da
  passagem do tempo, e uma coluna estática ficaria desatualizada sem um
  job. `OVERDUE` é sempre calculado ao vivo (ver abaixo).
- `customerId` — copiado de `Trip.customerId` no momento da geração
  (snapshot; nulo quando a viagem não tinha cliente vinculado).

### `ReceivablePayment` (recebimento)

Ledger **imutável**, mesmo espírito de `SubscriptionPayment` (Fase 50) e
`TripBillingEntry` (Fase 60): nenhum endpoint de update/delete. Cada linha
é um recebimento real (parcial ou total).

## Status efetivo (nunca inventa, nunca fica desatualizado)

Prioridade: `CANCELLED > PAID > OVERDUE > PARTIALLY_RECEIVED > OPEN`.

```
status escrito (persistido, atualizado a cada pagamento/cancelamento):
  cancelledAt != null        -> CANCELLED
  receivedAmount >= original -> PAID   (nunca > original, bloqueado no backend)
  receivedAmount > 0         -> PARTIALLY_RECEIVED
  caso contrário              -> OPEN

status efetivo (exibido em toda resposta da API, calculado a partir do
status escrito + dueDate + "agora" -- ver receivable-status.util.ts):
  status == CANCELLED ou PAID -> mantém (nunca "vencido" quando quitado/cancelado)
  dueDate < agora              -> OVERDUE
  caso contrário                -> mantém o status escrito
```

O filtro `GET /receivables?status=` e `GET /receivables/dashboard` usam a
mesma regra, traduzida para condições Prisma equivalentes (nunca um SELECT
completo filtrado em memória) — ver `buildReceivableStatusWhere`.

## Regras de recebimento (seção 9)

- `amount` nunca pode ultrapassar o saldo em aberto
  (`originalAmount - receivedAmount`) — validado no backend, `400` se
  exceder.
- Título `CANCELLED` ou já `PAID` (saldo zero) bloqueia novo pagamento —
  `409`.
- Pagamento nunca altera `originalAmount`, nunca apaga histórico.
- `receivedAmount` e `status` são atualizados na **mesma transação** que
  cria o `ReceivablePayment` (nunca duas escritas independentes).

## Idempotência (seção 19)

- **Um billing → um título**: `Receivable.billingId` é `@unique` no banco
  (constraint real, não apenas checagem em memória) + checagem explícita
  antes do `create` (mensagem de erro amigável em vez de um 500 de
  constraint violation no caminho feliz).
- **Um pagamento não é processado duas vezes**: cada `POST
  /receivables/:id/payments` cria uma linha nova; não há endpoint de
  reprocessamento. Chamar o endpoint duas vezes com a mesma intenção cria
  dois pagamentos distintos por design (mesmo comportamento de
  `TripBillingService.invoice`, que também não tem proteção contra
  double-submit do cliente — fora do escopo desta fase introduzir
  idempotency keys em toda a API financeira).

## Origem em documento fiscal (Fase Fiscal/XML)

`POST /receivables` também aceita `fiscalDocumentId` opcional -- mesmo
princípio de `docs/payables.md` (seção "Origem em documento fiscal"):
vincula o título ao `FiscalDocument` de origem, autopreenchimento no
formulário de criação manual, `@unique` garante no máximo 1 título por
documento, mutuamente exclusivo com `installments > 1`. Ver
`docs/fiscal-documents.md`, seção 18.

## Título manual e parcelamento (Fase Financeiro CP/CR)

`POST /receivables` cria um título **sem** `TripBilling` de origem —
`tripId`/`billingId` ficam `null` (ambos passaram a ser opcionais no
schema; `billingId` continua `@unique`, então a garantia "no máximo um
título por faturamento" se mantém intacta para os títulos derivados —
Postgres permite múltiplos `NULL` sob uma coluna `@unique`). `customerId`
é **exigido** neste fluxo (diferente do fluxo derivado, onde pode ser
nulo se a viagem não tinha cliente) — um título manual precisa identificar
quem deve. Demais campos: `description`, `originalAmount`, `issueDate`,
`dueDate`.

**Parcelamento** (`installments`, 1-360) existe **somente** neste fluxo
manual — nunca em `POST /receivables/from-billing/:billingId`, porque ali
`billingId` é `@unique` e gerar N títulos para um único faturamento
violaria essa garantia. `originalAmount` é dividido igualmente entre as
parcelas (`common/utils/installment-plan.util.ts`, compartilhado com
`PayablesService`); a última parcela absorve o resto do arredondamento
para que a soma seja sempre exatamente `originalAmount`. Vencimentos:
mensal a partir de `dueDate`, com o dia clampado ao último dia do mês
quando o mês de origem não existe no destino. Todas as parcelas de um
mesmo lançamento compartilham `installmentGroupId`; títulos não
parcelados (incluindo todos os derivados de faturamento) têm
`installmentGroupId`/`installmentNumber`/`installmentTotal` `null`.

## Juros, multa e desconto no recebimento

`POST /receivables/:id/payments` aceita três campos opcionais em
`ReceivablePayment`: `interestAmount`, `fineAmount`, `discountAmount`.
Sempre digitados manualmente — nenhuma regra de taxa/mora automática.
`amount + discountAmount` quita o título (soma em `receivedAmount`);
`discountAmount` nunca movimenta caixa. `amount + interestAmount +
fineAmount` é o valor real creditado na `FinancialTransaction` (CREDIT)
vinculada ao recebimento. O gate de saldo e o CAS de concorrência (Fase
79, seção 20) continuam os mesmos — nenhuma mudança em
`balance-status.util.ts` (mesmo racional de `docs/payables.md`, seção
"Juros, multa e desconto no pagamento").

## Diferença entre resultado financeiro (Fase 71) e contas a receber (Fase 72)

Não são a mesma coisa:

| | Fase 71 (`/trips/:id/financial-result`) | Fase 72 (`/receivables`) |
|---|---|---|
| Pergunta | A viagem foi lucrativa? | O dinheiro entrou? |
| Base | Receita contratada/faturada/recebida **menos custo** | Valor faturado **menos recebido** |
| `receivedRevenue` (Fase 71) | `invoicedAmount` quando `TripBilling.status = PAID` | N/A |
| `receivedAmount` (Fase 72) | N/A | Soma real de `ReceivablePayment`, com vencimento e aging |

Exemplo do próprio pedido: uma viagem com resultado operacional positivo
(R$ 8.000 de lucro) pode ainda ter R$ 15.000 em aberto no contas a
receber — são leituras complementares, nunca conflitantes. **A Fase 71 não
foi alterada por esta fase.**

## Relação `TripBilling` → `Receivable` → `ReceivablePayment`

```
TripBilling (Fase 60, faturamento)
  │  invoicedAmount cresce a cada POST .../invoice
  │
  │  POST /receivables/from-billing/:billingId  (snapshot manual, 1x)
  ▼
Receivable (Fase 72, título com vencimento)
  │  originalAmount = snapshot congelado
  │  receivedAmount cresce a cada pagamento
  │
  │  POST /receivables/:id/payments  (N vezes, parcial ou total)
  ▼
ReceivablePayment (ledger imutável)
```

`TripBillingEntity.receivedAmount` (Fase 60) **não foi alterado** e
continua espelhando `invoicedAmount` — essa limitação já documentada
permanece; `Receivable.receivedAmount` é o novo campo que representa
recebimento real.

## Aging (seção 12)

Classificação simples do **saldo** (não do valor original) de títulos não
pagos/não cancelados, em 5 faixas fixas: `A vencer`, `1-30 dias`, `31-60
dias`, `61-90 dias`, `91+ dias`, calculadas por
`floor((agora - dueDate) / 1 dia)`. Nenhum fluxo de cobrança (e-mail,
WhatsApp, etc.) — apenas classificação financeira, conforme pedido.

## Limitações conhecidas

1. **Um título por faturamento, gerado manualmente.** Se o operador
   invoicar parcialmente (ex.: R$ 400 de R$ 1.000) e gerar o título nesse
   momento, `originalAmount` fica congelado em R$ 400. Se depois invoicar
   o restante (R$ 600), **o título já criado não é atualizado
   automaticamente** e um segundo título não pode ser criado (constraint
   `billingId` único). Recomendação operacional: gerar o título somente
   quando o faturamento já estiver completo (`status = INVOICED`), ou
   aceitar que o título reflita apenas a fatia faturada até aquele
   momento. Resolver isso automaticamente exigiria decidir uma regra de
   negócio (reabrir o título? somar um novo?) fora do escopo desta fase de
   consolidação.
2. **Sem fonte estruturada de prazo de pagamento.** `dueDate` é sempre um
   input humano no momento da geração — não há campo de "prazo padrão" no
   cliente ou no contrato para calcular automaticamente.
3. **Sem proteção contra duplo clique em pagamentos.** Cada chamada a
   `POST /receivables/:id/payments` cria um registro novo; dois cliques
   idênticos geram dois pagamentos (mesma limitação já aceita em
   `TripBillingService.invoice`).
4. **Cancelamento de título não reverte pagamentos já recebidos.** Por
   design (seção 10: "preservar histórico, não apagar pagamentos") — o
   dinheiro já recebido continua contabilizado em `receivedAmount`, apenas
   novos pagamentos são bloqueados.

## Fora do escopo desta fase

PIX automático, boleto, CNAB, integração bancária, conciliação bancária
automática, gateway de pagamento, cobrança automática (e-mail/WhatsApp/
SMS), cartão, emissão de nota fiscal/CT-e/MDF-e — todos explicitamente
adiados para fases futuras.
