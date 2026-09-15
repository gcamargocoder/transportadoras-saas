# Integração Mercado Pago — Cobrança recorrente de assinaturas SaaS

## Objetivo

Automatizar a cobrança das assinaturas dos tenants (`TenantSubscription`,
Fase 50, módulo `apps/api/src/billing/`) via **assinatura recorrente
nativa do Mercado Pago** (Preapproval API), convivendo com o fluxo manual
já existente (`PIX_SCHEDULED`/`DIRECT_DEBIT`, registro manual de
pagamento). Escopo explícito: cobrança da **plataforma para os tenants**
(mensalidade SaaS) — não é cobrança de fretes/clientes finais nem
recebíveis/pagáveis operacionais das transportadoras (fora de escopo,
decidido no brainstorming).

## Modelo comercial

Uma única conta Mercado Pago pertence à plataforma (o dono do SaaS). Cada
tenant é um **pagador** que autoriza um cartão para pagamentos recorrentes
automáticos naquela conta — não há conexão de conta MP por tenant, não há
split payment/marketplace.

## Fora de escopo (deliberado)

- Split payment / marketplace / OAuth de conta MP por tenant.
- Cobrança de fretes, receivables ou payables via Mercado Pago.
- Boleto/Pix avulsos por cobrança (Checkout Pro) — só a assinatura
  recorrente (Preapproval).
- Reembolso automático.
- Envio automático (e-mail/WhatsApp) do link de autorização — o tenant
  ADMIN acessa o link dentro do próprio sistema.
- Suspensão automática do tenant por falha de pagamento — continua sendo
  decisão manual do SUPER_ADMIN (`PATCH /tenants/:id/status`, Fase 47,
  intocado).

## Modelo de dados

Nenhuma tabela nova. Uma migration aditiva:

```prisma
enum SubscriptionPaymentMethod {
  PIX_SCHEDULED
  DIRECT_DEBIT
  MERCADO_PAGO
  /// Preparado para uso futuro -- nenhuma integracao real nesta fase.
  STRIPE
}
```

Campos já reservados desde a Fase 50 passam a ser lidos/escritos quando
`paymentMethod=MERCADO_PAGO` (nenhum campo novo):

- `TenantSubscription.externalSubscriptionId` → `preapproval_id` do MP.
- `TenantSubscription.externalCustomerId` → `payer_id` do MP (preenchido
  quando o preapproval é autorizado, vem no webhook/consulta).
- `SubscriptionPayment.externalPaymentId` → `payment_id` do MP de cada
  cobrança recorrente aprovada. Usado como chave de deduplicação de
  webhook (antes de inserir uma linha nova, verifica se já existe
  `SubscriptionPayment` com esse `externalPaymentId`).

Para `paymentMethod` diferente de `MERCADO_PAGO`, esses três campos
continuam `null`, comportamento inalterado.

## Arquitetura de módulos

Novo módulo `apps/api/src/mercado-pago/`, seguindo o mesmo padrão de
integração externa opcional já usado para roteirização
(`GOOGLE_ROUTES_API_KEY`, Fase 26): um serviço fino, sem regra de negócio
de assinatura dentro dele.

```
apps/api/src/mercado-pago/
  mercado-pago.module.ts
  services/
    mercado-pago.service.ts       -- wrapper do SDK oficial (createPreapproval,
                                      getPreapproval, getPayment)
    mercado-pago-webhook.service.ts -- valida assinatura x-signature/x-request-id
  mercado-pago.module.ts exporta MercadoPagoService para o BillingModule
```

- SDK: pacote oficial `mercadopago` (npm), inicializado com
  `MERCADO_PAGO_ACCESS_TOKEN`.
- Sem a env var configurada: `MercadoPagoService` lança um erro tipado
  reconhecido pelo controller e traduzido em `503 Service Unavailable`
  ("gateway de pagamento não configurado") — nunca um erro genérico ou
  comportamento simulado. Mesmo padrão do provider de rotas.
- `BillingModule` importa `MercadoPagoModule` e injeta `MercadoPagoService`
  em `SubscriptionsService`/no novo endpoint de webhook — nenhuma lógica
  de assinatura duplicada dentro do módulo `mercado-pago`.

## Fluxo de autorização (self-service)

1. SUPER_ADMIN cadastra/edita a assinatura do tenant com
   `paymentMethod=MERCADO_PAGO` (telas `create-subscription-modal`/
   `edit-subscription-modal` já existentes — só um novo valor no select,
   nenhuma tela nova nessa parte).
