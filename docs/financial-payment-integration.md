# Integração de recebimentos e pagamentos com contas financeiras (Fase 79)

## Objetivo

Conectar os ledgers de títulos (`Receivable`/`Payable`, Fases 72/73) ao
ledger de contas financeiras (`FinancialAccount`/`FinancialTransaction`,
Fase 78), sem criar um terceiro ledger. A partir desta fase:

```
ReceivablePayment  →  FinancialTransaction CREDIT  →  FinancialAccount
PayablePayment     →  FinancialTransaction DEBIT   →  FinancialAccount
```

`FinancialTransaction` continua sendo a única fonte de verdade do saldo das
contas financeiras (`initialBalance + Σcréditos − Σdébitos`, Fase 78) —
nenhum valor é duplicado ou recalculado aqui.

## Conta financeira sempre explícita

`POST /receivables/:id/payments` e `POST /payables/:id/payments` agora
exigem `financialAccountId` no corpo da requisição
(`RegisterReceivablePaymentDto`/`RegisterPayablePaymentDto`). Nunca há
escolha automática (primeira conta, conta padrão, tipo arbitrário) — o
usuário sempre seleciona a conta explicitamente, tanto na API quanto no
formulário do admin-web (select "Conta financeira", populado só com contas
`isActive=true` do tenant atual).

Validado antes de qualquer escrita (reaproveitando
`FinancialAccountsService.assertActiveAndTenant`, já existente desde a
Fase 78 — nenhuma lógica de validação duplicada): a conta existe, pertence
ao tenant atual e está ativa.

## Atomicidade

Cada registro de pagamento roda em **uma única** transação Prisma
(`$transaction`) que executa, nesta ordem:

1. CAS (compare-and-swap) no saldo do título (ver seção Concorrência);
2. criação do `ReceivablePayment`/`PayablePayment`;
3. criação da `FinancialTransaction` (CREDIT/DEBIT);
4. atualização do payment com `financialTransactionId` apontando para a
   transação recém-criada.

Se qualquer passo falhar, a transação inteira é revertida — nunca existe
um `ReceivablePayment`/`PayablePayment` sem a `FinancialTransaction`
correspondente, nem o contrário. Testado explicitamente: conta inativa,
conta de outro tenant e valor acima do saldo não deixam nenhum registro
órfão (nem payment, nem transaction).

**`FinancialTransaction.amount` nem sempre é igual a `payment.amount`**
desde a Fase Financeiro CP/CR (juros/multa/desconto, ver
`docs/payables.md`/`docs/receivables.md`): quando o pagamento tem
`interestAmount`/`fineAmount`, a `FinancialTransaction` reflete o valor
**real** movimentado (`amount + interestAmount + fineAmount`) — juros/multa
são cobrança adicional, não abatem o saldo do título, mas são caixa de
verdade. `discountAmount` nunca aparece na `FinancialTransaction` (abate o
saldo do título, mas nenhum dinheiro correspondente se move).

## Vínculo bidirecional (sem identificador paralelo)

Dois campos, cada um resolvendo uma direção da mesma relação — não duas
formas independentes de representar a mesma coisa:

- `ReceivablePayment.financialTransactionId` / `PayablePayment.financialTransactionId`
  (novo, `@unique`, nullable) — aponta do pagamento para a transação que
  ele gerou. Usado pelo detalhe do título (`GET /receivables/:id`,
  `GET /payables/:id`) para mostrar "conta financeira utilizada" e a
  transação relacionada **sem consulta adicional** (já incluído no mesmo
  `include` do Prisma).
- `FinancialTransaction.referenceType`/`referenceId` (já existente desde a
  Fase 78, reaproveitado) — `referenceType='ReceivablePayment'|'PayablePayment'`,
  `referenceId=<payment.id>`. Usado pela tela de detalhe da conta
  financeira (`/operations/finance/accounts/:id`) para rotular cada
  movimentação como "Recebimento"/"Pagamento" sem precisar voltar ao
  título de origem.

A constraint `@unique` em `financialTransactionId` é a barreira de
unicidade no banco (seção 8 do pedido): nenhum outro payment pode apontar
para a mesma `FinancialTransaction` — testado tentando criar um segundo
`PayablePayment` reutilizando o `financialTransactionId` de outro (rejeitado
com violação de constraint).

`financialAccountId`/`financialTransactionId` são **nullable** em ambos os
models — pagamentos registrados antes desta fase nunca tiveram conta
financeira vinculada, e essa lacuna nunca é preenchida retroativamente
(nenhuma migration de backfill).

## Período financeiro (Fase 76)

`FinancialPeriodGuardService.assertPeriodOpenForDate` (mesmo guard, sem
alteração) é chamado com `paymentDate` — nunca `createdAt`, nunca a
`issueDate`/`dueDate` do título. Período `CLOSED` bloqueia a operação
inteira (payment + transaction juntos, por estarem na mesma transação
Prisma) antes de qualquer escrita.

## Concorrência (sem lock distribuído/Redis)

