# Auditoria financeira, histórico de fechamento e controle de alterações (Fase 77)

## Objetivo

Aumentar a rastreabilidade das mutações financeiras **usando o mecanismo
de auditoria já existente** (`AuditLog`/`AuditService`, desde a Fase 1).
Esta fase **não cria um segundo sistema de auditoria, nem um ledger
novo** — apenas garante que os eventos certos já sejam gravados com
metadata suficiente, e expõe uma leitura filtrada sobre eles.

## Fonte da auditoria

Tudo continua vindo de `AuditLog` (`packages/database/prisma/schema.prisma`)
e do único ponto de escrita, `AuditService.log()`
(`apps/api/src/audit/services/audit.service.ts`). Nenhuma tabela nova,
nenhuma coluna nova.

A única mudança estrutural no `AuditService` foi **de leitura**: um novo
método `search(tenantId, filters, pagination)`, com filtros opcionais
(`entityNames`, `entityId`, `action`, `userId`, `from`/`to`), sempre
paginado no banco (`skip`/`take` + `count`). O método pré-existente
`findByEntity()` (usado por `GET /vehicles/:id/history`,
`GET /tenants/:id/history` etc.) passou a ser implementado **por cima**
de `search()` — mesma assinatura, mesmo comportamento, sem duplicar a
construção do `where`.

## Eventos financeiros

Todos já existiam antes desta fase (Fases 72/73/76) — **nenhum foi
renomeado**, mesmo o pedido desta fase sugerindo `payment_registered`: o
projeto já usa `payment_created`, e a regra da seção 3 é reaproveitar o
nome existente em vez de duplicar por preferência de nomenclatura.

| Entidade | Ações | Gerado em |
| --- | --- | --- |
| `Receivable` | `receivable.created`, `receivable.cancelled` | `ReceivablesService` |
| `ReceivablePayment` | `receivable.payment_created` | `ReceivablesService.registerPayment` |
| `Payable` | `payable.created`, `payable.cancelled` | `PayablesService` |
| `PayablePayment` | `payable.payment_created` | `PayablesService.registerPayment` |
| `FinancialPeriod` | `financial_period.created`, `financial_period.closed` | `FinancialPeriodsService` |

## Metadata (o que mudou nesta fase)

Auditado antes da Fase 77, mas **sem `paymentDate`** — corrigido:

- `receivable.payment_created` / `payable.payment_created` — `newValue`
  agora inclui `{ amount, paymentDate, paymentMethod, receivableId|payableId,
  newReceivedAmount|newPaidAmount, newStatus }`.
- `financial_period.closed` — `newValue` agora inclui
  `{ status, closedAt, year, month, criticalReconciliationIssues }` — a
  **contagem** de inconsistências `CRITICAL` usada para decidir o
  fechamento (reaproveitada de `FinanceReconciliationService`, Fase 75),
  nunca a lista completa nem um snapshot financeiro.
- `receivable.created` / `payable.created` / `financial_period.created` —
  já tinham metadata objetiva (`billingId`/`expenseId`, `tripId`,
  `originalAmount`, `dueDate` / `year`, `month`, `status`); nada mudou.
- Cancelamento (`receivable.cancelled` / `payable.cancelled`) — sem campo
  de motivo: `Receivable`/`Payable` não possuem esse campo no model nem no
  DTO de cancelamento, e a seção 4 do pedido proíbe inventar campo.

Metadata é sempre pequena e objetiva — nunca um snapshot financeiro
completo.

## `GET /finance/audit`

Não havia um endpoint genérico adequado (o único padrão existente,
`GET /<recurso>/:id/history`, exige um `id` de uma entidade específica).
Criado `GET /finance/audit`, montado no mesmo prefixo `/finance` dos
demais módulos financeiros (Fases 74–76):

- Filtros: `from`, `to`, `entityName` (restrito à allow-list financeira —
  ver abaixo), `entityId`, `action`, `userId`.
- Paginação: `page`/`pageSize` padrão do projeto.
- Ordenação: `createdAt DESC`.
- RBAC: `FINANCE_AUDIT_READ_ROLES` = mesmo grupo operacional amplo dos
  demais módulos financeiros (inclui `AUDITOR`); `DRIVER` nunca acessa
  (bloqueado pelo `@Roles`, testado explicitamente).
- Multi-tenant: `tenantId` sempre no `where`; um `entityId` de outro
  tenant nunca retorna linhas (a combinação `tenantId`+`entityId` nunca
  bate), então não é necessária uma consulta extra para "validar o
  entityId no tenant" — o próprio filtro já garante isso.

### Por que `entityName`, e não `entityType`

O pedido desta fase lista o filtro como `entityType`, mas a coluna real em
`AuditLog` é `entityName` (mesmo nome usado em todo o restante da API,
inclusive no endpoint `GET /vehicles/:id/history` já existente). Manter
`entityName` evita inventar um nome de campo que não existe no schema.

### Escopo financeiro (allow-list)

