# Renovação de Contratos (Fase 98)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados: `Contract`/`ContractsService`/`ContractsController` (Fase 59),
`Customer`/`CustomerContact`/`CustomerNote` (Fase 93), `FreightRulesService.revise` (Fase 59 — padrão de
versionamento preservando histórico), `NotificationsService`/`NotificationsProcessingScheduler` (Fases
69–70) e `resolveDocumentExpiryStatus` (`fleet/utils/document-expiry.util.ts`, Fase 62). Nenhuma estrutura
de renovação de contrato existia (grep completo em `schema.prisma`/`apps/api`/`apps/admin-web`/`docs`).

### Reaproveitado sem duplicação

- **`Contract`** — nenhuma coluna própria foi alterada. `ContractRenewal` é uma tabela satélite que só
  referencia `Contract` (contrato anterior obrigatório, novo contrato opcional até a conclusão) — mesmo
  espírito de `CustomerContact`/`CustomerNote` (Fase 93), que são satélites de `Customer` sem constituir
  "outro cadastro de cliente".
- **`ContractsService.create`/`.update`** — o novo contrato criado ao concluir uma renovação é um
  `Contract` real, criado através do próprio serviço já existente (nunca um segundo sistema de
  contratos, regra 2). O contrato anterior é marcado `EXPIRED` através do mesmo `.update()`.
- **`resolveDocumentExpiryStatus`** (`fleet/utils/document-expiry.util.ts`) — reaproveitado diretamente
  para classificar "vencendo/vencido", com o mesmo limiar padrão de 30 dias já usado por
  `cnhExpiringThreshold` (motoristas) e pelos alertas de documento de veículo. Nenhum segundo conceito de
  limiar foi criado.
- **`FreightRulesService.revise`** (Fase 59) — padrão direto para "nunca mutar o registro em uso; fechar
  e criar um novo vinculado" — aqui adaptado para contratos: o contrato anterior nunca é reescrito em
  `startDate`/`endDate`/`commercialTerms`/`notes` (regra 3); a "nova versão" é o novo `Contract` criado
  na conclusão, e o vínculo fica em `ContractRenewal.newContractId`.
- **`NotificationsService.collectCandidates`/`processTenant`/`processAllTenants`** — reaproveitados
  integralmente. Foi adicionado um único novo coletor privado (`collectContractsExpiring`) e um novo
  valor de enum (`NotificationType.CONTRACT_EXPIRING`), seguindo exatamente o mesmo padrão dos ~10
  coletores existentes (uma query batched, nunca uma segunda lógica de detecção). Nenhum mecanismo novo
  de notificação foi criado (regra 7).
- **`AuditService`** — toda ação (iniciar/concluir/cancelar) é auditada, mesmo padrão de
  `Contract`/`FreightRule`/`PipelineOpportunity`.
- **`FREIGHT_READ_ROLES`/`FREIGHT_WRITE_ROLES`** — reaproveitados diretamente (mesmo grupo já usado por
  `ContractsController`), sem criar um novo grupo de papéis para este módulo.
- **`@RequireModule(TenantModule.FREIGHT)`** — reaproveitado; renovação de contrato não existe sem o
  módulo de Fretes habilitado (mesmo gate de `ContractsController`).

### Estrutura genuinamente nova

`ContractRenewal` (o processo de renovação em si — status, vigência anterior/nova, quem iniciou/concluiu/
cancelou e quando) e `NotificationType.CONTRACT_EXPIRING` — nada equivalente existia.

## 2. Por que renovação é uma TABELA satélite, não campos no `Contract`

Colocar campos de renovação diretamente no `Contract` misturaria "o contrato" com "o processo de
renovação" e arriscaria complicar `ContractEntity`/`ContractsService`, já estáveis e testados desde a
Fase 59. `ContractRenewal` referencia dois `Contract` (`previousContractId` obrigatório,
`newContractId` único e nulo até a conclusão) e guarda apenas o que pertence ao PROCESSO: status,
snapshot de `previousEndDate` (capturado no momento em que a renovação é iniciada — nunca recalculado
depois), `newStartDate`/`newEndDate` (gravados na conclusão), e quem/quando iniciou, concluiu ou
cancelou.

## 3. Fluxo de renovação e transições válidas

```
        POST /contract-renewals                POST /contract-renewals/:id/complete
Contrato  ─────────────────────▶  PENDING  ─────────────────────────────────────▶  COMPLETED
(ACTIVE                              │
 ou EXPIRED)                         │  POST /contract-renewals/:id/cancel
                                      ▼
                                  CANCELLED
```

- **Iniciar** (`POST /contract-renewals`, corpo `{ contractId, notes? }`) só é permitido para um contrato
  `ACTIVE` ou `EXPIRED` (409 para `DRAFT`/`SUSPENDED`/`CANCELLED` — não faz sentido renovar um contrato
  que nunca esteve em uso ou já foi encerrado). Um contrato nunca pode ter duas renovações `PENDING`
  simultâneas (409). `previousEndDate` é capturado neste momento.