O saldo do título (`receivedAmount`/`paidAmount`) é protegido por um CAS
(compare-and-swap) dentro da transação Prisma: o `UPDATE` usa o valor lido
**antes** da transação como condição do `WHERE`
(`updateMany({ where: { id, receivedAmount: <valor lido> }, ... })`). Se
outra requisição concorrente já alterou esse valor entretanto, `count`
volta `0` e a operação inteira é revertida com `409 Conflict` — o cliente
precisa reler o saldo atual e tentar novamente. Isso usa a própria coluna
como token de concorrência (optimistic locking), sem lock distribuído, sem
Redis, sem fila externa. Testado com duas requisições simultâneas de
pagamento que juntas ultrapassariam o saldo: nunca as duas retornam `201`.

## Cancelamento — sem estorno automático

`POST /receivables/:id/cancel` e `POST /payables/:id/cancel` **não foram
alterados** nesta fase: continuam bloqueando novos pagamentos e preservando
o histórico. Cancelar um título **não** apaga, edita nem reverte a
`FinancialTransaction` já criada por um pagamento anterior — o saldo da
conta financeira permanece refletindo o dinheiro que de fato
entrou/saiu. Se um título pago precisar de estorno financeiro, isso exige
uma operação explícita (uma nova `FinancialTransaction` de sentido
contrário) — fora do escopo desta fase, deliberadamente não implementada
(ver seção "Não fazer" do pedido).

## Auditoria (Fase 77)

Nenhum evento novo: `receivable.payment_created`/`payable.payment_created`
continuam sendo os únicos eventos gravados (reaproveitando `AuditService`,
sem mecanismo paralelo). A `metadata` (`newValue`) passou a incluir
`financialAccountId` e `financialTransactionId`, além dos campos já
existentes (`amount`, `paymentDate`, `paymentMethod` etc.).

## Saldo das contas financeiras e dashboards

Nenhuma alteração em `GET /finance/accounts/dashboard` nem em
`GET /finance/cash-flow` — ambos já calculavam o que precisavam a partir
das fontes corretas (a primeira, de `FinancialTransaction`; a segunda, dos
ledgers de `Receivable`/`Payable`). Como pagamentos agora geram
`FinancialTransaction` de verdade, o saldo das contas em
`/finance/accounts` passa a refletir o fluxo real automaticamente — sem
nenhuma mudança de cálculo.

**`projectedNetBalance` (fluxo de caixa, Fase 74) continua sendo uma
projeção sobre títulos em aberto — nunca um saldo bancário real.** O saldo
real agora alimentado por pagamentos de verdade é
`FinancialAccount.currentBalance` (Fase 78), exposto em
`/operations/finance/accounts`. Os dois conceitos continuam
propositalmente separados, nunca fundidos numa mesma métrica (mesma
decisão documentada em `docs/financial-accounts.md`).

## Frontend

- `RegisterPaymentModal` (recebíveis) e `PayableRegisterPaymentModal`
  (pagáveis): novo select obrigatório "Conta financeira", populado com
  `GET /finance/accounts?isActive=true`. Confirmação após o registro
  inclui valor, conta e data.
- `ReceivableDetailModal`/`PayableDetailModal`: cada linha do histórico de
  pagamentos mostra a conta financeira utilizada (link para
  `/operations/finance/accounts/:id`) quando disponível — sem consulta
  adicional (já vem no mesmo payload de `GET /receivables/:id` /
  `GET /payables/:id`).
- `/operations/finance/accounts/:id`: cada movimentação com
  `referenceType='ReceivablePayment'|'PayablePayment'` ganha um rótulo
  ("Recebimento"/"Pagamento"). **Sem link de navegação para o título de
  origem**: o admin-web não tem uma rota dedicada para abrir um
  Receivable/Payable específico (a UI de ambos é só modal, aberto a partir
  da respectiva listagem) — mostrar apenas o rótulo + a referência
  (`referenceId`) evita inventar uma rota que não existe (seção 16 do
  pedido).

## Multi-tenancy

`financialAccountId` é validado contra o tenant atual
(`FinancialAccountsService.assertActiveAndTenant`) — uma conta de outro
tenant nunca é encontrada (404), mesmo com um `financialAccountId`
sintaticamente válido manipulado diretamente na requisição. Testado
explicitamente.

## Migration

Uma, aditiva: `20260824180000_financial_payment_integration` — duas
colunas nullable (`financial_account_id`, `financial_transaction_id`) +
dois índices únicos + quatro FKs, em `receivable_payments` e
`payable_payments`. Nenhuma linha existente é alterada. Confirmado com
`prisma migrate status` → "Database schema is up to date!".

## O que NÃO foi implementado nesta fase

Estorno automático, conciliação bancária, Open Finance, OFX, CNAB, PIX,
boleto, gateway, importação de extrato, conciliação automática, webhook
bancário, integração bancária externa, conta contábil, DRE, partidas
dobradas, Redis, fila externa, serviço de idempotência genérico.
