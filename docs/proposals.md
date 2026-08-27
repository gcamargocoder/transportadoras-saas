# Propostas (Fase 95)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados os módulos das Fases 93/94: `Customer`/`CustomerContact`,
`Quotation`/`QuotationsService`/`FreightPricingService` e `AuditService`. Nenhuma entidade equivalente a
"Proposta" existia (grep completo em schema/`apps/api`/`apps/admin-web`/`docs` — só menções explícitas de
que "Propostas ficam para fases futuras").

### Reaproveitado sem duplicação

- **`AuditService.findByEntity`** — histórico/auditoria, mesmo padrão de
  `Vehicle`/`Tire`/`Maintenance`/`FiscalDocument`/`Tenant`/`Quotation` (`GET /proposals/:id/history`).
- **`runSerializable`** (`apps/api/src/tenants/utils/plan-limit.util.ts`, já usado por
  `Driver`/`Vehicle`/`Maintenance`/`FiscalDocument`/`User` para checagens concorrentes) — reaproveitado
  para gerar `Proposal.number` de forma sequencial e race-safe por tenant, sem inventar uma segunda
  lógica de retry/lock.
- **Motor de precificação (Fase 59)** — nunca duplicado. Quando a proposta é gerada a partir de uma
  `Quotation`, o valor vem do snapshot **já calculado** dela (`Quotation.amount`), nunca recalculado.
- **Imutabilidade da `Quotation` `APPROVED`** (Fase 94, `assertContentEditable`) — como só uma cotação
  `APPROVED` pode originar uma proposta, e nesse estado seu conteúdo já está congelado, a Proposal não
  precisa duplicar um segundo snapshot JSON dos dados da cotação (origem/destino/carga) — basta uma
  relação viva (`quotationId`), sempre segura de ler.
- **`Customer`/`CustomerContact`** — `customerId` obrigatório, validado como já existente no tenant.

### Estrutura genuinamente nova

Só o necessário: modelo `Proposal` + enum `ProposalStatus` (rota, DTOs, service, controller, mapper,
entity, frontend) — nada equivalente existia.

## 2. Modelo de dados (`Proposal`)

Campos obrigatórios: `customerId`, `number` (sequencial por tenant), `status` (default `DRAFT`),
`totalAmount`, `validUntil`, `issuedAt` (auto, `now()`). Opcionais: `quotationId`,
`commercialConditions`, `notes`, `decidedAt`.

`@@unique([tenantId, number])` — garante o identificador por tenant mesmo sob concorrência (ver seção 4).

Migração: `packages/database/prisma/migrations/20260901000000_proposals/` — puramente aditiva (uma
tabela nova, um enum novo, e relações reversas em `Tenant`/`Customer`/`Quotation`/`UserAccount`, que não
geram DDL). Nenhuma tabela existente foi alterada.

## 3. Ciclo de status

```
DRAFT --(SENT)--> SENT --(ACCEPTED)--> ACCEPTED [final, decidedAt gravado]
  |                 |
  |                 +--(REJECTED)--> REJECTED [final, decidedAt gravado]
  |                 +--(EXPIRED)--> EXPIRED [final]
  |                 +--(CANCELLED)--> CANCELLED [final]
  +--(CANCELLED)--> CANCELLED [final]
```

`DRAFT` é o **único** estado com conteúdo editável — a partir de `SENT`, `PATCH /proposals/:id` responde
`409` (regra explícita da fase: "impedir alterações incompatíveis depois de SENT/ACCEPTED/REJECTED/
EXPIRED/CANCELLED"). `EXPIRED` é um status real e explícito (diferente de `Quotation`, onde a validade é
só um campo derivado) — marcado manualmente via `PATCH /proposals/:id/status`, mesmo espírito do
`ContractStatus.EXPIRED` já existente no projeto (nenhum job automático nesta instalação). Além do
status, o campo `expired` (derivado de `validUntil < agora`) continua disponível para a UI destacar
visualmente uma proposta vencida mesmo antes de alguém marcá-la como `EXPIRED`.

## 4. Número por tenant

Não havia precedente de numeração sequencial no projeto (só campos livres como `invoiceNumber`, nunca
gerados automaticamente). Implementado em `ProposalsService.create`: dentro de `runSerializable`
(transação Postgres `Serializable`), lê o maior `number` do tenant e soma 1; o índice único
`(tenantId, number)` é o backstop contra corrida real — se duas criações concorrentes colidirem, o
Postgres aborta uma por falha de serialização e `runSerializable` tenta novamente automaticamente (uma
vez), sem nenhuma lógica de retry nova. Testado com criações sequenciais em dois tenants isolados.

## 5. Snapshot imutável

- **A partir de uma Quotation**: `totalAmount` = `quotation.amount`, `commercialConditions` =
  `quotation.conditions`, salvo quando o próprio pedido de criação sobrescreve explicitamente esses
  campos. Gravado uma única vez em `POST /proposals`.
- **Direta**: `totalAmount` obrigatório (`409` quando ausente sem `quotationId`) — nunca inventado.
- **Depois de gravado, nunca reprocessado automaticamente** — nem por edição da `Quotation` de origem
  (impossível de qualquer forma, já que só cotações `APPROVED`/imutáveis podem ser vinculadas), nem por
  qualquer job em segundo plano (não existe). Editar a própria `Proposal` (só em `DRAFT`) e trocar de
  `quotationId` **reprocessa deliberadamente** a partir da nova cotação (ação explícita do usuário, nunca
  silenciosa) — mesmo princípio já usado em `QuotationsService.update`.

