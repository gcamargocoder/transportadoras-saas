# Contas a pagar (Fase 73 + Fase Financeiro CP/CR)

## Objetivo

Espelhar, para o lado da despesa, o que a Fase 72 fez para o lado da
receita: transformar as despesas já existentes (`TripExpense`) em uma
visão de **pagamento e acompanhamento** — quanto está em aberto, vencido,
a vencer, pago — por título e por categoria. Na Fase 73, `Payable` só
podia ser gerado **a partir de** uma `TripExpense` existente. A fase
"Financeiro CP/CR" (auditoria/consolidação do módulo, ver seção abaixo)
adicionou uma segunda origem: **criação manual**, para custos
administrativos da transportadora sem vínculo com uma viagem (aluguel,
seguro, fornecedor não-operacional). `TripExpense` continua sendo a única
fonte de verdade do custo **operacional** da viagem — a criação manual
nunca duplica nem substitui isso, só cobre o que nunca teve uma
`TripExpense` correspondente.

## Auditoria (o que já existia antes desta fase)

- **Onde nasce uma despesa**: `TripExpense` (Fase 16), sempre vinculada a
  `Trip.id` (`tripId` obrigatório no schema).
- **Combustível**: `FuelSupply`, fonte de verdade separada (não é
  `TripExpense`). Uma despesa manual com categoria `FUEL` também pode
  existir — risco de dupla contagem já documentado na Fase 71/72, **não
  corrigido aqui** (fora de escopo, ver seção "Limitações").
- **Pedágio**: `TollTransaction`, fonte de verdade separada. `TripExpense`
  categoria `TOLL_EXTRA` é conceitualmente distinta (pedágio não coberto
  pela tag) — mesmo princípio já documentado na Fase 71.
- **Despesas extras**: `TripExpense` em qualquer categoria
  (`FOOD`, `HOTEL`, `MAINTENANCE`, `TIRES`, `PARKING`, `WASH`, `ADVANCE`,
  `FINE`, `OTHER`), com `status` (`PENDING`/`APPROVED`/`REJECTED`/
  `CANCELLED`).
- **Fornecedor**: não existe um model `Supplier`. `TripExpense.supplier`
  é um campo de texto livre (`String?`), sem relação estruturada.
- **Vencimento**: não existia nenhum campo `dueDate` em `TripExpense` nem
  em nenhuma outra estrutura de despesa.
- **Pagamento real**: não existia. `TripExpense` registra a despesa e sua
  aprovação, mas nunca um histórico de quando/como ela foi efetivamente
  paga.
- **Saldo**: não existia (não havia conceito de pagamento parcial).
- **Estrutura que pudesse virar conta a pagar**: nenhuma — daí a criação
  de `Payable`/`PayablePayment`, sempre **derivados** de uma
  `TripExpense` já aprovada, nunca criados soltos.

## Modelo

### `Payable` (título)

Gerado por `POST /payables/from-expense/:expenseId`. Exige
`TripExpense.status = APPROVED` (mesmo critério que
`TripSettlementsService.getFinancialDashboard` já usa para considerar uma
despesa como custo real, Fase 51). Campos-chave:

- `expenseId` — **`@unique`**: garante por constraint de banco que uma
  mesma despesa nunca gera dois títulos (idempotência, seção 22).
- `originalAmount`, `category`, `supplierName` — **snapshot** de
  `TripExpense.amount`/`category`/`supplier` no momento da geração. Nunca
  recalculado depois — editar a despesa original não muda um título já
  gerado.
- `supplierName` — texto livre copiado de `TripExpense.supplier`. O
  projeto **não possui** um model `Supplier`; nenhuma relação foi
  inventada (seção 16 do pedido).
- `category` — reaproveita o enum `ExpenseCategory` já existente; nenhum
  enum paralelo (seção 13).
- `paidAmount` — **materializado**: soma de `PayablePayment.amount`,
  atualizado dentro da mesma transação que cria cada pagamento. Mesmo
  motivo de `Receivable.receivedAmount` (Fase 72): permite filtrar/paginar
  por saldo sem exigir uma agregação por linha a cada listagem.
