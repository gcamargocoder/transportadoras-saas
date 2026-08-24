# Contas financeiras, saldos e movimentações manuais (Fase 78)

## Objetivo

Primeira camada estrutural de contas financeiras (bancárias/caixa) da
transportadora — saldo inicial, movimentações manuais (crédito/débito),
transferência entre contas e saldo atual calculado. **Nenhuma integração
bancária** (sem OFX/CNAB/PIX/Open Finance, sem importação de extrato, sem
conciliação bancária automática) e **nenhuma sincronização automática** com
`ReceivablePayment`/`PayablePayment` — é um livro-caixa manual.

## `FinancialAccount`

Campos mínimos do pedido, mais identificação bancária **opcional** e nunca
sensível: `bankName`, `bankCode`, `accountNumberMasked` (nunca senha, token
ou credencial de acesso — o model não tem coluna para isso, de propósito).

`initialBalance` é fixado na criação (`POST /finance/accounts`) e **nunca**
alterado depois — nem `UpdateFinancialAccountDto` nem nenhum endpoint
expõem esse campo para escrita. Não gera `FinancialTransaction` automática
para representar o saldo inicial (seção 5 do pedido): o saldo inicial entra
direto na fórmula do saldo atual (ver abaixo), sem precisar de uma linha de
ledger correspondente. Se o valor cadastrado estiver errado, a correção é
uma `FinancialTransaction` de ajuste (`CREDIT`/`DEBIT`), nunca um `PATCH`
no campo.

`type` (`BANK`/`CASH`) também é imutável após a criação — só existem esses
dois tipos; PIX/cartão/boleto são meios de pagamento, não contas
financeiras (seção 2 do pedido), e não têm representação aqui.

`isActive` só muda via `POST /finance/accounts/:id/activate` /
`.../deactivate` (nunca pelo `PATCH` genérico) — desativar preserva o
histórico, nunca exclui.

## `FinancialTransaction`

Ledger **append-only**, mesmo espírito de `ReceivablePayment`/
`PayablePayment` (Fases 72/73): nenhum endpoint de `PATCH`/`DELETE` existe
para uma transação (testado explicitamente). `amount` é sempre positivo — o
sentido (entrada/saída) é `type` (`CREDIT`/`DEBIT`), nunca um valor
negativo.

**O saldo nunca é materializado** em nenhuma coluna: sempre calculado como

```
saldo atual = initialBalance + SUM(CREDIT) − SUM(DEBIT)
```

no momento da consulta (`utils/account-balance.util.ts`), evitando duas
fontes de verdade divergentes (o mesmo motivo que rege
`FinancialPeriod` desde a Fase 76). Saldo **negativo é permitido** — o
projeto não tem conceito de limite/cheque especial, e a seção 6 do pedido
pede exatamente esse comportamento por padrão.

## Transferência entre contas

`POST /finance/transfers` cria **duas** `FinancialTransaction` (uma
`DEBIT` na origem, uma `CREDIT` no destino) dentro da mesma transação
Prisma (`$transaction`) — se qualquer uma falhar, nenhuma das duas fica
gravada (testado: origem/destino iguais, conta inexistente e conta inativa
não deixam nenhuma linha órfã).

Não foi criada uma tabela `FinancialTransfer` dedicada (seção 4 do
pedido: preferir a solução mais simples). As duas linhas são vinculadas
pelos campos genéricos `referenceType`/`referenceId`, já previstos para
vínculo futuro (seção 12): `referenceType = 'FinancialTransfer'` e
`referenceId` = um UUID gerado na hora (`transferId`), comum às duas.
Uma transferência nunca é tratada como receita/despesa — é puramente uma
movimentação entre dois saldos do mesmo tenant.

Regras aplicadas (seção 4/9): origem ≠ destino, `amount > 0` (validado no
DTO), ambas as contas do mesmo tenant (o filtro `WHERE tenantId = ...`
garante isso — uma conta de outro tenant nunca é encontrada), ambas ativas.

## Períodos financeiros (Fase 76)

`FinancialPeriodGuardService.assertPeriodOpenForDate` (mesmo guard das
Fases 76/77, reaproveitado sem alteração) é chamado com a `transactionDate`
antes de criar uma `FinancialTransaction` manual ou uma transferência.
Período `CLOSED` bloqueia; período inexistente permite (regra inalterada
da Fase 76). A criação/atualização/ativação/desativação da **conta em si**
nunca depende do período — só a movimentação.

## Auditoria (Fase 77)

