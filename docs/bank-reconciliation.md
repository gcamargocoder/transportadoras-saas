# Conciliação financeira e importação de movimentações bancárias (Fase 80)

## Objetivo

Primeira camada REAL de conciliação bancária: importar um extrato CSV como
movimentações **externas** (`FinancialBankTransaction`) e permitir
confrontá-las manualmente com o ledger interno já existente
(`FinancialTransaction`, Fase 78). **Não é outro ledger financeiro** — é
uma representação externa mais simples, usada só para comparação.

```
CSV bancário → FinancialBankTransaction → conciliação manual → FinancialTransaction existente
```

## `FinancialBankTransaction` vs `FinancialTransaction`

| | `FinancialTransaction` (Fase 78) | `FinancialBankTransaction` (Fase 80) |
| --- | --- | --- |
| Papel | Ledger interno oficial, append-only | Representação externa importada |
| Cria saldo? | Sim (soma o saldo de `FinancialAccount`) | **Nunca** |
| Como nasce | Transferência, ajuste manual, `ReceivablePayment`/`PayablePayment` (Fase 79) | Só por importação de CSV |
| Mutável | Não (nunca editada/apagada) | Só o vínculo (`financialTransactionId`/`status`) muda, via reconciliar/desconciliar |

`FinancialBankTransaction` **não copia** os campos de `FinancialTransaction`
— tem seu próprio conjunto mínimo (`date`, `description`, `amount`, `type`,
`externalId`, `status`, `financialTransactionId`, `metadata`).

## Importação CSV

`POST /finance/accounts/:id/bank-transactions/import` (multipart,
campo `file`). **Síncrono**: processa o CSV inteiro e devolve o resumo
(`rowsRead`/`imported`/`duplicates`/`invalid`/`errors`) na própria
resposta — sem job, sem fila, sem polling (diferente do `toll-import` da
Fase 46, que usa `ImportJob` para reprocessamento assíncrono; aqui não há
essa necessidade).

**O arquivo nunca toca o disco** — `multer` configurado com
`memoryStorage()` diretamente no controller (sem `MulterModule` novo, sem
config de storage). O buffer é descartado ao final da requisição.

Colunas aceitas (cabeçalho flexível, mesmo princípio do
`toll-import-header.util.ts`): `date`/`data`, `description`/`descricao`/
`historico`, `amount`/`valor`, `type`/`tipo` (`CREDIT`/`DEBIT`, aceita
`credito`/`debito`/`c`/`d`), `externalId`/`id`/`fitid` (opcional).

**Valor monetário nunca passa por `number` de JS antes de persistir** —
`parseMonetaryAmount` valida e normaliza a string (aceita `1.234,56` ou
`1234.56`) e o resultado (string) vai direto para a coluna `Decimal` do
Prisma.

Uma conta financeira **inativa** ainda pode receber importação — um
extrato histórico de uma conta hoje inativa continua sendo um dado real
(diferente da regra de `FinancialTransaction`/Fase 78, que bloqueia
movimentação em conta inativa).

## Duplicidade

- **Com `externalId`**: unicidade garantida por constraint no banco
  (`@@unique([tenantId, financialAccountId, externalId])` — `NULL` nunca
  colide, comportamento padrão do Postgres).
- **Sem `externalId`**: `rowHash` (SHA-256 de `data|descrição|valor|tipo`
  normalizados) usado como sinal de duplicidade, checado na aplicação (sem
  constraint no banco). **Isto é deliberadamente um mecanismo defensivo,
  não uma garantia de identidade** (seção 1 do pedido) — duas
  movimentações genuinamente diferentes, mas com mesma data/descrição/
  valor/tipo, produzem o mesmo hash e a segunda seria tratada como
  duplicata. Documentado como limitação conhecida.

## Conciliação manual

`GET /finance/bank-transactions/:id/candidates` — **somente leitura**,
nunca vincula. Retorna até 10 `FinancialTransaction` da mesma conta, mesmo
tipo, **mesmo valor exato**, com `transactionDate` numa janela de ±5 dias
da data bancária, e que ainda não estejam conciliadas com nenhuma outra
`FinancialBankTransaction`. A janela de 5 dias e o limite de 10 são
escolhas razoáveis para um extrato mensal típico — o pedido não especifica
um valor, documentado aqui por transparência.

`POST /finance/bank-transactions/:id/reconcile` (body: `financialTransactionId`)
— **10 validações antes de escrever** (seção 5 do pedido): existência/
tenant da movimentação e da transação, ambas ainda não conciliadas, mesma
conta, mesmo tipo, mesmo valor, período aberto. Escrita atômica (1 único
`UPDATE`).

### Fronteira entre "incompatível" (bloqueado) e "divergente" (permitido)