`GET /finance/audit` só aceita `entityName` dentre
`Receivable`, `ReceivablePayment`, `Payable`, `PayablePayment`,
`FinancialPeriod` (`FINANCE_AUDIT_ENTITY_NAMES`). Um valor fora dessa
lista é rejeitado com `400` — o endpoint nunca vira um backdoor genérico
para o `AuditLog` de outros módulos (frota, usuários, tenants etc.), que
continuam expostos apenas pelos seus próprios endpoints de histórico.

## Relação com `FinancialPeriod`

`GET /finance/periods/:id` agora retorna também `auditHistory`: os
eventos do **próprio período** (`financial_period.created`/`closed`,
filtrados por `entityName='FinancialPeriod'` + `entityId=<periodId>`).
Este é o **único vínculo estruturalmente seguro** entre `AuditLog` e
`FinancialPeriod` — é uma correspondência direta por `entityId`, nunca uma
heurística.

**Limitação documentada (seção 5 do pedido):** não existe um vínculo
estrutural seguro entre um evento de `Receivable`/`Payable`/
`ReceivablePayment`/`PayablePayment` e o `FinancialPeriod` ao qual sua
competência pertenceria. Fazer essa associação exigiria:
1. Ler a data de competência de dentro do JSON (`newValue.paymentDate` ou
   equivalente) de cada linha de auditoria — não é uma coluna, não pode
   ser filtrado/indexado no banco.
2. Casar essa data com o `year`/`month` de um `FinancialPeriod` — nunca
   garantido 1:1 (o período pode nem existir).

Isso é exatamente a "heurística frágil baseada em texto livre" que a
seção 5 pede para evitar. Por isso `GET /finance/audit` **não** tem filtro
`periodId`: para consultar os eventos de um período específico, use
`entityName=FinancialPeriod&entityId=<periodId>` (mesmo resultado do
`auditHistory` do detalhe) — não há um jeito seguro de estender isso a
`Receivable`/`Payable`.

**Por que nenhuma coluna `financialPeriodId` foi adicionada ao
`AuditLog`** (seção 16 do pedido, preferência explícita por nenhuma
migration): isso acoplaria um model genérico e usado por *todo* o sistema
(frota, usuários, tenants, fiscal...) a um conceito específico do módulo
financeiro, só para uma conveniência de consulta. O ganho não justifica o
acoplamento.

## Comportamento transacional

Analisado (não alterado — já estava correto): em toda mutação financeira,
`AuditService.log()` é chamado **depois** que a mutação já foi commitada
com sucesso (após o `$transaction` de pagamento, ou após o
`create`/`update` de título/período) — nunca antes, nunca dentro de um
bloco que ainda pode falhar depois. Se a mutação lança uma exceção (saldo
insuficiente, título já cancelado, período fechado etc.), a execução
nunca chega até `audit.log()` — não fica "auditoria fantasma" de uma
mutação que não aconteceu. Testado explicitamente (pagamento rejeitado
por saldo insuficiente não grava nenhum `AuditLog`).

Além disso, `AuditService.log()` nunca propaga exceção (captura e loga o
erro internamente) — uma falha ao gravar auditoria nunca derruba a
operação de negócio que a originou. Nenhuma mudança necessária aqui.

## Proteção do `AuditLog` (seção 9)

Confirmado, sem necessidade de alteração:
- Não existe nenhum endpoint `PATCH`/`PUT`/`DELETE` para `AuditLog` em
  nenhum módulo (testado explicitamente contra `/finance/audit/:id`).
- `AuditService` só expõe `log()` (escrita) e `findByEntity()`/`search()`
  (leitura) — nenhum método de atualização/exclusão.
- Toda consulta é tenant-scoped.

## Auditoria de tentativa bloqueada (seção 11)

**Não implementada.** O padrão atual do projeto não audita ações negadas
(nem RBAC 403, nem nenhuma outra rejeição) em nenhum módulo existente — a
seção 11 do pedido só pede essa auditoria "se o padrão atual já
registrar ações negadas", o que não é o caso. Criar esse mecanismo agora
seria inventar um padrão novo, fora do escopo desta fase.

## Performance / N+1

`GET /finance/audit` executa exatamente **1** `findMany` + **1** `count`
por chamada (verificado com `jest.spyOn`), com todos os filtros aplicados
no `where` do Prisma — nunca carrega tudo para filtrar em memória.
Nenhum índice novo foi criado: `AuditLog` já possui
`@@index([tenantId, entityName, entityId])` e `@@index([tenantId,
createdAt])` (desde a Fase 1), suficientes para os filtros desta fase
(`entityName`/`entityId` e ordenação por `createdAt`); `action`/`userId`
não têm índice dedicado — aceitável para o volume e uso (filtro
secundário, não a consulta principal).

## O que NÃO é auditado

- `TripBilling`/`TripExpense` (registros operacionais de origem) — já
  documentado como limitação da Fase 76, mantido.
- Tentativas de mutação bloqueadas por período fechado ou por RBAC (ver
  seção acima).
- Leituras (`GET`) de qualquer endpoint financeiro.

## Migration

**Nenhuma.** `AuditLog` já tinha estrutura suficiente (colunas, índices)
para tudo que esta fase precisou — confirmado antes de escrever qualquer
código, conforme a preferência explícita da seção 16 do pedido.
