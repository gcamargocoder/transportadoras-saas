# Conciliação e integridade financeira (Fase 75)

## Objetivo

Detectar inconsistências reais entre os ledgers financeiros já existentes
(`TripBilling`/`Receivable`/`ReceivablePayment`, `TripExpense`/`Payable`/
`PayablePayment`) **sem criar um segundo ledger e sem corrigir nada
automaticamente**. `GET /finance/reconciliation` é uma **projeção
calculada ao vivo** — nada aqui é persistido, exatamente como
`GET /finance/cash-flow` (Fase 74) e `GET /trips/:id/financial-result`
(Fase 71).

## Por que um módulo novo, montado no mesmo prefixo `/finance`

`apps/api/src/finance-reconciliation/` é um módulo próprio (mesma
organização de `receivables`/`payables`/`finance`), mas seu controller usa
`@Controller('finance')` — o mesmo prefixo do `FinanceController` da Fase
74 — para produzir exatamente a rota pedida: `GET /finance/reconciliation`.
NestJS permite múltiplos controllers com o mesmo prefixo em módulos
diferentes, desde que as rotas não colidam (`/finance/cash-flow` e
`/finance/reconciliation` são distintas).

## Por que `INFO`/`WARNING`/`CRITICAL` e não `AlertSeverity`

O projeto já possui um enum de severidade (`AlertSeverity`: `LOW`/
`MEDIUM`/`HIGH`/`CRITICAL`, Fase 69, usado pelo centro de notificações).
Essa escala é **diferente** da pedida nesta fase. Forçar uma
correspondência (`MEDIUM` = `WARNING`? `HIGH` = `WARNING`?) seria inventar
uma regra sem base real. Como a severidade aqui nunca é persistida (só
existe na resposta calculada), um union de string literal
(`'INFO' | 'WARNING' | 'CRITICAL'`) é a opção mais honesta — mesmo
espírito de `ReceivableEffectiveStatus`/`PayableEffectiveStatus` (Fases
72/73), que estendem um enum Prisma com um valor calculado sem criar
coluna nova.

## Os 11 detectores

Cada um retorna zero ou mais `FinanceReconciliationIssueEntity`. Nenhuma
regra financeira nova foi inventada — cada detector usa exclusivamente
campos/estados que `ReceivablesService`, `PayablesService`,
`TripBillingService` e `TripExpensesService` já produzem.

### 1. `RECEIVABLE_BALANCE_INCONSISTENT` (CRITICAL)
`Receivable.receivedAmount` (campo materializado) difere da soma real de
`ReceivablePayment.amount` para aquele título (tolerância de R$ 0,01 para
arredondamento). Em operação normal isso nunca deveria acontecer —
`ReceivablesService.registerPayment` sempre atualiza os dois na mesma
transação (Fase 72) — mas é o teste de integridade mais direto que existe:
compara o campo contra a soma real do ledger.

### 2. `RECEIVABLE_PAYMENT_EXCEEDS_INVOICED` (CRITICAL)
`Receivable.receivedAmount > Receivable.originalAmount`. Também nunca
alcançável via API (`registerPayment` bloqueia com `400` antes), mas
verificado defensivamente.

### 3. `RECEIVABLE_WITHOUT_BILLING` (WARNING)
Título `Receivable` ainda ativo (não `CANCELLED`) cujo `TripBilling` de
origem foi **cancelado** depois. Cenário real e alcançável:
`TripBillingService.cancel()` explicitamente preserva receivables já
gerados (Fase 60/72 — "entradas já geradas nunca são apagadas"), então um
título pode continuar "vivo" apontando para um faturamento que não é mais
válido.

### 4. `BILLING_WITHOUT_RECEIVABLE` (WARNING) e 11. `TRIP_BILLING_WITHOUT_RECEIVABLE` (INFO)
Mesma verificação base (`TripBilling` com `invoicedAmount > 0`, não
cancelado, sem nenhum `Receivable` gerado — usando o relacionamento
reverso opcional `TripBilling.receivable`), **diferenciada pela
severidade** usando o `TripBillingStatus` real:
- `status IN (INVOICED, PAID)` → faturamento **concluído** sem título
  gerado → `BILLING_WITHOUT_RECEIVABLE`, `WARNING` (provável esquecimento).