Reaproveita 100% o `AuditService` já existente — nenhum mecanismo novo.
Eventos gravados: `financial_account.created`, `.updated`, `.activated`,
`.deactivated`, `financial_transaction.created`, `financial_transfer.created`
(este último com `entityName='FinancialTransfer'` e `entityId=transferId`).
Metadata é sempre pequena e objetiva (conta, tipo, valor, data,
origem/destino) — nunca senha, token ou credencial.

`FinancialAccount`/`FinancialTransaction`/`FinancialTransfer` foram
adicionados à allow-list de `GET /finance/audit`
(`FINANCE_AUDIT_ENTITY_NAMES`, Fase 77) — os eventos desta fase já
aparecem nessa tela sem nenhuma mudança adicional no endpoint de
auditoria.

## `GET /finance/accounts` e dashboard — sem N+1

Saldo de uma página inteira de contas é calculado com **uma única**
consulta `groupBy` (`accountId`, `type`, `SUM(amount)`) para todos os ids
da página, nunca uma consulta por conta
(`utils/account-balance.util.ts:sumTransactionsByAccount`, testado com
`jest.spyOn`). `GET /finance/accounts/dashboard` soma todas as contas do
tenant (ativas e inativas — uma conta inativa ainda representa dinheiro
real) em exatamente 2 consultas (1 `findMany` + 1 `groupBy`),
independente da quantidade de contas.

## Fluxo de caixa (Fase 74) — nunca fundido

`GET /finance/cash-flow` (`projectedNetBalance`) continua representando
**projeção** sobre os ledgers de `Receivable`/`Payable` em aberto — nunca
um saldo bancário real. O saldo desta fase (`FinancialAccount.currentBalance`)
é uma métrica **diferente e separada**, mostrada só em
`/operations/finance/accounts`. Nenhum dos dois nomes foi reaproveitado
para o outro conceito, de propósito (seção 13 do pedido).

## Por que `ReceivablePayment`/`PayablePayment` ainda não geram
## `FinancialTransaction` automaticamente

Fora de escopo nesta fase (seção 12 do pedido): a conversão automática
exigiria decidir qual conta recebeu/pagou, tratar conciliação, estorno e
duplicidade — decisões que merecem uma fase própria. Por enquanto,
`FinancialTransaction` tem `referenceType`/`referenceId` genéricos prontos
para esse vínculo futuro, mas nada os preenche automaticamente hoje.

## RBAC

`FINANCIAL_ACCOUNT_READ_ROLES`/`FINANCIAL_ACCOUNT_WRITE_ROLES` — mesmo
grupo operacional amplo dos demais módulos financeiros (leitura inclui
`AUDITOR`; escrita não). `DRIVER` nunca acessa nenhuma rota deste módulo
(testado).

## Multi-tenancy

`tenantId` sempre no `WHERE` de toda consulta/mutação. Transferência exige
`source.tenantId === destination.tenantId === tenant atual` — uma conta de
outro tenant simplesmente não é encontrada (404), nunca vaza saldo ou
existência.

## Idempotência (seção 19)

O projeto não possui `deviceEventId`/`idempotencyKey` genérico aplicável a
mutações administrativas web (esse padrão existe hoje só no fluxo
offline-first do app do motorista) — nenhuma infraestrutura nova foi
criada só para isto, conforme a seção 19 pede explicitamente. A
atomicidade da transferência (a garantia que a seção 19 exige de fato) é
sempre respeitada via `$transaction`; um duplo clique no frontend ainda
pode gerar duas transferências caso o usuário confirme duas vezes — mesma
limitação que outros formulários de mutação financeira já têm hoje (ex:
registrar pagamento).

## Migration

Uma migration foi necessária (seção 16: nenhum model equivalente existia
no schema) — `20260824120000_financial_accounts`, puramente aditiva: dois
enums (`financial_account_type`, `financial_transaction_type`) e duas
tabelas (`financial_accounts`, `financial_transactions`). Índices criados
exatamente os do pedido, nenhum especulativo: `tenantId`,
`tenantId+type` e `tenantId+isActive` em `FinancialAccount`; `tenantId`,
`accountId+transactionDate` e `tenantId+type` em `FinancialTransaction`.

## O que NÃO foi implementado nesta fase

Open Finance, integração bancária, OFX, CNAB, PIX, boleto, cartão,
conciliação bancária automática, importação de extrato, conta contábil,
plano de contas, DRE, partidas dobradas, gateway, webhook bancário, saldo
bancário externo, sincronização automática `ReceivablePayment`/
`PayablePayment` → `FinancialTransaction`, edição/exclusão de
`FinancialTransaction`, e auditoria de tentativas de mutação bloqueadas
(mesma limitação documentada na Fase 77 — o projeto não audita ações
negadas em nenhum módulo).