- `status` — enum `PayableStatus` (`OPEN`, `PARTIALLY_PAID`, `PAID`,
  `CANCELLED`). **Nunca contém `OVERDUE`** — calculado ao vivo (ver
  abaixo), mesmo princípio de `ReceivableStatus`.
- `issueDate` — usa `TripExpense.expenseDate` (data em que a despesa
  ocorreu), diferente de `Receivable.issueDate` (que usa a data de
  geração do título, pois `TripBilling` não tem uma data de fato
  equivalente). Decisão deliberada: `expenseDate` é uma data real e
  confiável já existente no schema.

### `PayablePayment` (pagamento)

Ledger **imutável**, mesmo espírito de `ReceivablePayment` (Fase 72) e
`SubscriptionPayment` (Fase 50): nenhum endpoint de update/delete.
`paymentMethod` reaproveita `ExpensePaymentMethod` (já usado em
`TripExpense`) — nenhum enum paralelo.

## Origem em documento fiscal (Fase Fiscal/XML)

`POST /payables` também aceita `fiscalDocumentId` opcional — vincula o
título ao `FiscalDocument` (NF-e/CT-e importado, `docs/fiscal-documents.md`
seção 18) que originou os dados, permitindo autopreenchimento (fornecedor/
valor/data extraídos do XML) e evitando digitação duplicada. `@unique` em
`Payable.fiscalDocumentId` garante no máximo 1 título por documento fiscal
(mesma idempotência de `expenseId`/`billingId`). Mutuamente exclusivo com
`installments > 1` (ver seção 18.2 do doc fiscal). Sempre uma ação
explícita do usuário no drawer do documento fiscal — nunca gerado
automaticamente na importação do XML.

## Título manual e parcelamento (Fase Financeiro CP/CR)

`POST /payables` cria um título **sem** `TripExpense` de origem —
`tripId`/`expenseId` ficam `null` (ambos os campos passaram a ser
opcionais no schema; `expenseId` continua `@unique`, então a garantia
"no máximo um título por despesa" se mantém intacta para os títulos
derivados — Postgres permite múltiplos `NULL` sob uma coluna `@unique`).
Campos exigidos: `category` (reaproveita `ExpenseCategory`, nenhuma
categoria nova foi criada — `OTHER` é o valor recomendado para custos
administrativos), `description`, `originalAmount`, `issueDate`,
`dueDate`. `supplierName` continua texto livre, opcional.

**Parcelamento** (`installments`, 1-360) existe **somente** neste fluxo
manual — nunca em `POST /payables/from-expense/:expenseId`, porque ali
`expenseId` é `@unique` e gerar N títulos para uma única despesa violaria
essa garantia. `originalAmount` é dividido igualmente entre as parcelas
(`common/utils/installment-plan.util.ts`, compartilhado com
`ReceivablesService`); a última parcela absorve o resto do arredondamento
para que a soma seja sempre exatamente `originalAmount`. Vencimentos:
mensal a partir de `dueDate`, com o dia clampado ao último dia do mês
quando o mês de origem não existe no destino (ex.: 31/jan + 1 mês =
28/fev). Todas as parcelas de um mesmo lançamento compartilham
`installmentGroupId` (gerado uma vez, nunca reaproveitado) e têm
`installmentNumber`/`installmentTotal` preenchidos; títulos não
parcelados (incluindo todos os derivados de despesa) têm os três campos
`null`. As N linhas são criadas numa única transação Prisma.

## Juros, multa e desconto no pagamento

`POST /payables/:id/payments` aceita três campos opcionais em
`PayablePayment`: `interestAmount`, `fineAmount`, `discountAmount`.
Sempre digitados manualmente pelo usuário — o projeto não modela nenhuma
regra de taxa/juros automática, então nada aqui é calculado a partir de
uma alíquota. Semântica:

- `amount + discountAmount` é o que **quita o título** — soma em
  `paidAmount` junto com `amount`. `discountAmount` nunca gera
  movimentação financeira real (é um abatimento, não dinheiro que saiu do
  caixa).
- `amount + interestAmount + fineAmount` é o valor **real** movimentado
  na `FinancialTransaction` (DEBIT) vinculada ao pagamento — juros/multa
  são cobrança adicional que não abate `originalAmount`/saldo do título.

