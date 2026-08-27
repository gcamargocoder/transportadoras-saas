# Pipeline Comercial (Fase 96)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados os módulos das Fases 93–95: `Customer`/`CustomerContact`,
`Quotation`/`QuotationsService`, `Proposal`/`ProposalsService`, `AuditService` e `runSerializable`
(`tenants/utils/plan-limit.util.ts`). Nenhuma entidade equivalente a "PipelineOpportunity" ou estágio de
funil existia (grep completo em schema/`apps/api`/`apps/admin-web`/`docs`).

### Reaproveitado sem duplicação

- **`Customer`/`Quotation`/`Proposal`** — `PipelineOpportunity` só guarda vínculos (`customerId`
  obrigatório, `quotationId`/`proposalId` opcionais) e valida existência/propriedade via consulta direta
  ao Prisma, mesmo padrão leve já usado por `QuotationsService`/`ProposalsService` (nunca importa
  `CustomersModule`/`QuotationsModule`/`ProposalsModule`).
- **`AuditService.findByEntity`** — histórico/auditoria de mudanças de estágio e conteúdo, mesmo padrão
  de `Vehicle`/`Quotation`/`Proposal` (`GET /pipeline/opportunities/:id/history`).
- **`runSerializable`** — reaproveitado para seedar o conjunto inicial de estágios de forma race-safe
  (`PipelineStagesService.ensureDefaultStages`), mesmo mecanismo já usado para `Proposal.number` (Fase 95).
- **Motor de precificação (Fase 59)** — nunca duplicado. `estimatedValue` é herdado de
  `Proposal.totalAmount`/`Quotation.amount` (valores já calculados), nunca recalculado.
- **Nenhum dado financeiro** — `estimatedValue` é um número descritivo da oportunidade; nenhuma
  `Receivable`/`Payable`/`FinancialTransaction`/ledger é criada, lida ou referenciada em todo o módulo.
- **Padrão de swap de duas fases** (`TripDeliveryStopsService.reorder`, Fase 88) — reaproveitado para
  reordenar estágios sem colidir com a constraint única `(tenantId, order)`.

### Estrutura genuinamente nova

`PipelineStage` (estágios configuráveis por tenant — não existia nenhuma tabela de estágio/funil) e
`PipelineOpportunity` (a oportunidade em si) — nada equivalente existia.

## 2. Por que estágio é uma TABELA, não um enum

Diferente de `QuotationStatus`/`ProposalStatus` (enums fixos do Postgres), a fase exige estágios
**configuráveis por tenant** — um enum é global e não pode ser customizado por tenant. `PipelineStage` é
uma tabela `(tenantId, name, order, isWon, isLost, isActive)`, com `@@unique([tenantId, order])`. Todo
tenant recebe o conjunto inicial padrão (**LEAD, QUOTATION → "Cotação", PROPOSAL → "Proposta",
NEGOTIATION → "Negociação", WON → "Ganho", LOST → "Perdido"**) na primeira vez que qualquer rota do
pipeline é acessada (`ensureDefaultStages`, idempotente); depois disso, o tenant é livre para
renomear/reordenar/inativar ou criar novos estágios (`POST`/`PATCH /pipeline/stages`). Um estágio nunca é
apagado (`onDelete: Restrict` a partir de `PipelineOpportunity`) — inativar (`isActive=false`) é a forma
de "removê-lo" da UI sem perder o histórico de oportunidades que já passaram por ele.

`isWon`/`isLost` são os únicos sinalizadores usados para decidir comportamento (nunca o nome do
estágio) — um tenant pode renomear "Ganho" para "Fechado/Won" sem quebrar nenhuma regra.

## 3. Transições válidas

- Qualquer oportunidade em um estágio **não terminal** (`isWon=false` e `isLost=false`) pode mover para
  **qualquer outro estágio ativo** do tenant — inclusive pulando etapas (ex.: LEAD direto para GANHO),
  sem exigir progressão sequencial (não pedido pelo escopo, e pipelines reais frequentemente pulam
  etapas).
- Uma oportunidade em um estágio **terminal** (`isWon` ou `isLost`) **nunca** sai dele — `PATCH
  /pipeline/opportunities/:id/stage` responde `409`. O mesmo vale para edição de conteúdo (`PATCH
  /pipeline/opportunities/:id`) — um fechamento preserva o registro tal como estava no momento.
- Mover para um estágio com `isLost=true` **exige `reason`** no corpo da requisição (`400` quando
  ausente) — regra explícita da fase.
- `wonAt`/`lostAt` são **sempre** derivados da própria transição (nunca informados manualmente).

## 4. Valor estimado — nunca um dado financeiro

`estimatedValue` é um campo puramente descritivo da oportunidade:

1. Se informado explicitamente na criação/edição, prevalece sempre.
2. Senão, quando há `proposalId`, herda `Proposal.totalAmount`.
3. Senão, quando há `quotationId`, herda `Quotation.amount`.
4. Sem nenhum vínculo, fica `null` — nunca um valor inventado.

Nenhuma conta a receber/pagar, lançamento financeiro ou ledger é criado, lido ou referenciado por esse
campo — ele nunca alimenta nem é alimentado pelo financeiro real do sistema (Fases 72–80).

