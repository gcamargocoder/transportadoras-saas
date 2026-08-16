# Gestão Manual de Assinaturas e Cobrança (Fase 50)

Módulo novo e self-contained (`apps/api/src/billing/`) que representa a
relação **comercial** entre a plataforma e cada transportadora (quanto,
quando e como paga). Cobrança é **100% manual** nesta fase — nenhuma
integração real com Stripe/PIX/débito automático, nenhum gateway,
webhook ou checkout. `TenantPlan` (Fase 47) **não foi alterado**: continua
sendo a única fonte de módulos/limites/enforcement.

## 1. Modelagem

Dois models novos, aditivos:

- **`TenantSubscription`** (1:1 com `Tenant`) — a assinatura em si: tier
  comercial (`planTier`, reaproveita o enum `TenantPlanTier` já existente
  — não duplica um enum paralelo, mas é um campo independente do
  `TenantPlan.tier` atual: representa o que está sendo **cobrado**, não o
  que dá direito a **funcionalidades**), valor, periodicidade
  (`MONTHLY`/`YEARLY`), método (`PIX_SCHEDULED`/`DIRECT_DEBIT`/`STRIPE`),
  data de início, dia de vencimento, próximo vencimento, status
  (`ACTIVE`/`PENDING`/`OVERDUE`/`SUSPENDED`/`CANCELLED`), observações.
- **`SubscriptionPayment`** — histórico de pagamentos, **ledger
  imutável**: sem `updatedAt`, sem endpoint de update/delete. Cada ação
  ("marcar como pago/pendente/atrasado") cria uma linha **nova**, nunca
  altera uma anterior. Guarda quem registrou (`createdBy`, FK
  `ON DELETE RESTRICT` para o usuário — nunca deixa apagar o histórico
  arrastando quem o registrou).

Preparação para Stripe (nunca usada nesta fase): `externalCustomerId`/
`externalSubscriptionId` em `TenantSubscription`, `externalPaymentId` em
`SubscriptionPayment` — campos opcionais reservados, sem SDK instalado,
sem nenhum código que os leia/escreva ainda.

## 2. Cálculo de vencimento (sempre no backend)

`billing/utils/billing-date.util.ts` — funções puras, testadas
isoladamente, sempre em UTC (nunca timezone local do servidor/cliente):

- `computeFirstDueDate(startDate, dueDay)` — 1º vencimento ao criar a
  assinatura.
- `computeNextDueDate(currentDueDate, periodicity, dueDay)` — avança 1 mês
  ou 1 ano, com clamp para meses curtos (ex: `dueDay=31` em fevereiro →
  dia 28/29).
- `daysOverdue(dueDate, now)` — dias em atraso (sempre ≥ 0).

## 3. Registro de pagamento

`POST /billing/subscriptions/:id/payments` cria sempre uma linha nova.
Quando `status=PAID`: dentro da mesma transação, avança
`TenantSubscription.nextDueDate` (via `computeNextDueDate`) e marca
`status=ACTIVE`. Para os outros status (`PENDING`/`OVERDUE`/`CANCELLED`)
só registra o histórico, sem efeito colateral na assinatura.

## 4. Inadimplência

`BillingLifecycleService.markOverdueSubscriptions()` — mesmo padrão do
scheduler de trial (Fase 49): 1 `findMany` (só `id`) + 1 `updateMany` em
lote, idempotente, `@Cron` diário
(`BillingLifecycleScheduler`, `CronExpression.EVERY_DAY_AT_1AM`).
Assinaturas `ACTIVE`/`PENDING` com `nextDueDate` vencido viram `OVERDUE`
automaticamente. **Nunca toca em `Tenant.status`/`isActive`** — suspender
o tenant por inadimplência é sempre uma decisão manual do SUPER_ADMIN
(`PATCH /tenants/:id/status`, Fase 47, reaproveitado sem nenhuma mudança).

## 5. API

Todas as rotas em `apps/api/src/billing/controllers/subscriptions.controller.ts`,
`@Roles(SUPER_ADMIN)` + `@Throttle(ADMIN_THROTTLE)` a nível de classe:

```
GET    /billing/dashboard
GET    /billing/subscriptions            (paginado; filtros: status, paymentMethod, planTier, tenantId, dueFrom/dueTo, search)
POST   /billing/subscriptions
GET    /billing/subscriptions/:id        (inclui ultimo pagamento resolvido)
PATCH  /billing/subscriptions/:id        (edicao parcial -- inclusive "alterar vencimento" e cancelamento via status=CANCELLED)
POST   /billing/subscriptions/:id/payments
GET    /billing/subscriptions/:id/payments (paginado)
```

Nenhuma rota nova em `TenantsController`. `GET /billing/subscriptions`
resolve `tenant.name` via `include` na própria query (nunca 1 query por
linha) — mesmo padrão de `TenantsRepository`. Dashboard usa `Promise.all`
de `count`/`groupBy`/`aggregate` — mesmo padrão de
`getPlatformStats()` (Fase 47).

## 6. Auditoria

Reaproveita 100% o `AuditService` já existente. Ações:
`billing.subscription_created`, `billing.subscription_updated`,
`billing.subscription_cancelled` (mesmo endpoint de edição, distinguido
pela transição de status para `CANCELLED`), `billing.payment_registered`.
A expiração automática (scheduler) só grava `Logger`, mesmo critério do
`TenantLifecycleScheduler` (Fase 49) — não é uma ação de um ator humano.

## 7. Segurança

Domínio inteiro `SUPER_ADMIN`-only. ADMIN comum de qualquer tenant recebe
403 em toda rota `/billing/*` — o que já cobre "não pode acessar cobrança
de outro tenant" (não acessa a de nenhum). `tenantId` nunca é aceito como
autoridade sem validação (sempre resolvido via o recurso já carregado do
banco, nunca confiado a partir do payload sozinho).

## 8. Frontend

- `/super-admin/billing` (novo, item "Cobrança" no menu do
  `SuperAdminShell`) — dashboard (recebido/pendente/atrasado/previsão
  mensal), listagem com filtros (status/método/plano/busca), modal "Nova
  assinatura", ação rápida "Registrar pagamento" por linha.
- `/super-admin/tenants/[id]` — seção nova "Assinatura e cobrança":
  plano/valor/periodicidade/método/vencimento/status/último pagamento/dias
  em atraso + ações (registrar pagamento, editar assinatura) + os botões
  de suspender/reativar tenant já existentes (Fase 47, reaproveitados sem
  mudança).
- Reaproveita 100% componentes existentes (`Modal`, `FormField`, `Input`,
  `Select`, `DataTable`, `Pagination`, `Badge`, `StatCard`) — nenhum
  componente visual novo além dos 3 modais (`create-subscription-modal`,
  `edit-subscription-modal`, `register-payment-modal`).

## 9. Limitações reais

- Sem Stripe/PIX automático/débito automático real, gateway, webhook,
  checkout, nota fiscal, e-mail/WhatsApp automático — todos fora de
  escopo explícito desta fase.
- Sem suspensão automática por inadimplência — sempre decisão manual do
  SUPER_ADMIN.
- Cron fixo (diário, 1h), sem configuração via env var (não pedido nesta
  fase).
- Um tenant só pode ter 1 assinatura por vez (`TenantSubscription.tenantId`
  é `@unique`) — trocar de plano comercial é feito editando a assinatura
  existente (`PATCH`), nunca criando uma segunda.