- **Bloqueado (409, nunca vinculado)**: conta diferente, tipo
  (CREDIT/DEBIT) diferente, ou valor diferente. Vincular qualquer um
  desses seria uma inconsistência contábil real, não uma "diferença para
  o usuário decidir depois" — por isso o endpoint rejeita, nunca cria o
  vínculo (seção 6 do pedido: "não permitir simplesmente vincular
  qualquer movimentação").
- **Permitido, mas sinalizado `DIVERGENT`**: **data** diferente entre a
  movimentação bancária e a `FinancialTransaction`. É a única dimensão de
  divergência realista neste cenário (banco processa/posta um dia ou dois
  depois do lançamento interno) que não compromete a integridade do
  vínculo — conta, tipo e valor já bateram exatamente. `status='MATCHED'`
  quando a data também bate.

Esta fronteira está documentada aqui porque o pedido lista os quatro
exemplos (conta/tipo/valor/data) juntos na seção 6, mas também pede
explicitamente um teste de "impedir divergência incompatível" (seção 17,
item 10) — a leitura mais coerente entre as duas seções é que nem toda
divergência é aceitável, e esta é a régua adotada.

## Desconciliação

`POST /finance/bank-transactions/:id/unreconcile` — remove **somente** o
vínculo (`financialTransactionId = null`, `status = PENDING`). Nunca
apaga `FinancialBankTransaction` nem `FinancialTransaction`, nunca altera
valores, nunca cria uma nova transação. Bloqueado se o período (da data
bancária) estiver `CLOSED`.

## Período financeiro (Fase 76)

`FinancialPeriodGuardService.assertPeriodOpenForDate` (mesmo guard, sem
alteração) é chamado com a **data da movimentação bancária** — tanto em
`reconcile` quanto em `unreconcile`. A importação em si **não** passa
pelo guard (não muta o ledger, só armazena um registro externo).

## Auditoria (Fase 77)

Reaproveita 100% o `AuditService`. Eventos: `financial_bank_transaction.imported`
(um por linha importada, mesmo princípio granular de `toll_transaction.imported`),
`financial_bank_transaction.reconciled`, `financial_bank_transaction.unreconciled`.
`FinancialBankTransaction` foi adicionado à allow-list de `GET /finance/audit`
(`FINANCE_AUDIT_ENTITY_NAMES`, Fase 77) — os eventos já aparecem lá sem
mudança adicional.

## Dashboard — nunca calcula saldo

`GET /finance/bank-transactions/dashboard` soma **as próprias**
`FinancialBankTransaction` por status (1 `groupBy`, nunca 1 query por
movimentação). **O saldo oficial da conta continua sendo
`FinancialAccount.currentBalance` (Fase 78) — `FinancialBankTransaction`
nunca participa desse cálculo**, mesmo depois de conciliada.

## Frontend

`/operations/finance/bank-reconciliation`: KPIs, filtros (conta/status/
tipo/período), tabela, modal de importação CSV (resumo mostrado na
própria resposta síncrona) e modal de detalhe/conciliação — mostra
"Movimentação bancária" vs "Transação interna" lado a lado quando
conciliada (divergência de data destacada visualmente), ou a lista de
candidatos com botão "Conciliar" quando pendente.

## Multi-tenancy

`tenantId` sempre no `WHERE` de toda consulta/mutação. Importar para
conta de outro tenant, consultar/conciliar/desconciliar movimentação de
outro tenant, ou conciliar usando uma `FinancialTransaction` de outro
tenant — todos retornam 404 (nunca vazam existência).

## RBAC

`BANK_RECONCILIATION_READ_ROLES`/`WRITE_ROLES` — mesmo grupo operacional
dos demais módulos financeiros. `AUDITOR` consulta mas nunca importa/
concilia/desconcilia (testado). `DRIVER` sem acesso.

## Performance / N+1

`GET /finance/bank-transactions`: 1 `findMany` + 1 `count` (testado com
`jest.spyOn`, independente da quantidade de movimentações). Candidatos:
1 `findMany` com `take: 10` (bounded, nunca um scan livre da conta).
Dashboard: 1 `groupBy`.

## Migration

Uma, aditiva: `20260824220000_bank_reconciliation` — 1 enum
(`financial_bank_transaction_status`) + 1 tabela
(`financial_bank_transactions`) + 2 índices únicos (`financialTransactionId`,
`tenantId+financialAccountId+externalId`) + 3 índices de consulta + 3 FKs.
Nenhuma tabela existente alterada — `FinancialTransaction` permanece
exatamente como a Fase 78/79 a deixou.

## O que NÃO foi implementado nesta fase

Open Finance, integração bancária, OFX, CNAB, PIX, boleto, gateway,
webhook, sincronização automática, conciliação automática definitiva
(matching sempre sugere, nunca vincula sozinho), IA, regras contábeis,
DRE, partidas dobradas, estorno, Redis, fila externa, serviço genérico de
idempotência, similaridade textual de descrição (candidatos filtram por
conta/tipo/valor/data — nunca por texto, para não inventar uma
dependência de fuzzy-matching sem necessidade clara).

## Limitações reais

- `rowHash` é best-effort — duas linhas legitimamente diferentes com
  mesma data/descrição/valor/tipo (sem `externalId`) seriam tratadas como
  duplicata.
- Candidatos exigem valor **exato** — uma divergência de centavos nunca
  aparece como sugestão (precisa ser encontrada manualmente via
  `financialTransactionId`, se o usuário já souber qual é).
- Sem edição de uma `FinancialBankTransaction` já importada (nome/valor
  errado no CSV original só é corrigido reimportando, se o extrato tiver
  `externalId` diferente, ou diretamente no banco).