O gate de saldo (`amount + discountAmount` nunca pode ultrapassar o saldo
em aberto, `400` se exceder) e o CAS de concorrência (Fase 79, seção 20)
continuam exatamente os mesmos — nenhuma mudança em
`balance-status.util.ts`: `discountAmount` é somado ao mesmo acumulador
que `amount` antes de chegar na função de status, então a fórmula
existente (`originalAmount`/`paidAmount`/`cancelledAt`) nunca precisou
mudar.

## Reuso de código entre Fase 72 e Fase 73

A regra de status/saldo/vencimento é **idêntica** entre `Receivable` e
`Payable` (só muda o nome do enum Prisma). Para não duplicar essa lógica,
o núcleo foi extraído para
`apps/api/src/common/utils/balance-status.util.ts` (funções genéricas
parametrizadas pelos valores do enum de cada módulo); tanto
`receivable-status.util.ts` (Fase 72, refatorado) quanto
`payable-status.util.ts` (Fase 73, novo) são wrappers finos sobre esse
núcleo — nenhuma função pública de `receivable-status.util.ts` mudou de
assinatura, então nenhum chamador precisou ser alterado.

## Status efetivo

Prioridade: `CANCELLED > PAID > OVERDUE > PARTIALLY_PAID > OPEN`. Mesma
regra da Fase 72 (ver `docs/receivables.md`), aplicada a `originalAmount`/
`paidAmount`/`dueDate`. `OVERDUE` nunca é persistido — calculado a partir
de `dueDate < agora`, e nunca aparece quando `status` já é `PAID` ou
`CANCELLED`.

## Regras de pagamento (seção 8)

- `amount` nunca pode ultrapassar o saldo em aberto
  (`originalAmount - paidAmount`) — `400` se exceder.
- Título `CANCELLED` ou já `PAID` (saldo zero) bloqueia novo pagamento —
  `409`.
- Pagamento nunca altera `originalAmount`, nunca apaga histórico.
- `paidAmount` e `status` são atualizados na **mesma transação** que cria
  o `PayablePayment`.

## Despesas especiais — sem dupla contagem automática (seção 10)

Esta fase **não gera automaticamente** um `Payable` para `FuelSupply` ou
`TollTransaction`. A única origem de `Payable` é `POST
/payables/from-expense/:expenseId`, sempre uma `TripExpense` explícita.
Isso evita criar três títulos para o mesmo custo (combustível real +
pedágio real + despesa manual). Se a operação também registrar
combustível/pedágio como `TripExpense` (categoria `FUEL`/`TOLL_EXTRA`), a
mesma limitação de possível dupla contagem já documentada na Fase 71 (ver
`docs/trip-financial-result.md`) permanece — **não foi corrigida aqui**,
por estar fora do escopo desta fase de consolidação.

## Consolidação (seções 11-14)

- **Dashboard** (`GET /payables/dashboard`): `totalPayable`, `totalPaid`,
  `totalOpen` (= `totalOverdue` + `totalUpcoming`), contagens por bucket.
  Uma única `findMany` por chamada + agregação em memória (mesmo padrão
  de `ReceivablesDashboardService`/`BillingDashboardService`).
- **Aging**: 5 faixas fixas (`A vencer`, `1-30`, `31-60`, `61-90`, `91+`
  dias) sobre o saldo dos títulos não pagos/não cancelados.
- **Por categoria**: `byCategory` agrupa por `ExpenseCategory` (existente,
  nenhum enum novo).
- **Por fornecedor**: **não implementado**. O projeto não possui um model
  `Supplier` estruturado — `supplierName` é texto livre, sem identidade
  garantida (duas grafias diferentes do mesmo fornecedor não seriam
  agrupadas de forma confiável). Seção 12 do pedido permite explicitamente
  pular essa consolidação quando não há `Supplier` real.
- **Por viagem**: não foi criada nenhuma relação nova — `Payable.tripId`
  já existe (copiado de `TripExpense.tripId`) e é filtrável via
  `GET /payables?tripId=`.

## Idempotência (seção 22)