2. Tenant ADMIN acessa `/settings/company` (rota self-service já
   existente, `GET /tenants/me`) e vê uma nova seção "Cobrança
   automática":
   - Sem preapproval ainda → botão "Autorizar no Mercado Pago".
   - Preapproval `pending_authorization` → aviso "aguardando autorização".
   - Preapproval `authorized` → status "Cobrança automática ativa" +
     data do próximo vencimento.
   - Preapproval `paused`/`cancelled` → aviso + botão para reautorizar.
3. Botão dispara `POST /billing/subscriptions/me/mercado-pago/authorization`
   (novo endpoint, `@Roles(ADMIN, SUPER_ADMIN)`, tenant resolvido via
   `@CurrentTenant()` — nunca aceito no payload, mesmo padrão de
   `PATCH /tenants/me`).
4. `SubscriptionsService` (método novo, ex.: `createMercadoPagoAuthorization`):
   - Carrega a `TenantSubscription` do tenant atual (404 se não existir,
     409 se `paymentMethod !== MERCADO_PAGO`).
   - Chama `MercadoPagoService.createPreapproval({ reason, amount,
     periodicity → frequency/frequency_type, dueDay → start_date,
     payer_email: email do tenant ADMIN autenticado, external_reference:
     tenantId, back_url: <admin-web>/settings/company })`.
   - Salva `externalSubscriptionId = preapproval.id` na
     `TenantSubscription` (status permanece `PENDING` até o webhook
     confirmar autorização).
   - Retorna `{ initPoint }` ao frontend.
5. Frontend redireciona (`window.location.href = initPoint`) para o
   checkout do MP. Dado de cartão nunca trafega pelo nosso backend — só o
   MP recebe.
6. MP redireciona de volta para `back_url` após a autorização; o estado
   real da assinatura só é confirmado pelo webhook (passo seguinte), não
   pelo redirect (que é só UX, sem garantia de entrega).

## Webhook

`POST /billing/webhooks/mercado-pago` — `@Public()` (sem JWT, como todo
webhook de terceiro), mas autenticado pela validação de assinatura do MP:

- Valida o header `x-signature` (HMAC com `MERCADO_PAGO_WEBHOOK_SECRET`,
  conforme documentação do MP) contra o `data.id`/`x-request-id` da
  notificação. Assinatura inválida ou secret ausente → `401`, nenhum
  processamento.
- `type=preapproval`: busca o preapproval atualizado
  (`MercadoPagoService.getPreapproval(id)`), localiza a
  `TenantSubscription` por `externalSubscriptionId`, mapeia status:
  - `authorized` → `TenantSubscription.status=ACTIVE`,
    `externalCustomerId=payer_id`.
  - `paused` → `status=SUSPENDED`.
  - `cancelled` → `status=CANCELLED`.
- `type=payment` (cobrança recorrente da assinatura,
  `payment.status=approved`, associada a um `preapproval_id` conhecido):
  - Busca a `TenantSubscription` por `externalSubscriptionId`.
  - **Deduplicação**: se já existe `SubscriptionPayment` com esse
    `externalPaymentId`, ignora (idempotente — MP reenvia notificações).
  - Caso contrário, reaproveita a mesma transação Prisma de
    `POST /billing/subscriptions/:id/payments` (extraída para um método
    privado comum em `SubscriptionsService`, ex.:
    `recordPayment(subscriptionId, { amount, status: PAID, paymentMethod:
    MERCADO_PAGO, externalPaymentId, createdBy: null })`): cria
    `SubscriptionPayment(status=PAID)`, avança `nextDueDate`
    (`computeNextDueDate`), marca `status=ACTIVE`.
  - `createdBy` é `@map("created_by")` com FK obrigatória para
    `UserAccount` hoje — para pagamentos originados por webhook (sem
    ator humano) é necessário relaxar essa constraint (tornar
    `createdBy` nullable) OU usar um usuário de sistema fixo. **Decisão:
    tornar `SubscriptionPayment.createdBy` nullable** (migration
    aditiva, mesmo espírito do `Logger`-only já usado por
    `markOverdueSubscriptions()` para ações sem ator humano) — mais
    simples e correto do que inventar um "usuário sistema" fake que
    poderia ser confundido com um humano na auditoria.
  - Grava evento de auditoria `billing.payment_registered` com
    `actorId=null` quando originado por webhook (mesmo padrão de ação
    sem ator humano já usado pelo scheduler).