- `status = PARTIALLY_INVOICED` → faturamento **ainda em andamento** →
  `TRIP_BILLING_WITHOUT_RECEIVABLE`, `INFO` (esperado — gerar o título
  antes de terminar de faturar é uma decisão operacional, não um erro; ver
  limitação já documentada em `docs/receivables.md`).

### 5. `PAYABLE_WITHOUT_APPROVED_EXPENSE` (WARNING)
`Payable` ativo cuja `TripExpense` de origem não está mais `APPROVED`.
Cenário real: a máquina de estados de `TripExpense`
(`ALLOWED_STATUS_TRANSITIONS`) permite `APPROVED → CANCELLED` mesmo depois
de o `Payable` já ter sido gerado — o título fica "órfão" de uma despesa
válida.

### 6. `PAYABLE_BALANCE_INCONSISTENT` (CRITICAL) e 7. `PAYABLE_PAYMENT_EXCEEDS_EXPENSE` (CRITICAL)
Espelho exato de `RECEIVABLE_BALANCE_INCONSISTENT`/
`RECEIVABLE_PAYMENT_EXCEEDS_INVOICED`, para `Payable`/`PayablePayment`.

### 8. `DUPLICATE_RECEIVABLE` e 9. `DUPLICATE_PAYABLE` (CRITICAL)
`Receivable.billingId` e `Payable.expenseId` são **`@unique`** no banco —
duplicidade real é estruturalmente impedida pela própria constraint.
Implementados como verificação **defensiva** (`groupBy` + `having count >
1`), consistente com a instrução da fase de "usar os identificadores e
vínculos existentes" e nunca comparar apenas valores iguais. Espera-se que
retornem sempre vazio em operação normal; sua utilidade é capturar uma
eventual corrupção de dados fora do fluxo normal da aplicação (migração
manual, script administrativo, etc.) — por isso não foram testados com
dados reais duplicados no e2e desta fase (não é possível produzir esse
estado através da API sem violar a própria constraint que o detector
verifica).

### 10. `TRIP_EXPENSE_WITHOUT_PAYABLE` (WARNING)
`TripExpense` com `status = APPROVED` sem nenhum `Payable` gerado (via
relacionamento reverso opcional `TripExpense.payable`). Geração de título
é sempre uma ação manual (Fase 73) — este alerta apenas sinaliza que a
ação ainda não foi tomada.

## Severidade — critério aplicado

| Severidade | Quando |
|---|---|
| `CRITICAL` | Erro matemático real (saldo não bate com o ledger, pagamento ultrapassa o teto) ou duplicidade efetiva de título |
| `WARNING` | Vínculo problemático entre entidades — faturamento/despesa concluídos sem o título correspondente, ou título apontando para uma origem já cancelada/reprovada |
| `INFO` | Diferença de materialização esperada (faturamento ainda em andamento) — não representa erro |

## O que NÃO é considerado inconsistência

- Faturamento **parcial** (`PARTIALLY_INVOICED`) sem `Receivable` — é
  `INFO`, não erro (ver detector 11 acima).
- Despesa aprovada sem `Payable` — é `WARNING` informativo, não bloqueia
  nada; gerar o título é sempre opcional/manual.
- `TripBilling`/`TripExpense`/`Receivable`/`Payable` já `CANCELLED` —
  excluídos da maioria dos detectores (um título cancelado não precisa de
  saldo/vínculo íntegro, ele já está fora do fluxo ativo).
- Viagens com `Trip.deletedAt` preenchido (soft-deleted) — excluídas dos
  detectores de `TripBilling`/`TripExpense` sem título, para não gerar
  ruído sobre viagens que nunca chegaram a operar.
- Duas Receivables/Payables com o **mesmo valor monetário** — isso
  isoladamente nunca é tratado como duplicidade (a fase pediu
  explicitamente para não fazer essa comparação simplista); só o
  compartilhamento do mesmo `billingId`/`expenseId` conta.