## 6. Validade e decisão

- `validUntil`: obrigatório na criação, editável em `DRAFT`.
- `issuedAt`: sempre `now()` na criação, nunca editável.
- `decidedAt`: gravado automaticamente só nas transições para `ACCEPTED`/`REJECTED` — nunca informado
  manualmente, nulo para `EXPIRED`/`CANCELLED` (não são uma decisão do cliente) e enquanto
  `DRAFT`/`SENT`.

## 7. Conversão em viagem — explicitamente fora de escopo

A proposta **nunca** cria uma `Trip` nem aciona qualquer conversão automática (regra explícita da fase).
Isso continua sendo, quando fizer sentido no fluxo comercial, uma ação humana separada e posterior —
hoje já disponível a partir da própria `Quotation` de origem (`POST /quotations/:id/convert-to-trip`,
Fase 94), sem nenhuma alteração nesta fase.

## 8. Dados financeiros

Nenhum ledger, lançamento ou conta nova foi criado. `totalAmount`/`commercialConditions` são campos
descritivos do documento comercial, não transações financeiras — em nada colidem com
`Receivable`/`Payable`/`FinancialTransaction` (Fases 72–80), que continuam a única fonte real de
movimentação financeira do sistema.

## 9. APIs (`apps/api/src/proposals`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/proposals` | Lista (busca por número/cliente/condições, filtro cliente/cotação/status/período, paginação) |
| `GET` | `/proposals/:id` | Detalhe |
| `GET` | `/proposals/:id/history` | Histórico básico de alterações (AuditLog) |
| `POST` | `/proposals` | Cria (direta ou a partir de Quotation APPROVED) |
| `PATCH` | `/proposals/:id` | Edita (somente DRAFT) |
| `PATCH` | `/proposals/:id/status` | Transição de status |

RBAC: mesmo grupo operacional já usado por Freight/Quotations (`FREIGHT_READ_ROLES`/
`FREIGHT_WRITE_ROLES`, reaproveitados diretamente — leitura inclui `AUDITOR`, escrita não inclui
`DRIVER`). Sem gate de `TenantModule`, mesmo critério de CRM/Quotations.

## 10. Frontend (`apps/admin-web`)

- **`/proposals`**: listagem paginada, busca (número/cliente/condições), filtros por cliente/status/
  período, criação.
- **`/proposals/:id`**: valor total, emissão/validade/decisão, transições de status disponíveis, edição
  (somente DRAFT), cliente relacionado, cotação de origem (quando houver), condições comerciais,
  observações e histórico.
- **Navegação Cliente → Cotação → Proposta**: a página de detalhe da `Quotation` ganhou o botão "Gerar
  proposta" (visível quando `status = APPROVED`), que abre o formulário de proposta já com
  cliente/cotação preenchidos e navega para a proposta recém-criada; a página de detalhe da `Proposal`
  linka de volta ao cliente e à cotação de origem.
- Reaproveita integralmente `DataTable`/`Card`/`FilterBar`/`Modal`/`Pagination`/`StatCard`/
  `EntitySelect`/`Badge`/`DatePicker` já existentes — nenhum componente de UI genérico novo.

## 11. Performance / N+1

Listagem: filtros/busca/paginação inteiramente no banco, um único `include` (cliente, cotação de origem
com nomes de local, criador/atualizador) — sem consulta por linha. Testado: contagem de queries fixa
entre 5 e 20 propostas.

## 12. Limitações reais (documentadas, não escondidas)

- Sem conversão automática em viagem ou qualquer ligação com o financeiro (regras explícitas da fase).
- `EXPIRED` é sempre uma transição manual — não há job que marque propostas vencidas automaticamente
  (mesmo comportamento já aceito para `ContractStatus.EXPIRED` neste projeto).
- Trocar `quotationId` numa proposta em `DRAFT` não permite "desvincular" a cotação (voltar a
  `quotationId: null`) via `PATCH` — não solicitado nesta fase; a proposta pode ser recriada diretamente
  se isso for necessário.
- A busca por número (`search`) só reconhece dígitos puros como número exato — não há busca "contém"
  para números (ex.: buscar "12" não encontra a proposta #123), decisão deliberada para evitar
  ambiguidade entre "número da proposta" e "texto livre".

## 13. Testes

`apps/api/test/proposals.e2e-spec.ts` (15 testes, requests reais contra o Postgres): criação direta
(exigindo `totalAmount`) e a partir de cotação `APPROVED` (herdando valor/condições), rejeição de
cotação não aprovada ou de outro cliente, snapshot preservado mesmo tentando editar a cotação de origem
depois, numeração sequencial isolada por tenant, ciclo completo de status até `ACCEPTED` com `decidedAt`
automático, bloqueio de transição inválida, bloqueio de edição de conteúdo a partir de `SENT` e de
transições após estado final, transição explícita `SENT -> EXPIRED`, `expired` derivado independente do
status persistido, histórico básico, filtros/paginação (cliente/status/busca por número), isolamento
multi-tenant, RBAC (`DRIVER` bloqueado, `AUDITOR` só leitura) e ausência de N+1. Regressão executada em
`quotations.e2e-spec.ts` (14), `customer-crm.e2e-spec.ts` (14) e `freight.e2e-spec.ts` (19) — 47 testes,
diretamente afetados por dependerem de `Customer`/`Quotation`/`FreightPricingService` — todos passando
sem alteração.