- **Concluir** (`POST /contract-renewals/:id/complete`, corpo `{ code, startDate, endDate?, description?,
  commercialTerms?, notes? }`) só é permitido em uma renovação `PENDING` (409 caso contrário). Cria um
  novo `Contract` via `ContractsService.create` (com `code`/`startDate`/`endDate` do corpo), ativa-o
  (`status=ACTIVE`) e marca o contrato anterior como `EXPIRED` — sem jamais alterar `startDate`/
  `endDate`/`commercialTerms`/`notes` do contrato anterior (regra 3). Campos `description`/
  `commercialTerms`/`notes` deixados em branco no corpo são **herdados** do contrato anterior (mesmo
  espírito de `ReviseFreightRuleDto` — "campos omitidos herdam a versão anterior"; como é uma ação
  explícita do usuário, isso não viola a regra 4 de "nunca alterar automaticamente sem ação explícita").
- **Cancelar** (`POST /contract-renewals/:id/cancel`) só é permitido em uma renovação `PENDING` (409 caso
  contrário) e nunca altera o contrato anterior.
- Uma vez `COMPLETED` ou `CANCELLED`, a renovação é terminal — nenhuma rota permite reabri-la ou
  modificá-la.

## 4. Identificação de "vencendo/vencido"

Um contrato entra na listagem `GET /contract-renewals/expiring-contracts` quando: `status` é `ACTIVE` ou
`EXPIRED` **e** `endDate` está definido **e** `endDate <= agora + withinDays` (padrão 30 dias,
configurável via query `withinDays`, 1–365). `expiryStatus` de cada linha é `EXPIRED` (já venceu) ou
`EXPIRING_SOON` (dentro da janela, ainda não venceu) — mesma classificação de
`resolveDocumentExpiryStatus`. `daysUntilExpiry` é negativo quando já vencido. Cada linha também informa
`hasActiveRenewal`/`activeRenewalId` (existe uma renovação `PENDING` em andamento para aquele contrato),
calculado com uma única query adicional batched por página (nunca uma query por contrato — ver seção 7).

`GET /contract-renewals/summary` (indicadores para o CRM/página do cliente) retorna três contagens:
contratos vencendo (`ACTIVE`, dentro dos 30 dias padrão, ainda não vencidos), contratos vencidos
(`ACTIVE` ou `EXPIRED` com `endDate` no passado) e renovações `PENDING`. Aceita `customerId` opcional
para escopar ao cliente (usado na página do cliente).

## 5. Notificações

Um novo `NotificationType.CONTRACT_EXPIRING` foi adicionado ao enum e ao mapa
`NOTIFICATION_RECIPIENT_ROLES` (grupo `MANAGEMENT_ROLES` — mesmo grupo de `BILLING_PENDING`/
`DRIVER_SUSPENDED`, decisão comercial/gestão, nunca `OPERATOR`/`DISPATCHER`). O novo coletor
`collectContractsExpiring` usa exatamente a mesma condição/limiar da seção 4 (contratos `ACTIVE`/
`EXPIRED` com `endDate` dentro de 30 dias) e é processado pelo job periódico
(`NotificationsProcessingScheduler`) ou pelo gatilho manual `POST /notifications/process` — nenhum
mecanismo de geração novo. Idempotente pelo mesmo `createMany({ skipDuplicates: true })` já usado por
todos os outros tipos, contra a constraint única `(tenantId, recipientId, type, entityType, entityId)`.

## 6. APIs (`apps/api/src/contract-renewals`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/contract-renewals` | Lista renovações (filtro por `contractId`/`customerId`/`status`, paginação) |
| `GET` | `/contract-renewals/:id` | Detalhe de uma renovação |
| `POST` | `/contract-renewals` | Inicia uma renovação (`contractId`, `notes?`) |
| `POST` | `/contract-renewals/:id/complete` | Conclui: cria e ativa o novo contrato, marca o anterior como `EXPIRED` |
| `POST` | `/contract-renewals/:id/cancel` | Cancela uma renovação `PENDING` |
| `GET` | `/contract-renewals/expiring-contracts` | Lista contratos vencendo/vencidos (filtro `customerId`/`withinDays`, paginação) |
| `GET` | `/contract-renewals/summary` | Indicadores: vencendo, vencidos, renovações pendentes (filtro `customerId` opcional) |

RBAC: `FREIGHT_READ_ROLES`/`FREIGHT_WRITE_ROLES` (mesmo grupo de `ContractsController`). Gate
`@RequireModule(TenantModule.FREIGHT)`, mesmo critério de `ContractsController`.

## 7. Frontend (`apps/admin-web`)