## 5. APIs (`apps/api/src/pipeline`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/pipeline/stages` | Lista estágios do tenant (cria o conjunto inicial no primeiro acesso) |
| `POST` | `/pipeline/stages` | Cria um novo estágio |
| `PATCH` | `/pipeline/stages/:id` | Renomeia/reordena (swap)/reclassifica/ativa-inativa |
| `GET` | `/pipeline/opportunities` | Lista (busca, filtro cliente/estágio/período, ordenação, paginação) |
| `GET` | `/pipeline/opportunities/:id` | Detalhe |
| `GET` | `/pipeline/opportunities/:id/history` | Histórico básico de alterações (AuditLog) |
| `POST` | `/pipeline/opportunities` | Cria, vinculando cliente e, quando aplicável, cotação/proposta |
| `PATCH` | `/pipeline/opportunities/:id` | Edita conteúdo (bloqueado em estágio terminal) |
| `PATCH` | `/pipeline/opportunities/:id/stage` | Move de estágio (`reason` obrigatório para perda) |
| `GET` | `/pipeline/board` | Kanban: colunas por estágio, com totais reais e amostra de cartões |
| `GET` | `/pipeline/dashboard` | Dashboard simples: abertas, valor aberto, ganhas, perdidas, conversão |

RBAC: mesmo grupo operacional já usado por Freight/Quotations/Proposals (`FREIGHT_READ_ROLES`/
`FREIGHT_WRITE_ROLES`, reaproveitados diretamente). Sem gate de `TenantModule`, mesmo critério de
CRM/Quotations/Proposals.

## 6. Frontend (`apps/admin-web`)

- **`/operations/commercial/pipeline`**: cartões de dashboard (abertas, valor estimado aberto, ganhas,
  perdidas, conversão) + alternância **Kanban/Lista**. O Kanban é somente leitura com ação de mover (sem
  drag-and-drop — este projeto não usa nenhuma biblioteca de DnD em nenhuma outra tela; mover estágio é
  um menu de ações, mesmo espírito de botões usado por `DeliveryStopsTab` para reordenar paradas). A
  Lista reaproveita `DataTable`/`FilterBar`/`Pagination` com busca, filtro por cliente/estágio e
  paginação server-side.
- **`/operations/commercial/pipeline/:id`**: cliente, cotação/proposta relacionadas (com navegação),
  estágio atual, valor estimado, datas de ganho/perda, motivo da perda quando houver, observações,
  ações de mover estágio/editar e histórico.
- Reaproveita integralmente `DataTable`/`Card`/`FilterBar`/`Modal`/`Pagination`/`StatCard`/
  `EntitySelect`/`Badge`/`Dropdown` já existentes — nenhum componente de UI genérico novo (o menu de
  mover estágio é montado com `Dropdown` já existente).

## 7. Performance / N+1

- Listagem: filtros/busca/ordenação/paginação inteiramente no banco, um único `include`.
- Board/Dashboard: nunca uma query por oportunidade — `groupBy` (contagem e soma de `estimatedValue`
  por estágio) e um único `findMany` com `take` limitado (`PIPELINE_BOARD_CARDS_CAP = 300`) para a
  amostra de cartões do Kanban, agrupada em memória por estágio. Testado: contagem de queries fixa entre
  5 e 20 oportunidades tanto para a listagem quanto para board/dashboard.

## 8. Limitações reais (documentadas, não escondidas)

- **Sem rentabilidade nem renovação de contratos** (regras explícitas da fase — ficam para fases
  futuras).
- **Sem drag-and-drop no Kanban** — mover estágio é uma ação explícita (menu), não arrastar o cartão;
  decisão deliberada para não introduzir a primeira dependência de DnD do projeto.
- **Kanban limitado a uma amostra de 300 cartões no total** (`PIPELINE_BOARD_CARDS_CAP`) — tenants com
  mais oportunidades abertas que isso não veem todas no board; a listagem paginada continua sendo a
  fonte completa e sem limite.
- **Transições não exigem progressão sequencial** — qualquer estágio não-terminal pode ir para qualquer
  outro estágio ativo (inclusive terminal), decisão deliberada para não travar casos reais de venda
  rápida ou reclassificação.
- **Reordenar estágios faz um swap simples** (troca de posição com outro estágio) quando a nova posição
  já está ocupada — não há renumeração em cascata de toda a sequência.

## 9. Testes

`apps/api/test/pipeline.e2e-spec.ts` (21 testes, requests reais contra o Postgres): criação do conjunto
inicial de estágios, criação/renomeação/reordenação (swap) de estágios, rejeição de estágio
isWon+isLost simultâneo, criação direta e vinculada a cotação/proposta (com herança de valor e rejeição
de vínculo de outro cliente), valor explícito sempre prevalecendo, transições livres entre estágios
abertos, bloqueio de saída de estágio terminal, bloqueio de edição de conteúdo em estágio terminal,
estágio inativo rejeitando novas oportunidades e movimentação, motivo obrigatório ao mover para
perda (com `lostAt`/`lostReason` gravados), `wonAt` gravado ao ganhar sem exigir motivo, histórico
básico, filtros/paginação/ordenação, dashboard (contagens/somas/conversão) e board (totais reais por
coluna), isolamento multi-tenant, RBAC (`DRIVER` bloqueado, `AUDITOR` só leitura) e ausência de N+1
(listagem, board e dashboard). Regressão executada em `customer-crm.e2e-spec.ts` (14),
`quotations.e2e-spec.ts` (14) e `proposals.e2e-spec.ts` (15) — 43 testes, diretamente afetados por
dependerem de `Customer`/`Quotation`/`Proposal` — todos passando sem alteração.