- **Uma despesa → um título**: `Payable.expenseId` é `@unique` no banco
  (constraint real, agora nullable — múltiplos `NULL` não violam a
  constraint, então títulos manuais nunca esbarram nela) + checagem
  explícita antes do `create` no fluxo derivado.
- **Um pagamento não é processado duas vezes**: cada `POST
  /payables/:id/payments` cria uma linha nova; mesma limitação já aceita
  em `ReceivablesService`/`TripBillingService` (sem idempotency key contra
  duplo clique do cliente, fora do escopo desta fase).

## Diferença entre custo operacional e pagamento financeiro (seção 18)

**Não confundir.** `TripExpense`/`TripSettlementsService`/
`TripFinancialResult` (Fase 71) continuam sendo a única fonte de verdade
do **custo operacional** da viagem — nada disso foi alterado ou
substituído por `Payable`.

```
Despesa operacional (TripExpense.amount) = R$ 10.000   -- custo real da viagem, sempre
Pago (Payable.paidAmount)                = R$ 4.000    -- o que efetivamente saiu do caixa

Custo da viagem (Fase 71, expenseCost)   = R$ 10.000   -- nao muda
Saída financeira (Fase 73, PayablePayment) = R$ 4.000  -- saldo em aberto = R$ 6.000
```

`GET /trips/:id/financial-result` (Fase 71) **não foi alterado** por esta
fase. A aba Financeiro da viagem (`FinancialTab`) mostra as duas visões
lado a lado, em seções claramente separadas: "Resultado financeiro" (Fase
71, custo operacional) e "Contas a pagar" (Fase 73, pagamento financeiro).

## Frontend

- `/operations/finance/payables` — dashboard + tabela + modal de detalhe/
  pagamento/cancelamento (mesmo padrão de `/operations/finance/receivables`,
  Fase 72) + botão "Nova conta a pagar" (título manual, com parcelamento
  opcional).
- Aba "Despesas" da viagem (`ExpensesTab`) — ação "Gerar conta a pagar"
  para despesas `APPROVED`.
- Aba "Financeiro" da viagem (`FinancialTab`) — novo card "Contas a pagar"
  listando os títulos desta viagem, sem alterar o card "Resultado
  financeiro" (Fase 71) nem o "Acerto da viagem" (Fase 17).
- Não foi criada nenhuma seção em `/customers/[id]` — cliente não é
  fornecedor (seção 16), e não há tela de fornecedor nesta fase.

## Limitações conhecidas

1. **Sem consolidação por fornecedor real** — `supplierName` é texto
   livre; duas grafias do mesmo fornecedor aparecem como entidades
   diferentes se o usuário digitar de forma inconsistente.
2. **Sem prazo de pagamento padrão** — `dueDate` é sempre input humano.
3. **Sem proteção contra duplo clique em pagamentos**.
4. **Cancelamento não reverte valores já pagos** — por design (seção 9).
5. **Risco de dupla contagem entre `FuelSupply`/`TollTransaction` e
   `TripExpense`** já documentado na Fase 71 — não corrigido aqui,
   propagado para `Payable` porque `Payable` deriva de `TripExpense`.
6. **Geração manual, uma vez por despesa** — se o valor da despesa for
   editado depois de o título já ter sido gerado, o título **não** é
   atualizado automaticamente (mesmo comportamento de `Receivable` em
   relação a `TripBilling`, Fase 72).
7. **Parcelamento só no título manual** — `POST /payables/from-expense`
   continua gerando sempre 1 título (ver "Título manual e parcelamento"
   acima, motivo: `expenseId` `@unique`).
8. **Juros/multa/desconto sempre manuais** — nenhuma taxa/regra
   automática de mora é calculada (ver "Juros, multa e desconto").

## Fora do escopo desta fase

PIX/boleto/CNAB, integração bancária, conciliação bancária automática,
gateway, cobrança automática, NF-e/CT-e/MDF-e, cadastro completo de
fornecedores, módulo de compras/pedidos de compra, aprovação de despesas
(já existe via `TripExpense.status`, não foi tocado), centro de custos
avançado — todos explicitamente adiados para fases futuras.