- **`/operations/fleet/freight`** ganhou uma nova aba **"Renovações"** (`ContractRenewalsPanel`),
  evoluindo a área de contratos já existente (que já tinha as abas Dashboard/Contratos/Tabelas/Regras/
  Simulador) em vez de criar uma página nova isolada. A aba mostra: indicadores (vencendo/vencidos/
  pendentes), tabela de contratos vencendo/vencidos com filtro por cliente e período (`withinDays`) e
  ação "Renovar" por linha, e tabela de histórico de renovações com filtro por cliente/status, mostrando
  vigência anterior e nova, e ações "Concluir"/"Cancelar" em renovações `PENDING`.
- **`/customers/[id]`** (página do cliente) ganhou: indicadores de renovação escopados ao cliente
  (vencendo/vencidos/pendentes), ação "Renovar" em cada linha do cartão "Contratos ativos", e um novo
  cartão "Renovações" com o histórico de vigências do cliente e as mesmas ações de concluir/cancelar.
- Reaproveita integralmente `DataTable`/`Card`/`FilterBar`/`Modal`/`ConfirmDialog`/`Pagination`/
  `StatCard`/`EntitySelect`/`Select`/`Badge` já existentes — nenhum componente de UI genérico novo.

## 8. Performance / N+1

- Listagens (`/contract-renewals`, `/contract-renewals/expiring-contracts`): filtros/paginação
  inteiramente no banco.
- `expiring-contracts`: uma query paginada para os contratos + **uma única** query adicional batched
  (`ContractRenewal.findMany` com `previousContractId: { in: [...] }`) para resolver `hasActiveRenewal`
  de todas as linhas da página de uma vez — nunca uma query por contrato. Testado: contagem de queries
  fixa entre 5 e 20 contratos vencendo.
- `summary`: três `count()` em paralelo (`Promise.all`), custo constante independente do volume de
  contratos/renovações.

## 9. Limitações reais (regra 10 — documentadas, não inventadas)

- **Limiar de "vencendo em breve" é um único padrão global de 30 dias** (com override manual via
  `withinDays` na consulta) — não há configuração por tenant persistida, porque não existe hoje nenhum
  campo de configuração de tenant para isso (mesma limitação já aceita por `cnhExpiringThreshold`/
  `resolveDocumentExpiryStatus`).
- **Nenhuma regra automática de reajuste de valores/condições na renovação** — a fase pede
  explicitamente que nada seja alterado sem ação explícita (regra 4); `commercialTerms` só muda se o
  usuário informar um novo valor ao concluir.
- **Nenhuma transição automática de status do contrato por vencimento** — um contrato `ACTIVE` vencido
  continua `ACTIVE` no banco até uma ação explícita (conclusão de renovação, ou edição manual via
  `PATCH /freight/contracts/:id`); `isExpired`/`expiryStatus` são sempre calculados a partir de
  `endDate`, nunca persistidos como gatilho de mudança de status. Não havia pedido nem dado existente que
  justificasse uma regra automática aqui.
- **Sem lembrete escalonado (ex.: 60/30/15/7 dias)** — a notificação `CONTRACT_EXPIRING` é gerada a cada
  execução do processamento enquanto a condição for verdadeira, mas idempotente por
  `(tenantId, recipientId, type, entityType, entityId)`: a primeira geração para um contrato específico
  fica registrada e não se duplica em reprocessamentos seguintes, mesmo padrão de todos os outros tipos
  de notificação já existentes (nenhum tipo do sistema tem lógica de "reenviar após N dias").

## 10. Testes

`apps/api/test/contract-renewals.e2e-spec.ts` (15 testes, requests reais contra o Postgres): identificação
correta de contratos vencendo/vencidos/fora da janela, `withinDays` customizado, filtro por cliente e
paginação da listagem de vencimento, indicadores de resumo, iniciar renovação com snapshot da vigência
anterior, concluir renovação (novo contrato `ACTIVE`, código/datas corretos, herança de campos omitidos,
contrato anterior marcado `EXPIRED` sem ter `startDate`/`endDate`/`commercialTerms`/`notes` alterados),
filtros/paginação da listagem de renovações, cancelar preservando o contrato anterior, bloqueios de
transição inválida (iniciar em `DRAFT`/`CANCELLED`, segunda renovação `PENDING` simultânea, concluir/
cancelar uma renovação que já não está `PENDING`), isolamento multi-tenant, RBAC (`DRIVER` bloqueado,
`AUDITOR` só leitura), integração com notificações (gera `CONTRACT_EXPIRING` para o grupo de gestão,
idempotente em reprocessamento) e ausência de N+1 na listagem de vencimento.

Regressão executada: `freight.e2e-spec.ts` (19, CRUD de contrato e demais funcionalidades de frete
diretamente afetadas), `customer-crm.e2e-spec.ts` (14), `notifications.e2e-spec.ts` (23, incluindo o novo
coletor no fluxo geral) e `notifications.service.spec.ts`/`notification-recipients.util.spec.ts` (22,
unitários — o mock de `PrismaService` precisou ganhar `contract.findMany` para o novo coletor) — todos
passando sem alteração de comportamento pré-existente.