## Performance (queries fixas, nunca por registro)

Os 4 detectores rodam em paralelo (`Promise.all`). Cada um usa no máximo:
1 `findMany` "base" (bounded pelos filtros de `tenantId`/`tripId`/
`customerId`/período) + 1 `groupBy` de soma de pagamentos (Receivable/
Payable) + 1 `groupBy` de duplicidade + (somente quando há duplicidade
real) 1 `findMany` de detalhe. Nunca uma query por título/despesa/
categoria — confirmado por teste e2e com spy no Prisma Client (mesmo
número de chamadas com poucas e muitas despesas).

## Filtros

`tripId`/`customerId`/`from`/`to` são aplicados **no banco**, dentro do
`where` de cada detector (quando o detector tem o campo — `TripExpense`/
`Payable` não têm cliente, então `customerId` é ignorado nesses dois,
nunca inventando um resultado). `type`/`severity`/`entityType` são
propriedades do problema **calculado** (não existem como coluna) — só
podem ser filtrados em memória, depois de todos os detectores rodarem.

## Status NÃO persistido

Nada desta fase grava no banco. `detectedAt` é sempre o instante da
própria chamada HTTP — não existe histórico de quando um problema
"começou" a existir, nem confirmação de que foi resolvido. Chamar o
endpoint duas vezes sobre o mesmo estado de dados sempre retorna os mesmos
problemas (idempotente por natureza, já que é uma leitura pura).

## Frontend

- `/operations/finance/reconciliation` — cards de resumo (total/crítico/
  atenção/informativo + por origem), filtros (tipo/severidade/origem),
  tabela paginada, e botão "Ver viagem" por linha linkando para
  `/trips/:tripId` — **nenhuma rota nova foi inventada**; como não existe
  uma página de detalhe dedicada para `Receivable`/`Payable`/`TripBilling`
  isoladamente, a navegação usa a página da viagem (que já mostra
  faturamento, contas a receber/pagar e despesas nas abas Financeiro/
  Despesas desde as Fases 71-73).
- `/operations/finance/cash-flow` (Fase 74) ganhou um badge resumido no
  cabeçalho ("N inconsistência(s) crítica(s)" ou "Ledgers consistentes"),
  linkando para a página de conciliação — nenhum outro comportamento do
  fluxo de caixa foi alterado.
- Item de menu "Conciliação financeira" adicionado em Financeiro.

## Limitações conhecidas

1. **Duplicidade nunca observável em teste real** — as duas constraints
   únicas que tornam `DUPLICATE_RECEIVABLE`/`DUPLICATE_PAYABLE`
   estruturalmente quase impossíveis também impedem produzir esse estado
   via API para testá-lo fim a fim; os detectores foram validados por
   revisão de código e por typecheck/build, não por um caso positivo real.
2. **`customerId` não filtra `Payable`/`TripExpense`** — despesa não tem
   cliente no schema; o filtro é silenciosamente ignorado para esses dois
   detectores (retorno vazio, nunca um erro nem um resultado inventado).
3. **Sem correção automática** — por design explícito desta fase. O
   endpoint só informa; qualquer ajuste continua manual, pelos endpoints
   já existentes de `Receivable`/`Payable`/`TripBilling`/`TripExpense`.
4. **`RECEIVABLE_WITHOUT_BILLING`/`PAYABLE_WITHOUT_APPROVED_EXPENSE` não
   cobrem exclusão física** — como `Payable.expenseId`/
   `Receivable.billingId` têm `onDelete: Cascade`, excluir a despesa/
   faturamento de origem também remove o título (nunca deixa órfão); só o
   caminho de **cancelamento** (que preserva o título) é detectável.
5. **Sem paginação nos agrupamentos `byType`/`bySeverity`** — são listas
   pequenas por natureza (no máximo 11 e 3 itens respectivamente), não
   haveria benefício em paginar.

## Fora do escopo desta fase

Correção/geração automática de títulos, novo ledger financeiro,
integração bancária, PIX, boleto, CNAB, gateway de pagamento, conciliação
bancária real — nenhum desses foi implementado, conforme instruído.