- Payment com `status` diferente de `approved` (`rejected`, `pending`,
  etc.): não cria `SubscriptionPayment` nenhum — só interessa a nós
  cobrança efetivamente aprovada (rejeitada não afeta `nextDueDate`, MP
  tentará novamente automaticamente conforme sua própria política de
  retry).
- Toda a lógica de processamento roda de forma **idempotente e
  tolerante a reordenação**: buscar sempre o estado atual no MP em vez
  de confiar cegamente no payload do webhook (prática recomendada pelo
  MP, já que o payload é só um "algo mudou, vá conferir").

## Convivência com o fluxo manual existente

Único ponto de código existente que muda:
`BillingLifecycleService.markOverdueSubscriptions()` passa a filtrar
`paymentMethod: { not: 'MERCADO_PAGO' }` na query — quem decide que uma
assinatura MP está em atraso é o próprio Mercado Pago (via retry de
cobrança e eventual `paused`/`cancelled` do preapproval, tratado pelo
webhook), nunca o cron de vencimento local baseado em `nextDueDate`.

Assinaturas com `paymentMethod` manual continuam 100% inalteradas —
nenhuma rota, tela ou comportamento existente muda para elas.

## Frontend

**Self-service (`/settings/company`, novo bloco "Cobrança automática"):**
visível só quando `paymentMethod=MERCADO_PAGO` na assinatura do tenant
(dado incluído em `GET /tenants/me` — precisa incluir a subscription no
retorno, hoje não incluída; extensão do mapper existente). Estados:
sem autorização / pendente / ativa / pausada-cancelada, cada um com a
ação cabível.

**Super-admin (`/super-admin/tenants/:id`, seção "Assinatura e
cobrança" já existente):** exibe o novo método `MERCADO_PAGO` no select
de forma de pagamento (mesmo componente `Select` reaproveitado) e, somente
leitura, o status do preapproval (`externalSubscriptionId` presente +
status da assinatura) — SUPER_ADMIN não aciona a autorização, só
acompanha.

## Configuração

`.env`/`.env.example` (padrão idêntico ao `GOOGLE_ROUTES_API_KEY` —
opcional, ausência não quebra o resto do billing manual):

```
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
```

Chaves reais fornecidas pelo usuário fora deste repositório (já possui
conta/app criada no Mercado Pago Developers). Nunca commitadas.

## Testes

- Unitário: `MercadoPagoService` (mock do SDK) — mapeamento
  periodicidade→frequency, tratamento de erro quando token ausente.
- Unitário: validação de assinatura do webhook (assinatura válida,
  inválida, ausente).
- Unitário: `recordPayment` extraído — mesmo comportamento coberto hoje
  por `POST /billing/subscriptions/:id/payments` (avanço de
  `nextDueDate`, mudança de status), agora chamável tanto pela rota
  manual quanto pelo webhook.
- E2E (`apps/api/test/`): criação de preapproval via endpoint self-service
  (mock do MP), webhook `preapproval` autorizado atualiza status,
  webhook `payment` aprovado cria `SubscriptionPayment` e avança
  vencimento, webhook duplicado (mesmo `externalPaymentId`) não duplica
  pagamento, assinatura MP ignorada por `markOverdueSubscriptions`,
  RBAC (ADMIN de outro tenant não aciona autorização de tenant alheio).
- Testes de integração real com o Mercado Pago (sandbox) ficam a cargo
  do usuário em ambiente de homologação, usando cartões de teste do MP —
  fora do escopo de testes automatizados do repositório.

## Limitações reais (documentar em `docs/billing.md` ao final)

- Sem split payment/marketplace — uma única conta MP para toda a
  plataforma.
- Sem cobrança de fretes/receivables/payables via MP.
- Sem envio automático do link de autorização (e-mail/WhatsApp) — o
  tenant ADMIN acessa dentro do próprio sistema.
- Suspensão do tenant por inadimplência continua manual
  (`SUPER_ADMIN`), mesmo com `paymentMethod=MERCADO_PAGO`.
- Migração de uma assinatura já `MERCADO_PAGO` de volta para método
  manual não cancela automaticamente o preapproval no MP — isso exigiria
  uma ação explícita adicional, fora do escopo desta fase (documentar
  como limitação conhecida).
