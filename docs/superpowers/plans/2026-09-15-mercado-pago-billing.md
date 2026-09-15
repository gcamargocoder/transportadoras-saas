# Integração Mercado Pago (Cobrança Recorrente de Assinaturas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar a cobrança das assinaturas SaaS dos tenants via assinatura recorrente nativa do Mercado Pago (Preapproval API), convivendo com o fluxo manual já existente (Fase 50).

**Architecture:** Novo módulo `apps/api/src/mercado-pago/` (provider abstrato + implementação HTTP via `fetch` nativo + implementação "não configurado", mesmo padrão de `RoutingModule`/`GOOGLE_ROUTES_API_KEY`), consumido pelo módulo `billing/` existente. Tenant ADMIN autoriza a cobrança recorrente numa tela self-service (`/settings/company`); o Mercado Pago notifica mudanças via webhook assinado (`POST /billing/webhooks/mercado-pago`), que reaproveita a mesma lógica transacional já usada pelo registro manual de pagamento.

**Tech Stack:** NestJS, Prisma/PostgreSQL, `fetch` nativo do Node (sem SDK novo), Next.js/React Query no frontend.

**Spec:** `docs/superpowers/specs/2026-09-15-mercado-pago-billing-design.md`

## Global Constraints

- Nunca adicionar o SDK npm `mercadopago` (ou qualquer client HTTP como axios): toda chamada externa usa `fetch` nativo, mesmo padrão de `GoogleRoutingProvider` (`apps/api/src/routing/providers/google.provider.ts`).
- Comentários de código em pt-BR **sem acentos** (convenção existente em todo o repo — ver qualquer arquivo `.ts`/`.prisma` atual).
- Integração externa opcional nunca bloqueia o boot nem simula dados: ausência de `MERCADO_PAGO_ACCESS_TOKEN` = `NotConfiguredMercadoPagoProvider` lança `ServiceUnavailableException` claro (mesmo padrão de `NotConfiguredRoutingProvider`).
- Campos de correlação com sistemas externos que podem ser reenviados (webhook) usam `@unique` nullable no Prisma (Postgres permite múltiplos `NULL` numa coluna `UNIQUE`) — nunca deduplicação só em memória/aplicação.
- Ações originadas por webhook (sem ator humano) usam `Logger`, nunca `AuditService` — mesmo critério já usado por `BillingLifecycleService`/`TenantLifecycleScheduler`.
- Rotas self-service (`subscriptions/me`, `subscriptions/me/...`) devem ser declaradas no controller **antes** de `subscriptions/:id` (mesma ordem de `tenants.controller.ts`: `me` antes de `:id`) — Nest casa rotas na ordem de declaração.
- `@Roles(...)` no nível do método sobrescreve `@Roles(...)` no nível da classe (`RolesGuard` usa `reflector.getAllAndOverride`, que prioriza o handler).

---

### Task 1: Schema Prisma — enum MERCADO_PAGO + createdBy nullable + campos únicos

**Files:**
- Modify: `packages/database/prisma/schema.prisma:844-849` (enum `SubscriptionPaymentMethod`)
- Modify: `packages/database/prisma/schema.prisma:868-895` (model `TenantSubscription`, campo `externalSubscriptionId`)
- Modify: `packages/database/prisma/schema.prisma:901-924` (model `SubscriptionPayment`, campos `externalPaymentId`/`createdBy`/relação `creator`)
- Create: migration gerada por `prisma migrate dev` em `packages/database/prisma/migrations/`

**Interfaces:**
- Produces: enum value `SubscriptionPaymentMethod.MERCADO_PAGO`; `TenantSubscription.externalSubscriptionId` agora `@unique`; `SubscriptionPayment.createdBy` agora `String?` (nullable) e `creator` agora `UserAccount?` (relação opcional); `SubscriptionPayment.externalPaymentId` agora `@unique`. Todo código de Task 5+ depende desses três campos serem nullable/unique.

- [ ] **Step 1: Editar o enum `SubscriptionPaymentMethod`**

Em `packages/database/prisma/schema.prisma`, troque:

```prisma
enum SubscriptionPaymentMethod {
  PIX_SCHEDULED
  DIRECT_DEBIT
  /// Preparado para uso futuro -- nenhuma integracao real nesta fase.
  STRIPE
}
```

por:

```prisma
enum SubscriptionPaymentMethod {
  PIX_SCHEDULED
  DIRECT_DEBIT
  MERCADO_PAGO
  /// Preparado para uso futuro -- nenhuma integracao real nesta fase.
  STRIPE
}
```

- [ ] **Step 2: Tornar `externalSubscriptionId` único**

No model `TenantSubscription`, troque:

```prisma
  externalSubscriptionId String?                   @map("external_subscription_id")
```

por:

```prisma
  /// Unico -- preapproval_id do Mercado Pago (Fase Mercado Pago). Postgres
  /// permite multiplos NULL numa coluna UNIQUE, entao assinaturas com metodo
  /// manual (sem preapproval) continuam null sem conflito.
  externalSubscriptionId String?                   @unique @map("external_subscription_id")
```

- [ ] **Step 3: Tornar `createdBy` nullable e `externalPaymentId` único no `SubscriptionPayment`**

Troque o model inteiro:

```prisma
model SubscriptionPayment {
  id                String                    @id @default(uuid()) @db.Uuid
  tenantId          String                    @map("tenant_id") @db.Uuid
  subscriptionId    String                    @map("subscription_id") @db.Uuid
  amount            Decimal                   @db.Decimal(10, 2)
  dueDate           DateTime                  @map("due_date")
  paidAt            DateTime?                 @map("paid_at")
  paymentMethod     SubscriptionPaymentMethod @map("payment_method")
  status            SubscriptionPaymentStatus @default(PENDING)
  reference         String?                   @db.Text
  /// Preparacao Stripe -- nunca lido/escrito nesta fase.
  externalPaymentId String?                   @map("external_payment_id")
  createdBy         String                    @map("created_by") @db.Uuid
  createdAt         DateTime                  @default(now()) @map("created_at")

  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  subscription TenantSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  creator      UserAccount        @relation(fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([tenantId])
  @@index([subscriptionId])
  @@index([status])
  @@map("subscription_payments")
}
```

por:

```prisma
model SubscriptionPayment {
  id                String                    @id @default(uuid()) @db.Uuid
  tenantId          String                    @map("tenant_id") @db.Uuid
  subscriptionId    String                    @map("subscription_id") @db.Uuid
  amount            Decimal                   @db.Decimal(10, 2)
  dueDate           DateTime                  @map("due_date")
  paidAt            DateTime?                 @map("paid_at")
  paymentMethod     SubscriptionPaymentMethod @map("payment_method")
  status            SubscriptionPaymentStatus @default(PENDING)
  reference         String?                   @db.Text
  /// Unico -- payment_id do Mercado Pago (Fase Mercado Pago), usado para
  /// deduplicar webhooks reenviados. Postgres permite multiplos NULL.
  externalPaymentId String?                   @unique @map("external_payment_id")
  /// Nullable: pagamentos criados pelo webhook do Mercado Pago nao tem ator
  /// humano (Fase Mercado Pago). Pagamentos manuais continuam sempre
  /// preenchendo isto (registerPayment exige actor.userId).
  createdBy         String?                   @map("created_by") @db.Uuid
  createdAt         DateTime                  @default(now()) @map("created_at")

  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  subscription TenantSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  creator      UserAccount?       @relation(fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([tenantId])
  @@index([subscriptionId])
  @@index([status])
  @@map("subscription_payments")
}
```

- [ ] **Step 4: Gerar e aplicar a migration**

Run: `pnpm --filter @transportadoras/database db:migrate:dev --name mercado_pago_billing_integration`

Isso cria `packages/database/prisma/migrations/<timestamp>_mercado_pago_billing_integration/migration.sql`, aplica no banco de dev e regenera o Prisma Client automaticamente.

- [ ] **Step 5: Verificar o status da migration**

Run: `pnpm --filter @transportadoras/database exec prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 6: Rodar a suíte e2e existente de billing (regressão)**

Run: `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: todos os testes continuam passando (nenhum comportamento do fluxo manual mudou nesta task).

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(billing): adiciona MERCADO_PAGO ao schema de assinaturas"
```

---

### Task 2: Configuração — env vars do Mercado Pago

**Files:**
- Modify: `apps/api/src/config/configuration.ts`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `AppConfig.mercadoPago: { accessToken: string | undefined; webhookSecret: string | undefined; adminWebUrl: string; requestTimeoutMs: number }` — consumido pelas Tasks 3, 5 e 8.

- [ ] **Step 1: Adicionar a seção `mercadoPago` na interface `AppConfig`**

Em `apps/api/src/config/configuration.ts`, dentro da interface `AppConfig`, logo após o bloco `notificationsProcessing`, adicione:

```ts
  // Fase Mercado Pago -- cobranca recorrente de assinaturas SaaS via
  // Preapproval API. OPCIONAL: sem MERCADO_PAGO_ACCESS_TOKEN, o billing
  // manual continua funcionando normalmente e as rotas de Mercado Pago
  // respondem erro claro de "nao configurado" (ver
  // NotConfiguredMercadoPagoProvider) -- nunca bloqueia o boot.
  mercadoPago: {
    accessToken: string | undefined;
    webhookSecret: string | undefined;
    // URL publica do admin-web, usada para montar o back_url do checkout de
    // autorizacao (para onde o Mercado Pago redireciona o usuario apos ele
    // autorizar/cancelar o cartao).
    adminWebUrl: string;
    requestTimeoutMs: number;
  };
```

- [ ] **Step 2: Adicionar os valores lidos de `process.env` na função default export**

Logo após o bloco `notificationsProcessing: {...}` no corpo da função `export default (): AppConfig => ({...})`, adicione:

```ts
  mercadoPago: {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || undefined,
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET || undefined,
    adminWebUrl: process.env.ADMIN_WEB_URL ?? 'http://localhost:3000',
    requestTimeoutMs: parseInt(process.env.MERCADO_PAGO_REQUEST_TIMEOUT_MS ?? '8000', 10),
  },
```

- [ ] **Step 3: Adicionar validação em `env.validation.ts`**

Em `apps/api/src/config/env.validation.ts`, logo após o campo `NOTIFICATIONS_PROCESS_CRON`, adicione:

```ts
  // Fase Mercado Pago -- cobranca recorrente. Ambos OPCIONAIS: sem eles, o
  // gateway fica "nao configurado" (ver NotConfiguredMercadoPagoProvider),
  // nunca falha o boot.
  @IsOptional()
  @IsString()
  MERCADO_PAGO_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  MERCADO_PAGO_WEBHOOK_SECRET?: string;

  @IsString()
  ADMIN_WEB_URL = 'http://localhost:3000';

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  MERCADO_PAGO_REQUEST_TIMEOUT_MS = 8000;
```

- [ ] **Step 4: Confirmar que a validação existente continua passando**

Run: `pnpm --filter api test -- env.validation.spec`
Expected: PASS (os novos campos são opcionais/têm default, `baseValidConfig()` do spec não precisa mudar).

- [ ] **Step 5: Documentar no `.env.example`**

No fim de `apps/api/.env.example`, adicione:

```
# Integracao Mercado Pago (cobranca recorrente de assinaturas SaaS via
# Preapproval API). OPCIONAL: sem MERCADO_PAGO_ACCESS_TOKEN, o billing manual
# (PIX_SCHEDULED/DIRECT_DEBIT) continua funcionando normalmente; as rotas de
# Mercado Pago respondem 503 com erro claro em vez de simular dados.
# Como obter: https://www.mercadopago.com.br/developers/panel -> criar
# aplicacao -> "Credenciais de producao"/"Credenciais de teste".
MERCADO_PAGO_ACCESS_TOKEN=
# Chave secreta do webhook (mesma tela de credenciais, secao "Webhooks") --
# usada para validar a assinatura HMAC de cada notificacao recebida.
MERCADO_PAGO_WEBHOOK_SECRET=
# URL publica do admin-web (sem barra final) -- usada para montar o back_url
# do checkout de autorizacao do Mercado Pago.
ADMIN_WEB_URL=http://localhost:3000
MERCADO_PAGO_REQUEST_TIMEOUT_MS=8000
```

- [ ] **Step 6: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config apps/api/.env.example
git commit -m "feat(billing): adiciona configuracao de ambiente do Mercado Pago"
```

---

### Task 3: Provider Mercado Pago (interface + não-configurado + HTTP)

**Files:**
- Create: `apps/api/src/mercado-pago/mercado-pago.constants.ts`
- Create: `apps/api/src/mercado-pago/providers/mercado-pago-provider.interface.ts`
- Create: `apps/api/src/mercado-pago/providers/not-configured-mercado-pago.provider.ts`
- Create: `apps/api/src/mercado-pago/providers/not-configured-mercado-pago.provider.spec.ts`
- Create: `apps/api/src/mercado-pago/providers/mercado-pago-http.provider.ts`
- Create: `apps/api/src/mercado-pago/providers/mercado-pago-http.provider.spec.ts`

**Interfaces:**
- Consumes: `AppConfig.mercadoPago` (Task 2).
- Produces: `MercadoPagoProviderPort` (`isConfigured(): boolean`, `createPreapproval(input): Promise<MercadoPagoPreapproval>`, `getPreapproval(id): Promise<MercadoPagoPreapproval>`, `getPayment(id): Promise<MercadoPagoPayment>`), `MERCADO_PAGO_PROVIDER` token (string `'MERCADO_PAGO_PROVIDER'`) — consumidos pela Task 4 (módulo/service wrapper).

- [ ] **Step 1: Criar o token de injeção**

Create `apps/api/src/mercado-pago/mercado-pago.constants.ts`:

```ts
// Token de injecao para MercadoPagoProviderPort -- interfaces TS nao existem
// em runtime, entao o binding concreto (MercadoPagoHttpProvider ou
// NotConfiguredMercadoPagoProvider) e feito por este token em
// mercado-pago.module.ts. Mesmo padrao de ROUTING_PROVIDER (Fase 26).
export const MERCADO_PAGO_PROVIDER = 'MERCADO_PAGO_PROVIDER';
```

- [ ] **Step 2: Criar a interface do provider**

Create `apps/api/src/mercado-pago/providers/mercado-pago-provider.interface.ts`:

```ts
// Abstracao do provider de pagamento Mercado Pago -- o dominio
// (SubscriptionsService/MercadoPagoWebhookService) so conhece
// MercadoPagoService (o wrapper exportado pelo modulo), nunca este provider
// diretamente. Mesmo padrao de RoutingProviderPort (Fase 26): trocar de
// implementacao = trocar o binding do token MERCADO_PAGO_PROVIDER em
// mercado-pago.module.ts.
export interface CreatePreapprovalInput {
  reason: string;
  payerEmail: string;
  externalReference: string;
  transactionAmount: number;
  frequency: number;
  frequencyType: 'months';
  startDate: Date;
  backUrl: string;
}

export interface MercadoPagoPreapproval {
  id: string;
  /** Valor cru do Mercado Pago: 'pending' | 'authorized' | 'paused' | 'cancelled'. */
  status: string;
  payerId: string | null;
  externalReference: string | null;
  /** So preenchido pela resposta de criacao (link do checkout de autorizacao). */
  initPoint: string | null;
}

export interface MercadoPagoPayment {
  id: string;
  /** Valor cru do Mercado Pago: 'approved' | 'pending' | 'rejected' | ... */
  status: string;
  externalReference: string | null;
  transactionAmount: number;
}

export interface MercadoPagoProviderPort {
  isConfigured(): boolean;
  createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval>;
  getPreapproval(id: string): Promise<MercadoPagoPreapproval>;
  getPayment(id: string): Promise<MercadoPagoPayment>;
}
```

- [ ] **Step 3: Escrever o teste do provider "não configurado"**

Create `apps/api/src/mercado-pago/providers/not-configured-mercado-pago.provider.spec.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common';
import { NotConfiguredMercadoPagoProvider } from './not-configured-mercado-pago.provider';

const PREAPPROVAL_INPUT = {
  reason: 'Assinatura',
  payerEmail: 'admin@teste.com',
  externalReference: 'tenant-1',
  transactionAmount: 100,
  frequency: 1,
  frequencyType: 'months' as const,
  startDate: new Date(),
  backUrl: 'http://localhost:3000/settings/company',
};

describe('NotConfiguredMercadoPagoProvider', () => {
  it('isConfigured() e sempre false', () => {
    expect(new NotConfiguredMercadoPagoProvider().isConfigured()).toBe(false);
  });

  it('createPreapproval nunca simula dados -- sempre lanca erro claro', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
  });

  it('getPreapproval nunca simula dados', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.getPreapproval('123')).rejects.toThrow(ServiceUnavailableException);
  });

  it('getPayment nunca simula dados', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.getPayment('123')).rejects.toThrow(ServiceUnavailableException);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha (classe ainda não existe)**

Run: `pnpm --filter api test -- not-configured-mercado-pago.provider.spec`
Expected: FAIL com "Cannot find module './not-configured-mercado-pago.provider'"

- [ ] **Step 5: Implementar o provider "não configurado"**

Create `apps/api/src/mercado-pago/providers/not-configured-mercado-pago.provider.ts`:

```ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from './mercado-pago-provider.interface';

// Mesma logica de NotConfiguredRoutingProvider (Fase 26): nunca simula uma
// resposta do Mercado Pago. Usado quando MERCADO_PAGO_ACCESS_TOKEN nao esta
// configurado -- o resto do billing (fluxo manual) continua funcionando.
@Injectable()
export class NotConfiguredMercadoPagoProvider implements MercadoPagoProviderPort {
  isConfigured(): boolean {
    return false;
  }

  async createPreapproval(_input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    throw this.error();
  }

  async getPreapproval(_id: string): Promise<MercadoPagoPreapproval> {
    throw this.error();
  }

  async getPayment(_id: string): Promise<MercadoPagoPayment> {
    throw this.error();
  }

  private error(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Gateway de pagamento Mercado Pago nao configurado nesta instalacao (MERCADO_PAGO_ACCESS_TOKEN ausente).',
    );
  }
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `pnpm --filter api test -- not-configured-mercado-pago.provider.spec`
Expected: PASS (4 testes)

- [ ] **Step 7: Escrever o teste do provider HTTP**

Create `apps/api/src/mercado-pago/providers/mercado-pago-http.provider.spec.ts`:

```ts
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MercadoPagoHttpProvider } from './mercado-pago-http.provider';

function buildConfigService(accessToken?: string): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue({
      accessToken,
      webhookSecret: 'secret',
      adminWebUrl: 'http://localhost:3000',
      requestTimeoutMs: 8000,
    }),
  } as unknown as ConfigService<AppConfig, true>;
}

const PREAPPROVAL_INPUT = {
  reason: 'Assinatura PROFESSIONAL',
  payerEmail: 'admin@teste.com',
  externalReference: 'tenant-1',
  transactionAmount: 499.9,
  frequency: 1,
  frequencyType: 'months' as const,
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  backUrl: 'http://localhost:3000/settings/company',
};

describe('MercadoPagoHttpProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('true quando ha access token configurado', () => {
      expect(new MercadoPagoHttpProvider(buildConfigService('token-123')).isConfigured()).toBe(true);
    });

    it('false quando nao ha access token', () => {
      expect(new MercadoPagoHttpProvider(buildConfigService(undefined)).isConfigured()).toBe(false);
    });
  });

  describe('createPreapproval', () => {
    it('lanca ServiceUnavailableException sem tentar rede quando nao ha token', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService(undefined));
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('chama POST /preapproval com o corpo correto e converte a resposta', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'preapproval-1',
          status: 'pending',
          payer_id: null,
          external_reference: 'tenant-1',
          init_point: 'https://mercadopago.com/checkout/preapproval-1',
        }),
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await provider.createPreapproval(PREAPPROVAL_INPUT);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.mercadopago.com/preapproval',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        }),
      );
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.auto_recurring).toEqual({
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 499.9,
        currency_id: 'BRL',
        start_date: '2026-10-01T00:00:00.000Z',
      });
      expect(result).toEqual({
        id: 'preapproval-1',
        status: 'pending',
        payerId: null,
        externalReference: 'tenant-1',
        initPoint: 'https://mercadopago.com/checkout/preapproval-1',
      });
    });

    it('lanca ServiceUnavailableException quando o Mercado Pago responde com erro', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'invalid payer_email' }),
      }) as unknown as typeof fetch;

      await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('getPayment', () => {
    it('chama GET /v1/payments/:id e converte a resposta', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 987654,
          status: 'approved',
          external_reference: 'tenant-1',
          transaction_amount: 499.9,
        }),
      }) as unknown as typeof fetch;

      const result = await provider.getPayment('987654');

      expect(result).toEqual({
        id: '987654',
        status: 'approved',
        externalReference: 'tenant-1',
        transactionAmount: 499.9,
      });
    });
  });
});
```

- [ ] **Step 8: Rodar o teste e confirmar que falha**

Run: `pnpm --filter api test -- mercado-pago-http.provider.spec`
Expected: FAIL com "Cannot find module './mercado-pago-http.provider'"

- [ ] **Step 9: Implementar o provider HTTP**

Create `apps/api/src/mercado-pago/providers/mercado-pago-http.provider.ts`:

```ts
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from './mercado-pago-provider.interface';

const BASE_URL = 'https://api.mercadopago.com';

// Implementacao real de MercadoPagoProviderPort via fetch nativo do Node
// (disponivel desde o Node 18) -- mesmo padrao de GoogleRoutingProvider,
// nenhuma dependencia de SDK adicionada so para chamadas REST simples.
// Nunca loga o access token.
@Injectable()
export class MercadoPagoHttpProvider implements MercadoPagoProviderPort {
  private readonly logger = new Logger(MercadoPagoHttpProvider.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('mercadoPago', { infer: true }).accessToken);
  }

  async createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    const body = {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: input.frequency,
        frequency_type: input.frequencyType,
        transaction_amount: input.transactionAmount,
        currency_id: 'BRL',
        start_date: input.startDate.toISOString(),
      },
    };
    const json = await this.request('POST', '/preapproval', body);
    return this.toPreapproval(json);
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    const json = await this.request('GET', `/preapproval/${encodeURIComponent(id)}`);
    return this.toPreapproval(json);
  }

  async getPayment(id: string): Promise<MercadoPagoPayment> {
    const json = await this.request('GET', `/v1/payments/${encodeURIComponent(id)}`);
    return {
      id: String(json.id),
      status: String(json.status),
      externalReference: (json.external_reference as string | null) ?? null,
      transactionAmount: Number(json.transaction_amount),
    };
  }

  private toPreapproval(json: Record<string, unknown>): MercadoPagoPreapproval {
    return {
      id: String(json.id),
      status: String(json.status),
      payerId: json.payer_id != null ? String(json.payer_id) : null,
      externalReference: (json.external_reference as string | null) ?? null,
      initPoint: (json.init_point as string | null) ?? null,
    };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const mercadoPagoConfig = this.configService.get('mercadoPago', { infer: true });
    const accessToken = mercadoPagoConfig.accessToken;
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Provider Mercado Pago nao configurado (MERCADO_PAGO_ACCESS_TOKEN ausente).',
      );
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), mercadoPagoConfig.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error(
        `Falha de rede ao chamar Mercado Pago (${path}): ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('Nao foi possivel contatar o Mercado Pago.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      // Nunca repassa o corpo bruto do erro do Mercado Pago ao cliente (pode
      // conter detalhes de configuracao) -- so loga internamente.
      this.logger.error(`Mercado Pago respondeu ${response.status} em ${path}: ${JSON.stringify(json)}`);
      throw new ServiceUnavailableException('O Mercado Pago retornou um erro ao processar a solicitacao.');
    }

    if (!json) {
      throw new ServiceUnavailableException('Resposta invalida do Mercado Pago.');
    }

    return json;
  }
}
```

- [ ] **Step 10: Rodar os testes e confirmar que passam**

Run: `pnpm --filter api test -- mercado-pago-http.provider.spec`
Expected: PASS (7 testes)

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/mercado-pago
git commit -m "feat(billing): adiciona provider Mercado Pago (HTTP + nao-configurado)"
```

---

### Task 4: Utils Mercado Pago + MercadoPagoService + módulo

**Files:**
- Create: `apps/api/src/mercado-pago/utils/mercado-pago-recurrence.util.ts` + `.spec.ts`
- Create: `apps/api/src/mercado-pago/utils/mercado-pago-preapproval-status.util.ts` + `.spec.ts`
- Create: `apps/api/src/mercado-pago/utils/mercado-pago-signature.util.ts` + `.spec.ts`
- Create: `apps/api/src/mercado-pago/services/mercado-pago.service.ts`
- Create: `apps/api/src/mercado-pago/mercado-pago.module.ts`

**Interfaces:**
- Consumes: `MercadoPagoProviderPort`, `MERCADO_PAGO_PROVIDER` (Task 3); `AppConfig.mercadoPago` (Task 2).
- Produces: `toMercadoPagoRecurrence(periodicity: BillingPeriodicity): { frequency: number; frequencyType: 'months' }`; `mapMercadoPagoPreapprovalStatus(status: string): SubscriptionStatus | null`; `isValidMercadoPagoSignature(input): boolean`; `MercadoPagoService` (exportado por `MercadoPagoModule`) com métodos `isConfigured()`, `createPreapproval(input)`, `getPreapproval(id)`, `getPayment(id)` — consumidos pelas Tasks 5 e 8.

- [ ] **Step 1: Teste + implementação de `toMercadoPagoRecurrence`**

Create `apps/api/src/mercado-pago/utils/mercado-pago-recurrence.util.spec.ts`:

```ts
import { toMercadoPagoRecurrence } from './mercado-pago-recurrence.util';

describe('toMercadoPagoRecurrence', () => {
  it('MONTHLY vira frequency=1/months', () => {
    expect(toMercadoPagoRecurrence('MONTHLY')).toEqual({ frequency: 1, frequencyType: 'months' });
  });

  it('YEARLY vira frequency=12/months (Mercado Pago nao aceita frequency_type "years")', () => {
    expect(toMercadoPagoRecurrence('YEARLY')).toEqual({ frequency: 12, frequencyType: 'months' });
  });
});
```

Run: `pnpm --filter api test -- mercado-pago-recurrence.util.spec` — Expected: FAIL (módulo não existe).

Create `apps/api/src/mercado-pago/utils/mercado-pago-recurrence.util.ts`:

```ts
import { BillingPeriodicity } from '@prisma/client';

export interface MercadoPagoRecurrence {
  frequency: number;
  frequencyType: 'months';
}

// Mercado Pago (Preapproval API) so aceita frequency_type 'days' ou 'months'
// (nunca 'years') -- YEARLY vira frequency=12/months. MONTHLY vira
// frequency=1/months.
export function toMercadoPagoRecurrence(periodicity: BillingPeriodicity): MercadoPagoRecurrence {
  return periodicity === 'MONTHLY'
    ? { frequency: 1, frequencyType: 'months' }
    : { frequency: 12, frequencyType: 'months' };
}
```

Run: `pnpm --filter api test -- mercado-pago-recurrence.util.spec` — Expected: PASS.

- [ ] **Step 2: Teste + implementação de `mapMercadoPagoPreapprovalStatus`**

Create `apps/api/src/mercado-pago/utils/mercado-pago-preapproval-status.util.spec.ts`:

```ts
import { mapMercadoPagoPreapprovalStatus } from './mercado-pago-preapproval-status.util';

describe('mapMercadoPagoPreapprovalStatus', () => {
  it('authorized vira ACTIVE', () => {
    expect(mapMercadoPagoPreapprovalStatus('authorized')).toBe('ACTIVE');
  });

  it('paused vira SUSPENDED', () => {
    expect(mapMercadoPagoPreapprovalStatus('paused')).toBe('SUSPENDED');
  });

  it('cancelled vira CANCELLED', () => {
    expect(mapMercadoPagoPreapprovalStatus('cancelled')).toBe('CANCELLED');
  });

  it('pending vira PENDING', () => {
    expect(mapMercadoPagoPreapprovalStatus('pending')).toBe('PENDING');
  });

  it('status desconhecido retorna null (nunca inventa um status)', () => {
    expect(mapMercadoPagoPreapprovalStatus('algo_novo_da_api')).toBeNull();
  });
});
```

Run: `pnpm --filter api test -- mercado-pago-preapproval-status.util.spec` — Expected: FAIL.

Create `apps/api/src/mercado-pago/utils/mercado-pago-preapproval-status.util.ts`:

```ts
import { SubscriptionStatus } from '@prisma/client';

// Mapeia o status cru do preapproval do Mercado Pago para o SubscriptionStatus
// do nosso dominio. Retorna null para status desconhecido/sem mapeamento --
// o webhook ignora o evento nesse caso, nunca escreve um status inventado.
export function mapMercadoPagoPreapprovalStatus(status: string): SubscriptionStatus | null {
  switch (status) {
    case 'authorized':
      return 'ACTIVE';
    case 'paused':
      return 'SUSPENDED';
    case 'cancelled':
      return 'CANCELLED';
    case 'pending':
      return 'PENDING';
    default:
      return null;
  }
}
```

Run: `pnpm --filter api test -- mercado-pago-preapproval-status.util.spec` — Expected: PASS.

- [ ] **Step 3: Teste + implementação de `isValidMercadoPagoSignature`**

Create `apps/api/src/mercado-pago/utils/mercado-pago-signature.util.spec.ts`:

```ts
import { createHmac } from 'node:crypto';
import { isValidMercadoPagoSignature } from './mercado-pago-signature.util';

function buildSignature(dataId: string, requestId: string, secret: string, ts = '1700000000'): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('isValidMercadoPagoSignature', () => {
  const SECRET = 'webhook-secret-123';
  const DATA_ID = 'payment-987';
  const REQUEST_ID = 'req-1';

  it('aceita uma assinatura valida', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(true);
  });

  it('rejeita quando o hash nao bate (secret errado)', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, 'secret-errado');
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando o dataId foi alterado apos assinar', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: 'outro-id', secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando x-signature esta ausente', () => {
    expect(
      isValidMercadoPagoSignature({ xSignature: undefined, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando x-request-id esta ausente', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: undefined, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando o secret esta vazio', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: '' }),
    ).toBe(false);
  });
});
```

Run: `pnpm --filter api test -- mercado-pago-signature.util.spec` — Expected: FAIL.

Create `apps/api/src/mercado-pago/utils/mercado-pago-signature.util.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MercadoPagoSignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string;
  secret: string;
}

// Valida o header x-signature do webhook do Mercado Pago (formato
// "ts=<timestamp>,v1=<hash>"). Manifest e HMAC-SHA256 conforme documentacao
// oficial do Mercado Pago para validacao de notificacoes webhook. Comparacao
// em tempo constante (timingSafeEqual) -- nunca ===/comparacao ingenua de
// string, para nao vazar timing de qual prefixo do hash bateu.
export function isValidMercadoPagoSignature(input: MercadoPagoSignatureInput): boolean {
  const { xSignature, xRequestId, dataId, secret } = input;
  if (!xSignature || !xRequestId || !secret) {
    return false;
  }

  const parts = new Map<string, string>();
  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=').map((piece) => piece.trim());
    if (key && value) parts.set(key, value);
  }

  const timestamp = parts.get('ts');
  const receivedHash = parts.get('v1');
  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
```

Run: `pnpm --filter api test -- mercado-pago-signature.util.spec` — Expected: PASS (6 testes).

- [ ] **Step 4: Criar `MercadoPagoService` (wrapper exportado)**

Create `apps/api/src/mercado-pago/services/mercado-pago.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { MERCADO_PAGO_PROVIDER } from '../mercado-pago.constants';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from '../providers/mercado-pago-provider.interface';

// Wrapper fino sobre MercadoPagoProviderPort -- unico ponto exportado pelo
// MercadoPagoModule (mesmo padrao de RoutingService/RoutingProviderPort,
// Fase 26). Outros modulos injetam MercadoPagoService, nunca o provider.
@Injectable()
export class MercadoPagoService {
  constructor(@Inject(MERCADO_PAGO_PROVIDER) private readonly provider: MercadoPagoProviderPort) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    return this.provider.createPreapproval(input);
  }

  getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    return this.provider.getPreapproval(id);
  }

  getPayment(id: string): Promise<MercadoPagoPayment> {
    return this.provider.getPayment(id);
  }
}
```

- [ ] **Step 5: Criar `MercadoPagoModule`**

Create `apps/api/src/mercado-pago/mercado-pago.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MERCADO_PAGO_PROVIDER } from './mercado-pago.constants';
import { MercadoPagoHttpProvider } from './providers/mercado-pago-http.provider';
import { MercadoPagoProviderPort } from './providers/mercado-pago-provider.interface';
import { NotConfiguredMercadoPagoProvider } from './providers/not-configured-mercado-pago.provider';
import { MercadoPagoService } from './services/mercado-pago.service';

// Modulo isolado (mesmo padrao de RoutingModule, Fase 26): o binding do
// token MERCADO_PAGO_PROVIDER decide em runtime, uma unica vez no boot, qual
// implementacao esta ativa -- MercadoPagoHttpProvider quando
// MERCADO_PAGO_ACCESS_TOKEN esta configurada, senao
// NotConfiguredMercadoPagoProvider (nunca simula dados). So MercadoPagoService
// e exportado -- nenhum outro modulo injeta o provider diretamente.
@Module({
  providers: [
    MercadoPagoService,
    MercadoPagoHttpProvider,
    NotConfiguredMercadoPagoProvider,
    {
      provide: MERCADO_PAGO_PROVIDER,
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        http: MercadoPagoHttpProvider,
        notConfigured: NotConfiguredMercadoPagoProvider,
      ): MercadoPagoProviderPort =>
        configService.get('mercadoPago', { infer: true }).accessToken ? http : notConfigured,
      inject: [ConfigService, MercadoPagoHttpProvider, NotConfiguredMercadoPagoProvider],
    },
  ],
  exports: [MercadoPagoService],
})
export class MercadoPagoModule {}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter api typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/mercado-pago
git commit -m "feat(billing): adiciona MercadoPagoService/MercadoPagoModule e utils"
```

---

### Task 5: `SubscriptionsService` — reaproveitar lógica de pagamento + self-service

**Files:**
- Modify: `apps/api/src/billing/services/subscriptions.service.ts`
- Modify: `apps/api/src/billing/mappers/subscription.mapper.ts`
- Modify: `apps/api/src/billing/entities/subscription-payment.entity.ts`
- Modify: `apps/api/src/billing/billing.module.ts`

**Interfaces:**
- Consumes: `MercadoPagoService`, `toMercadoPagoRecurrence` (Task 4).
- Produces: `SubscriptionsService.recordPaymentInTransaction(tx, subscription, data)` (público, usado pela Task 8); `SubscriptionsService.getOwnSubscription(tenantId)`; `SubscriptionsService.createMercadoPagoAuthorization(tenantId, payerEmail): Promise<{ initPoint: string }>` — consumidos pela Task 7.

- [ ] **Step 1: Atualizar o mapper para `creator` opcional**

Em `apps/api/src/billing/mappers/subscription.mapper.ts`, troque:

```ts
export type SubscriptionPaymentWithCreator = SubscriptionPayment & { creator: { name: string } };

export function toSubscriptionPaymentEntity(payment: SubscriptionPaymentWithCreator): SubscriptionPaymentEntity {
  const entity = new SubscriptionPaymentEntity();
  entity.id = payment.id;
  entity.tenantId = payment.tenantId;
  entity.subscriptionId = payment.subscriptionId;
  entity.amount = payment.amount.toNumber();
  entity.dueDate = payment.dueDate;
  entity.paidAt = payment.paidAt;
  entity.paymentMethod = payment.paymentMethod;
  entity.status = payment.status;
  entity.reference = payment.reference;
  entity.createdBy = payment.createdBy;
  entity.createdByName = payment.creator.name;
  entity.createdAt = payment.createdAt;
  return entity;
}
```

por:

```ts
export type SubscriptionPaymentWithCreator = SubscriptionPayment & { creator: { name: string } | null };

// creator e null quando o pagamento foi criado pelo webhook do Mercado Pago
// (sem ator humano, ver SubscriptionsService.recordPaymentInTransaction) --
// createdByName sempre tem um valor de exibicao, nunca fica vazio na UI.
export function toSubscriptionPaymentEntity(payment: SubscriptionPaymentWithCreator): SubscriptionPaymentEntity {
  const entity = new SubscriptionPaymentEntity();
  entity.id = payment.id;
  entity.tenantId = payment.tenantId;
  entity.subscriptionId = payment.subscriptionId;
  entity.amount = payment.amount.toNumber();
  entity.dueDate = payment.dueDate;
  entity.paidAt = payment.paidAt;
  entity.paymentMethod = payment.paymentMethod;
  entity.status = payment.status;
  entity.reference = payment.reference;
  entity.createdBy = payment.createdBy;
  entity.createdByName = payment.creator?.name ?? 'Mercado Pago (automatico)';
  entity.createdAt = payment.createdAt;
  return entity;
}
```

- [ ] **Step 2: Atualizar `SubscriptionPaymentEntity.createdBy` para nullable**

Em `apps/api/src/billing/entities/subscription-payment.entity.ts`, troque:

```ts
  @ApiProperty({ format: 'uuid' })
  createdBy!: string;
```

por:

```ts
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null quando o pagamento foi criado via webhook (sem ator humano).' })
  createdBy!: string | null;
```

- [ ] **Step 3: Rodar a suíte e2e existente (regressão do mapper)**

Run: `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: PASS (pagamentos manuais continuam com `creator` preenchido, `createdByName` = nome do usuário).

- [ ] **Step 4: Extrair `recordPaymentInTransaction` de `registerPayment`**

Em `apps/api/src/billing/services/subscriptions.service.ts`, adicione aos imports do topo:

```ts
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MercadoPagoService } from '../../mercado-pago/services/mercado-pago.service';
import { toMercadoPagoRecurrence } from '../../mercado-pago/utils/mercado-pago-recurrence.util';
```

e troque `ConflictException, Injectable, NotFoundException` por `ConflictException, Injectable, NotFoundException, ServiceUnavailableException` na linha de import de `@nestjs/common`.

Troque o construtor:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
```

por:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}
```

Troque o método `registerPayment` inteiro (do `async registerPayment(` até o `}` que fecha o método, incluindo o bloco `$transaction`):

```ts
  async registerPayment(
    id: string,
    dto: RegisterPaymentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<SubscriptionPaymentEntity> {
    const subscription = await this.findByIdOrThrow(id);

    const paidAt = dto.paidAt
      ? new Date(dto.paidAt)
      : dto.status === 'PAID'
        ? new Date()
        : null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPayment.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: id,
          amount: dto.amount,
          dueDate: new Date(dto.dueDate),
          paidAt,
          paymentMethod: dto.paymentMethod,
          status: dto.status,
          createdBy: actor.userId,
          ...compact({ reference: dto.reference }),
        },
        include: CREATOR_INCLUDE,
      });

      if (dto.status === 'PAID') {
        const nextDueDate = computeNextDueDate(
          subscription.nextDueDate,
          subscription.periodicity,
          subscription.dueDay,
        );
        await tx.tenantSubscription.update({
          where: { id },
          data: { nextDueDate, status: 'ACTIVE' },
        });
      }

      return created;
    });

    await this.audit.log({
      tenantId: subscription.tenantId,
      userId: actor.userId,
      action: 'billing.payment_registered',
      entityName: 'SubscriptionPayment',
      entityId: payment.id,
      newValue: toJsonSafe({
        subscriptionId: id,
        amount: payment.amount,
        dueDate: payment.dueDate,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toSubscriptionPaymentEntity(payment);
  }
```

por:

```ts
  async registerPayment(
    id: string,
    dto: RegisterPaymentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<SubscriptionPaymentEntity> {
    const subscription = await this.findByIdOrThrow(id);

    const paidAt = dto.paidAt
      ? new Date(dto.paidAt)
      : dto.status === 'PAID'
        ? new Date()
        : null;

    const payment = await this.prisma.$transaction((tx) =>
      this.recordPaymentInTransaction(tx, subscription, {
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        paidAt,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        createdBy: actor.userId,
        ...compact({ reference: dto.reference }),
      }),
    );

    await this.audit.log({
      tenantId: subscription.tenantId,
      userId: actor.userId,
      action: 'billing.payment_registered',
      entityName: 'SubscriptionPayment',
      entityId: payment.id,
      newValue: toJsonSafe({
        subscriptionId: id,
        amount: payment.amount,
        dueDate: payment.dueDate,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toSubscriptionPaymentEntity(payment);
  }

  // Extraido de registerPayment para ser reaproveitado pelo webhook do
  // Mercado Pago (Task 8) -- MESMA logica transacional (criar o registro +
  // avancar nextDueDate/status quando PAID), nunca duplicada. Publico de
  // proposito: MercadoPagoWebhookService chama isto diretamente (mesmo
  // modulo `billing`, nunca cross-module).
  async recordPaymentInTransaction(
    tx: Prisma.TransactionClient,
    subscription: TenantSubscription,
    data: {
      amount: Prisma.Decimal | number;
      dueDate: Date;
      paidAt: Date | null;
      paymentMethod: SubscriptionPaymentMethod;
      status: SubscriptionPaymentStatus;
      createdBy: string | null;
      reference?: string;
      externalPaymentId?: string;
    },
  ): Promise<SubscriptionPaymentWithCreator> {
    const created = await tx.subscriptionPayment.create({
      data: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        amount: data.amount,
        dueDate: data.dueDate,
        paidAt: data.paidAt,
        paymentMethod: data.paymentMethod,
        status: data.status,
        ...compact({
          createdBy: data.createdBy ?? undefined,
          reference: data.reference,
          externalPaymentId: data.externalPaymentId,
        }),
      },
      include: CREATOR_INCLUDE,
    });

    if (data.status === 'PAID') {
      const nextDueDate = computeNextDueDate(
        subscription.nextDueDate,
        subscription.periodicity,
        subscription.dueDay,
      );
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: { nextDueDate, status: 'ACTIVE' },
      });
    }

    return created;
  }
```

Adicione `TenantSubscription, SubscriptionPaymentMethod, SubscriptionPaymentStatus` ao import de `@prisma/client` no topo do arquivo (hoje só importa `Prisma`):

```ts
import { Prisma, SubscriptionPaymentMethod, SubscriptionPaymentStatus, TenantSubscription } from '@prisma/client';
```

- [ ] **Step 5: Rodar a suíte e2e (comportamento de `registerPayment` idêntico)**

Run: `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: PASS — nenhum cenário muda (a extração preserva o comportamento).

- [ ] **Step 6: Adicionar `getOwnSubscription` e `createMercadoPagoAuthorization`**

No mesmo arquivo, logo antes do método privado `findByIdOrThrow`, adicione:

```ts
  // [Mercado Pago] Self-service: GET /billing/subscriptions/me.
  async getOwnSubscription(tenantId: string): Promise<SubscriptionEntity> {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: TENANT_INCLUDE,
    });
    if (!subscription) {
      throw new NotFoundException('Este tenant nao possui assinatura cadastrada.');
    }
    const lastPayment = await this.prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: subscription.id },
      orderBy: { createdAt: 'desc' },
    });
    return toSubscriptionEntity(subscription, lastPayment);
  }

  // [Mercado Pago] Self-service: POST /billing/subscriptions/me/mercado-pago/authorization.
  // Cria o preapproval no Mercado Pago e devolve o link de checkout para o
  // tenant ADMIN autorizar o cartao -- dado de cartao nunca trafega por
  // aqui, so pelo checkout do proprio Mercado Pago.
  async createMercadoPagoAuthorization(tenantId: string, payerEmail: string): Promise<{ initPoint: string }> {
    const subscription = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      throw new NotFoundException('Este tenant nao possui assinatura cadastrada.');
    }
    if (subscription.paymentMethod !== 'MERCADO_PAGO') {
      throw new ConflictException('Esta assinatura nao esta configurada para cobranca via Mercado Pago.');
    }

    const recurrence = toMercadoPagoRecurrence(subscription.periodicity);
    const adminWebUrl = this.configService.get('mercadoPago', { infer: true }).adminWebUrl;
    const preapproval = await this.mercadoPago.createPreapproval({
      reason: `Assinatura ${subscription.planTier} - transportadoras-saas`,
      payerEmail,
      externalReference: tenantId,
      transactionAmount: subscription.amount.toNumber(),
      frequency: recurrence.frequency,
      frequencyType: recurrence.frequencyType,
      startDate: subscription.nextDueDate,
      backUrl: `${adminWebUrl}/settings/company`,
    });

    if (!preapproval.initPoint) {
      throw new ServiceUnavailableException('Mercado Pago nao retornou o link de autorizacao.');
    }

    await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: { externalSubscriptionId: preapproval.id },
    });

    return { initPoint: preapproval.initPoint };
  }
```

- [ ] **Step 7: Atualizar `billing.module.ts` para importar `MercadoPagoModule`**

Em `apps/api/src/billing/billing.module.ts`, troque:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingLifecycleScheduler } from './services/billing-lifecycle.scheduler';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, BillingDashboardService, BillingLifecycleService, BillingLifecycleScheduler],
})
export class BillingModule {}
```

por:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoPagoModule } from '../mercado-pago/mercado-pago.module';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingLifecycleScheduler } from './services/billing-lifecycle.scheduler';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [ScheduleModule.forRoot(), MercadoPagoModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, BillingDashboardService, BillingLifecycleService, BillingLifecycleScheduler],
})
export class BillingModule {}
```

- [ ] **Step 8: Typecheck e regressão e2e**

Run: `pnpm --filter api typecheck`
Expected: sem erros (os novos métodos ainda não são chamados por nenhum controller, isso é normal — serão usados na Task 7).

Run: `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/billing
git commit -m "feat(billing): extrai recordPaymentInTransaction e adiciona metodos self-service Mercado Pago"
```

---

### Task 6: `BillingLifecycleService` ignora assinaturas Mercado Pago

**Files:**
- Modify: `apps/api/src/billing/services/billing-lifecycle.service.ts`
- Create: `apps/api/test/mercado-pago-billing.e2e-spec.ts` (arquivo novo, cenário inicial)

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: nenhuma nova (mudança de comportamento apenas).

- [ ] **Step 1: Criar o arquivo e2e com o primeiro cenário (falha esperada)**

Create `apps/api/test/mercado-pago-billing.e2e-spec.ts`:

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BillingLifecycleService } from '../src/billing/services/billing-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Fase Mercado Pago -- cobre self-service (autorizacao), webhook
// (preapproval/pagamento) e a exclusao de assinaturas MERCADO_PAGO do
// scheduler de inadimplencia manual. Sempre contra infraestrutura real
// (app Nest completo + Postgres), mesmo padrao de billing.e2e-spec.ts.
// Nenhuma chamada de rede real ao Mercado Pago -- ver FakeMercadoPagoProvider
// (Task 7) para o override de DI.
describe('Mercado Pago Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycleService: BillingLifecycleService;
  const createdTenantIds: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    lifecycleService = app.get(BillingLifecycleService);
  });

  afterAll(async () => {
    await prisma.subscriptionPayment
      .deleteMany({ where: { tenantId: { in: createdTenantIds } } })
      .catch(() => undefined);
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  function randomCnpj(): string {
    return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  }

  function buildCreateTenantPayload(labelSuffix: string) {
    const unique = randomUUID().replace(/-/g, '').slice(0, 12);
    return {
      name: `Transportadora ${labelSuffix} ${unique}`,
      document: randomCnpj(),
      slug: `mp-${labelSuffix.toLowerCase()}-${unique}`,
      admin: {
        name: `Admin ${labelSuffix}`,
        email: `admin-${labelSuffix.toLowerCase()}-${unique}@teste.com`,
        password: 'SenhaForte123!',
      },
    };
  }

  async function createTenantWithSuperAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    await prisma.userAccount.update({
      where: { tenantId_email: { tenantId, email: payload.admin.email } },
      data: { role: 'SUPER_ADMIN' },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, superAdminAccessToken: loginRes.body.data.accessToken as string };
  }

  async function createTenantWithAdmin(label: string) {
    const payload = buildCreateTenantPayload(label);
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/tenants')
      .send(payload)
      .expect(201);
    const tenantId = createRes.body.data.id;
    createdTenantIds.push(tenantId);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email: payload.admin.email, password: payload.admin.password })
      .expect(200);

    return { tenantId, adminAccessToken: loginRes.body.data.accessToken as string, adminEmail: payload.admin.email };
  }

  async function createMercadoPagoSubscription(superAdminAccessToken: string, tenantId: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/billing/subscriptions')
      .set('Authorization', `Bearer ${superAdminAccessToken}`)
      .send({
        tenantId,
        planTier: 'PROFESSIONAL',
        amount: 499.9,
        periodicity: 'MONTHLY',
        paymentMethod: 'MERCADO_PAGO',
        startDate: '2026-01-01',
        dueDay: 10,
      })
      .expect(201);
    return res.body.data;
  }

  describe('BillingLifecycleService.markOverdueSubscriptions', () => {
    it('nunca marca uma assinatura MERCADO_PAGO como OVERDUE (quem decide isso e o proprio Mercado Pago)', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('LifecycleMp');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      await prisma.tenantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', nextDueDate: new Date('2020-01-01') },
      });

      await lifecycleService.markOverdueSubscriptions();

      const after = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(after?.status).toBe('ACTIVE');
    });

    it('continua marcando uma assinatura manual vencida como OVERDUE (regressao)', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('LifecycleManual');
      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          tenantId,
          planTier: 'STARTER',
          amount: 199.9,
          periodicity: 'MONTHLY',
          paymentMethod: 'PIX_SCHEDULED',
          startDate: '2026-01-01',
          dueDay: 10,
        })
        .expect(201);
      const subscription = res.body.data;

      await prisma.tenantSubscription.update({
        where: { id: subscription.id },
        data: { status: 'ACTIVE', nextDueDate: new Date('2020-01-01') },
      });

      await lifecycleService.markOverdueSubscriptions();

      const after = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(after?.status).toBe('OVERDUE');
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que o primeiro teste falha (comportamento ainda não implementado)**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: FAIL no primeiro teste (`after?.status` vem `'OVERDUE'`, esperado `'ACTIVE'`). O segundo teste (regressão) já passa.

- [ ] **Step 3: Implementar a exclusão em `BillingLifecycleService`**

Em `apps/api/src/billing/services/billing-lifecycle.service.ts`, troque:

```ts
  async markOverdueSubscriptions(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.tenantSubscription.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING'] }, nextDueDate: { lt: now } },
      select: { id: true },
    });
```

por:

```ts
  // [Mercado Pago] Assinaturas MERCADO_PAGO nunca entram aqui -- quem decide
  // que uma cobranca recorrente atrasou e o proprio Mercado Pago (retry de
  // cobranca + eventual paused/cancelled do preapproval), refletido via
  // webhook (ver MercadoPagoWebhookService), nunca por este cron baseado em
  // nextDueDate local.
  async markOverdueSubscriptions(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.tenantSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING'] },
        nextDueDate: { lt: now },
        paymentMethod: { not: 'MERCADO_PAGO' },
      },
      select: { id: true },
    });
```

- [ ] **Step 4: Rodar e confirmar que os dois testes passam**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/services/billing-lifecycle.service.ts apps/api/test/mercado-pago-billing.e2e-spec.ts
git commit -m "feat(billing): exclui assinaturas MERCADO_PAGO do scheduler de inadimplencia manual"
```

---

### Task 7: Endpoints self-service (`GET/POST /billing/subscriptions/me...`)

**Files:**
- Create: `apps/api/src/billing/entities/mercado-pago-authorization.entity.ts`
- Modify: `apps/api/src/billing/controllers/subscriptions.controller.ts`
- Modify: `apps/api/test/mercado-pago-billing.e2e-spec.ts`

**Interfaces:**
- Consumes: `SubscriptionsService.getOwnSubscription`, `SubscriptionsService.createMercadoPagoAuthorization` (Task 5).
- Produces: `GET /billing/subscriptions/me` (`@Roles(ADMIN, SUPER_ADMIN)`), `POST /billing/subscriptions/me/mercado-pago/authorization` (`@Roles(ADMIN, SUPER_ADMIN)`) — consumidos pelo frontend na Task 10.

- [ ] **Step 1: Criar `MercadoPagoAuthorizationEntity`**

Create `apps/api/src/billing/entities/mercado-pago-authorization.entity.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class MercadoPagoAuthorizationEntity {
  @ApiProperty({ description: 'URL de checkout do Mercado Pago para o tenant autorizar a cobranca recorrente.' })
  initPoint!: string;
}
```

- [ ] **Step 2: Adicionar os cenários de self-service ao e2e (falha esperada)**

No arquivo `apps/api/test/mercado-pago-billing.e2e-spec.ts`, adicione um novo `describe`, dentro do `describe('Mercado Pago Billing (e2e)', ...)`, logo depois do bloco `BillingLifecycleService.markOverdueSubscriptions`:

```ts
  describe('Self-service (GET /billing/subscriptions/me, POST .../mercado-pago/authorization)', () => {
    it('tenant ADMIN consulta a propria assinatura', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceGet');
      await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.data.paymentMethod).toBe('MERCADO_PAGO');
    });

    it('404 quando o tenant nao tem assinatura cadastrada', async () => {
      const { tenantId, adminAccessToken } = await createTenantWithAdmin('SelfServiceNoSub');
      await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);
    });

    it('403 quando o usuario e DRIVER', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceDriver');
      await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken, adminEmail } = await createTenantWithAdmin('SelfServiceDriver2');
      await prisma.userAccount.update({
        where: { tenantId_email: { tenantId, email: adminEmail } },
        data: {},
      }).catch(() => undefined);

      // Reaproveita o proprio tenant criado com SUPER_ADMIN, mas rebaixa o
      // usuario logado para DRIVER antes de chamar a rota self-service.
      const loginPayload = buildCreateTenantPayload('SelfServiceDriver3');
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tenants')
        .send(loginPayload)
        .expect(201);
      createdTenantIds.push(createRes.body.data.id);
      await prisma.userAccount.update({
        where: { tenantId_email: { tenantId: createRes.body.data.id, email: loginPayload.admin.email } },
        data: { role: 'DRIVER' },
      });
      const driverLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: createRes.body.data.id, email: loginPayload.admin.email, password: loginPayload.admin.password })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/billing/subscriptions/me')
        .set('Authorization', `Bearer ${driverLogin.body.data.accessToken}`)
        .expect(403);
    });

    it('cria a autorizacao e persiste o externalSubscriptionId', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceAuth');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);

      expect(res.body.data.initPoint).toContain('https://');

      const updated = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(updated?.externalSubscriptionId).toBeTruthy();
    });

    it('409 quando a assinatura nao esta configurada para Mercado Pago', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('SelfServiceWrongMethod');
      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions')
        .set('Authorization', `Bearer ${superAdminAccessToken}`)
        .send({
          tenantId,
          planTier: 'STARTER',
          amount: 199.9,
          periodicity: 'MONTHLY',
          paymentMethod: 'PIX_SCHEDULED',
          startDate: '2026-01-01',
          dueDay: 10,
        })
        .expect(201);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);

      await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(409);
    });
  });
```

Adicione também o helper `loginAsTenantAdmin` (o ADMIN inicial já é criado por `createTenantWithSuperAdmin` — este helper faz login como esse mesmo usuário, que continua com email/senha conhecidos, ANTES de ser promovido a SUPER_ADMIN é o mesmo registro; para simplificar, o helper cria um SEGUNDO usuário ADMIN no mesmo tenant). Adicione perto dos outros helpers, antes do primeiro `describe`:

```ts
  async function loginAsTenantAdmin(tenantId: string) {
    const email = `admin2-${randomUUID().replace(/-/g, '').slice(0, 10)}@teste.com`;
    const password = 'SenhaForte123!';
    await prisma.userAccount.create({
      data: {
        tenantId,
        name: 'Admin Self-Service',
        email,
        password: await import('argon2').then((argon2) => argon2.hash(password)),
        role: 'ADMIN',
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    return { adminAccessToken: loginRes.body.data.accessToken as string, email };
  }
```

E, no topo do arquivo, adicione o override do provider Mercado Pago (fake, sem rede real) no `beforeAll`. Troque:

```ts
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
```

por:

```ts
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MERCADO_PAGO_PROVIDER)
      .useValue(fakeMercadoPagoProvider)
      .compile();
    app = moduleRef.createNestApplication();
```

E adicione, antes da declaração de `describe('Mercado Pago Billing (e2e)', ...)`:

```ts
import { MERCADO_PAGO_PROVIDER } from '../src/mercado-pago/mercado-pago.constants';
import {
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from '../src/mercado-pago/providers/mercado-pago-provider.interface';

// Fake deterministico via override de DI (mesmo padrao de
// FakeRoutingProvider em routing.e2e-spec.ts, Fase 26) -- exercita 100% da
// integracao real do NOSSO sistema sem depender de rede externa.
class FakeMercadoPagoProvider implements MercadoPagoProviderPort {
  preapprovals = new Map<string, MercadoPagoPreapproval>();
  payments = new Map<string, MercadoPagoPayment>();
  private counter = 0;

  isConfigured(): boolean {
    return true;
  }

  async createPreapproval(input: {
    externalReference: string;
    payerEmail: string;
  }): Promise<MercadoPagoPreapproval> {
    const id = `preapproval-${++this.counter}`;
    const preapproval: MercadoPagoPreapproval = {
      id,
      status: 'pending',
      payerId: null,
      externalReference: input.externalReference,
      initPoint: `https://mercadopago.com/checkout/${id}`,
    };
    this.preapprovals.set(id, preapproval);
    return preapproval;
  }

  async getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    const preapproval = this.preapprovals.get(id);
    if (!preapproval) throw new Error(`FakeMercadoPagoProvider: preapproval ${id} nao encontrado.`);
    return preapproval;
  }

  async getPayment(id: string): Promise<MercadoPagoPayment> {
    const payment = this.payments.get(id);
    if (!payment) throw new Error(`FakeMercadoPagoProvider: payment ${id} nao encontrado.`);
    return payment;
  }

  // Helpers de teste (Task 8 usa authorize()/enqueuePayment()).
  authorize(preapprovalId: string, payerId = 'payer-1'): void {
    const preapproval = this.preapprovals.get(preapprovalId);
    if (preapproval) this.preapprovals.set(preapprovalId, { ...preapproval, status: 'authorized', payerId });
  }

  setPreapprovalStatus(preapprovalId: string, status: string): void {
    const preapproval = this.preapprovals.get(preapprovalId);
    if (preapproval) this.preapprovals.set(preapprovalId, { ...preapproval, status });
  }

  enqueuePayment(payment: MercadoPagoPayment): void {
    this.payments.set(payment.id, payment);
  }
}

const fakeMercadoPagoProvider = new FakeMercadoPagoProvider();
```

- [ ] **Step 3: Rodar e confirmar que os testes de self-service falham (rotas ainda não existem)**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: FAIL nos 5 novos testes (404 genérico do Nest para rota inexistente).

- [ ] **Step 4: Adicionar os endpoints ao controller**

Em `apps/api/src/billing/controllers/subscriptions.controller.ts`, atualize os imports do topo:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { ADMIN_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { BillingDashboardQueryDto } from '../dto/billing-dashboard-query.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { FindSubscriptionsQueryDto } from '../dto/find-subscriptions-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { BillingDashboardEntity } from '../entities/billing-dashboard.entity';
import { PaginatedSubscriptionPaymentsEntity } from '../entities/paginated-subscription-payments.entity';
import { PaginatedSubscriptionsEntity } from '../entities/paginated-subscriptions.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { BillingDashboardService } from '../services/billing-dashboard.service';
import { SubscriptionsService } from '../services/subscriptions.service';
```

por:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Tenant, UserRole } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { ADMIN_THROTTLE } from '../../common/constants/throttle.constants';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentTenant } from '../../tenants/decorators/current-tenant.decorator';
import { BillingDashboardQueryDto } from '../dto/billing-dashboard-query.dto';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { FindSubscriptionsQueryDto } from '../dto/find-subscriptions-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { BillingDashboardEntity } from '../entities/billing-dashboard.entity';
import { MercadoPagoAuthorizationEntity } from '../entities/mercado-pago-authorization.entity';
import { PaginatedSubscriptionPaymentsEntity } from '../entities/paginated-subscription-payments.entity';
import { PaginatedSubscriptionsEntity } from '../entities/paginated-subscriptions.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';
import { BillingDashboardService } from '../services/billing-dashboard.service';
import { SubscriptionsService } from '../services/subscriptions.service';
```

Insira os dois novos métodos logo após `findAll` e **antes** de `create` (rotas literais precisam vir antes de `subscriptions/:id`, mesma ordem de `tenants.controller.ts`):

```ts
  @Get('subscriptions/me')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: '[Self-service] Consulta a assinatura do tenant autenticado.' })
  @ApiOkResponse({ type: SubscriptionEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao possui assinatura cadastrada.' })
  findOwn(@CurrentTenant() tenant: Tenant): Promise<SubscriptionEntity> {
    return this.subscriptionsService.getOwnSubscription(tenant.id);
  }

  @Post('subscriptions/me/mercado-pago/authorization')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      '[Self-service] Cria a autorizacao de cobranca recorrente no Mercado Pago (Preapproval) e devolve o link de checkout.',
  })
  @ApiCreatedResponse({ type: MercadoPagoAuthorizationEntity })
  @ApiNotFoundResponse({ description: 'Tenant nao possui assinatura cadastrada.' })
  createMercadoPagoAuthorization(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser('email') payerEmail: string,
  ): Promise<MercadoPagoAuthorizationEntity> {
    return this.subscriptionsService.createMercadoPagoAuthorization(tenant.id, payerEmail);
  }

```

- [ ] **Step 5: Rodar e confirmar que os testes passam**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: PASS (7 testes no total).

- [ ] **Step 6: Rodar a suíte completa de billing (regressão)**

Run: `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/billing apps/api/test/mercado-pago-billing.e2e-spec.ts
git commit -m "feat(billing): adiciona endpoints self-service de autorizacao Mercado Pago"
```

---

### Task 8: Webhook Mercado Pago

**Files:**
- Modify: `apps/api/src/common/constants/throttle.constants.ts`
- Create: `apps/api/src/billing/services/mercado-pago-webhook.service.ts`
- Create: `apps/api/src/billing/controllers/mercado-pago-webhook.controller.ts`
- Modify: `apps/api/src/billing/billing.module.ts`
- Modify: `apps/api/test/mercado-pago-billing.e2e-spec.ts`

**Interfaces:**
- Consumes: `MercadoPagoService`, `isValidMercadoPagoSignature`, `mapMercadoPagoPreapprovalStatus` (Task 4); `SubscriptionsService.recordPaymentInTransaction` (Task 5).
- Produces: `POST /billing/webhooks/mercado-pago` (`@Public()`).

- [ ] **Step 1: Adicionar `WEBHOOK_THROTTLE`**

Em `apps/api/src/common/constants/throttle.constants.ts`, ao final do arquivo, adicione:

```ts

// Fase Mercado Pago -- webhook publico (sem JWT). Volume pode ser maior que
// um usuario humano clicando (varias notificacoes por cobranca), mas ainda
// precisa de um teto -- nunca ilimitado so por ser @Public().
export const WEBHOOK_THROTTLE = { default: { limit: 60, ttl: 60_000 } };
```

- [ ] **Step 2: Adicionar os cenários de webhook ao e2e (falha esperada)**

No arquivo `apps/api/test/mercado-pago-billing.e2e-spec.ts`, adicione ao topo (junto aos outros imports):

```ts
import { createHmac } from 'node:crypto';
```

E adicione um helper perto dos outros (após `loginAsTenantAdmin`):

```ts
  function signWebhook(dataId: string, requestId: string, secret: string): { xSignature: string; xRequestId: string } {
    const ts = Math.floor(Date.now() / 1000).toString();
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = createHmac('sha256', secret).update(manifest).digest('hex');
    return { xSignature: `ts=${ts},v1=${hash}`, xRequestId: requestId };
  }
```

**Atenção:** este teste precisa saber o `MERCADO_PAGO_WEBHOOK_SECRET` configurado no ambiente de teste. Confirme (ou adicione, se ainda não existir) no `.env` de teste da API (`apps/api/.env.test` ou equivalente já usado por `test:e2e` — verifique qual arquivo o `test:e2e` carrega hoje) a linha `MERCADO_PAGO_WEBHOOK_SECRET=teste-webhook-secret-32-caracteres`, e use essa mesma string literal no teste abaixo (constante `WEBHOOK_SECRET`).

Adicione o novo `describe`, dentro do `describe('Mercado Pago Billing (e2e)', ...)`, após o bloco de self-service:

```ts
  describe('Webhook (POST /billing/webhooks/mercado-pago)', () => {
    const WEBHOOK_SECRET = 'teste-webhook-secret-32-caracteres';

    it('401 quando a assinatura e invalida', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', 'ts=123,v1=hash-invalido')
        .set('x-request-id', 'req-invalido')
        .send({ type: 'payment', data: { id: 'payment-invalido' } })
        .expect(401);
    });

    it('preapproval autorizado atualiza a assinatura para ACTIVE', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookPreapproval');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const { adminAccessToken } = await loginAsTenantAdmin(tenantId);
      const authRes = await request(app.getHttpServer())
        .post('/api/v1/billing/subscriptions/me/mercado-pago/authorization')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(201);
      void authRes;

      const updated = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      const preapprovalId = updated!.externalSubscriptionId!;
      fakeMercadoPagoProvider.authorize(preapprovalId, 'payer-123');

      const { xSignature, xRequestId } = signWebhook(preapprovalId, 'req-preapproval-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'preapproval', data: { id: preapprovalId } })
        .expect(200);

      const afterWebhook = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(afterWebhook?.status).toBe('ACTIVE');
      expect(afterWebhook?.externalCustomerId).toBe('payer-123');
    });

    it('pagamento aprovado cria SubscriptionPayment e avanca nextDueDate', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookPayment');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);
      const originalNextDueDate = new Date(subscription.nextDueDate);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-1',
        status: 'approved',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      const { xSignature, xRequestId } = signWebhook('payment-1', 'req-payment-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'payment', data: { id: 'payment-1' } })
        .expect(200);

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0].externalPaymentId).toBe('payment-1');
      expect(payments[0].createdBy).toBeNull();

      const updatedSubscription = await prisma.tenantSubscription.findUnique({ where: { id: subscription.id } });
      expect(updatedSubscription?.status).toBe('ACTIVE');
      expect(updatedSubscription!.nextDueDate.getTime()).toBeGreaterThan(originalNextDueDate.getTime());
    });

    it('webhook duplicado (mesmo payment id) nunca cria um segundo SubscriptionPayment', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookDuplicate');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-dup-1',
        status: 'approved',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      for (let i = 0; i < 2; i += 1) {
        const { xSignature, xRequestId } = signWebhook('payment-dup-1', `req-dup-${i}`, WEBHOOK_SECRET);
        await request(app.getHttpServer())
          .post('/api/v1/billing/webhooks/mercado-pago')
          .set('x-signature', xSignature)
          .set('x-request-id', xRequestId)
          .send({ type: 'payment', data: { id: 'payment-dup-1' } })
          .expect(200);
      }

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(1);
    });

    it('pagamento com status diferente de approved nunca cria SubscriptionPayment', async () => {
      const { tenantId, superAdminAccessToken } = await createTenantWithSuperAdmin('WebhookRejected');
      const subscription = await createMercadoPagoSubscription(superAdminAccessToken, tenantId);

      fakeMercadoPagoProvider.enqueuePayment({
        id: 'payment-rejected-1',
        status: 'rejected',
        externalReference: tenantId,
        transactionAmount: 499.9,
      });

      const { xSignature, xRequestId } = signWebhook('payment-rejected-1', 'req-rejected-1', WEBHOOK_SECRET);
      await request(app.getHttpServer())
        .post('/api/v1/billing/webhooks/mercado-pago')
        .set('x-signature', xSignature)
        .set('x-request-id', xRequestId)
        .send({ type: 'payment', data: { id: 'payment-rejected-1' } })
        .expect(200);

      const payments = await prisma.subscriptionPayment.findMany({ where: { subscriptionId: subscription.id } });
      expect(payments).toHaveLength(0);
    });
  });
```

- [ ] **Step 3: Rodar e confirmar que os novos testes falham (rota ainda não existe)**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: FAIL nos 6 novos testes.

- [ ] **Step 4: Implementar `MercadoPagoWebhookService`**

Create `apps/api/src/billing/services/mercado-pago-webhook.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../../config/configuration';
import { compact } from '../../common/utils/compact.util';
import { MercadoPagoService } from '../../mercado-pago/services/mercado-pago.service';
import { mapMercadoPagoPreapprovalStatus } from '../../mercado-pago/utils/mercado-pago-preapproval-status.util';
import { isValidMercadoPagoSignature } from '../../mercado-pago/utils/mercado-pago-signature.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// Processa notificacoes assincronas do Mercado Pago. Sempre busca o estado
// ATUAL no Mercado Pago antes de agir (nunca confia cegamente no payload do
// webhook, que e so um "algo mudou, va conferir" -- pratica recomendada pelo
// proprio Mercado Pago) -- idempotente e tolerante a reordenacao/duplicatas.
@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly mercadoPago: MercadoPagoService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  validateSignature(
    headers: { xSignature: string | undefined; xRequestId: string | undefined },
    dataId: string,
  ): boolean {
    const secret = this.configService.get('mercadoPago', { infer: true }).webhookSecret;
    if (!secret) {
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET nao configurado -- rejeitando webhook.');
      return false;
    }
    return isValidMercadoPagoSignature({
      xSignature: headers.xSignature,
      xRequestId: headers.xRequestId,
      dataId,
      secret,
    });
  }

  async process(type: string, dataId: string): Promise<void> {
    if (type === 'preapproval' || type === 'subscription_preapproval') {
      await this.processPreapproval(dataId);
      return;
    }
    if (type === 'payment') {
      await this.processPayment(dataId);
      return;
    }
    this.logger.log(`Evento Mercado Pago ignorado (type=${type}).`);
  }

  private async processPreapproval(preapprovalId: string): Promise<void> {
    const preapproval = await this.mercadoPago.getPreapproval(preapprovalId);
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { externalSubscriptionId: preapproval.id },
    });
    if (!subscription) {
      this.logger.warn(`Preapproval ${preapproval.id} nao corresponde a nenhuma assinatura conhecida.`);
      return;
    }

    const status = mapMercadoPagoPreapprovalStatus(preapproval.status);
    if (!status) {
      this.logger.log(`Preapproval ${preapproval.id} com status ${preapproval.status} sem mapeamento -- ignorado.`);
      return;
    }

    await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: compact({ status, externalCustomerId: preapproval.payerId ?? undefined }),
    });
    this.logger.log(`Assinatura ${subscription.id} atualizada para ${status} via webhook Mercado Pago.`);
  }

  private async processPayment(paymentId: string): Promise<void> {
    const payment = await this.mercadoPago.getPayment(paymentId);
    if (payment.status !== 'approved') {
      this.logger.log(`Pagamento Mercado Pago ${payment.id} ignorado (status=${payment.status}).`);
      return;
    }
    if (!payment.externalReference) {
      this.logger.warn(`Pagamento Mercado Pago ${payment.id} aprovado sem externalReference -- ignorado.`);
      return;
    }

    const existing = await this.prisma.subscriptionPayment.findUnique({
      where: { externalPaymentId: payment.id },
    });
    if (existing) {
      this.logger.log(`Pagamento Mercado Pago ${payment.id} ja processado -- ignorando duplicata.`);
      return;
    }

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: payment.externalReference },
    });
    if (!subscription) {
      this.logger.warn(
        `Pagamento Mercado Pago ${payment.id} referencia tenant desconhecido (${payment.externalReference}).`,
      );
      return;
    }

    try {
      await this.prisma.$transaction((tx) =>
        this.subscriptionsService.recordPaymentInTransaction(tx, subscription, {
          amount: payment.transactionAmount,
          dueDate: subscription.nextDueDate,
          paidAt: new Date(),
          paymentMethod: 'MERCADO_PAGO',
          status: 'PAID',
          createdBy: null,
          externalPaymentId: payment.id,
        }),
      );
    } catch (error) {
      // Corrida entre duas entregas quase simultaneas do mesmo webhook: a
      // constraint @unique em externalPaymentId (Task 1) e a barreira real
      // no banco -- o findUnique acima pode nao pegar a outra escrita ainda
      // em voo, mas o banco nunca deixa duas linhas com o mesmo
      // externalPaymentId.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Pagamento Mercado Pago ${payment.id} ja processado (corrida concorrente) -- ignorado.`);
        return;
      }
      throw error;
    }

    this.logger.log(`Pagamento Mercado Pago ${payment.id} registrado para a assinatura ${subscription.id}.`);
  }
}
```

- [ ] **Step 5: Implementar `MercadoPagoWebhookController`**

Create `apps/api/src/billing/controllers/mercado-pago-webhook.controller.ts`:

```ts
import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { WEBHOOK_THROTTLE } from '../../common/constants/throttle.constants';
import { MercadoPagoWebhookService } from '../services/mercado-pago-webhook.service';

interface MercadoPagoWebhookBody {
  type?: string;
  topic?: string;
  data?: { id?: string };
}

// Notificacao assincrona do Mercado Pago (preapproval autorizado/pausado/
// cancelado, pagamento de cobranca recorrente aprovado). @Public() -- sem
// JWT (o Mercado Pago nunca teria um token nosso) -- autenticado pela
// validacao de assinatura HMAC (x-signature), nunca por sessao. Fora do
// Swagger publico (endpoint tecnico de integracao, nao uma rota de negocio
// para o frontend consumir).
@ApiExcludeController()
@Controller('billing/webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  @Public()
  @Post()
  @Throttle(WEBHOOK_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: MercadoPagoWebhookBody,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ): Promise<{ received: true }> {
    const dataId = body.data?.id;
    const type = body.type ?? body.topic;

    if (!dataId || !type) {
      this.logger.warn('Webhook Mercado Pago recebido sem type/data.id -- ignorado.');
      return { received: true };
    }

    if (!this.webhookService.validateSignature({ xSignature, xRequestId }, dataId)) {
      throw new UnauthorizedException('Assinatura do webhook invalida.');
    }

    await this.webhookService.process(type, dataId);
    return { received: true };
  }
}
```

- [ ] **Step 6: Registrar no `billing.module.ts`**

Em `apps/api/src/billing/billing.module.ts`, troque:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoPagoModule } from '../mercado-pago/mercado-pago.module';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingLifecycleScheduler } from './services/billing-lifecycle.scheduler';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [ScheduleModule.forRoot(), MercadoPagoModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, BillingDashboardService, BillingLifecycleService, BillingLifecycleScheduler],
})
export class BillingModule {}
```

por:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoPagoModule } from '../mercado-pago/mercado-pago.module';
import { MercadoPagoWebhookController } from './controllers/mercado-pago-webhook.controller';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingLifecycleScheduler } from './services/billing-lifecycle.scheduler';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { MercadoPagoWebhookService } from './services/mercado-pago-webhook.service';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  imports: [ScheduleModule.forRoot(), MercadoPagoModule],
  controllers: [SubscriptionsController, MercadoPagoWebhookController],
  providers: [
    SubscriptionsService,
    BillingDashboardService,
    BillingLifecycleService,
    BillingLifecycleScheduler,
    MercadoPagoWebhookService,
  ],
})
export class BillingModule {}
```

- [ ] **Step 7: Rodar e confirmar que todos os testes do arquivo passam**

Run: `pnpm --filter api test:e2e -- mercado-pago-billing.e2e-spec.ts`
Expected: PASS (13 testes no total: 2 lifecycle + 5 self-service + 6 webhook).

- [ ] **Step 8: Rodar a suíte completa da API (regressão ampla)**

Run: `pnpm --filter api test` e `pnpm --filter api test:e2e -- billing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/billing apps/api/src/common/constants/throttle.constants.ts apps/api/test/mercado-pago-billing.e2e-spec.ts
git commit -m "feat(billing): adiciona webhook do Mercado Pago (preapproval + pagamento)"
```

---

### Task 9: Frontend — enums, labels, tipos e cliente de API

**Files:**
- Modify: `apps/admin-web/src/types/enums.ts`
- Modify: `apps/admin-web/src/lib/labels.ts`
- Modify: `apps/admin-web/src/types/entities.ts`
- Modify: `apps/admin-web/src/lib/api/billing.api.ts`

**Interfaces:**
- Produces: `SubscriptionPaymentMethod.MERCADO_PAGO`; `getMySubscription()`; `createMercadoPagoAuthorization()` — consumidos pela Task 10.

- [ ] **Step 1: Adicionar `MERCADO_PAGO` ao enum**

Em `apps/admin-web/src/types/enums.ts`, troque:

```ts
export const SubscriptionPaymentMethod = {
  PIX_SCHEDULED: 'PIX_SCHEDULED',
  DIRECT_DEBIT: 'DIRECT_DEBIT',
  STRIPE: 'STRIPE',
```

por:

```ts
export const SubscriptionPaymentMethod = {
  PIX_SCHEDULED: 'PIX_SCHEDULED',
  DIRECT_DEBIT: 'DIRECT_DEBIT',
  MERCADO_PAGO: 'MERCADO_PAGO',
  STRIPE: 'STRIPE',
```

- [ ] **Step 2: Adicionar o label**

Em `apps/admin-web/src/lib/labels.ts`, troque:

```ts
export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Record<SubscriptionPaymentMethod, string> = {
  PIX_SCHEDULED: 'PIX agendado',
  DIRECT_DEBIT: 'Débito automático',
  STRIPE: 'Stripe',
};
```

por:

```ts
export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Record<SubscriptionPaymentMethod, string> = {
  PIX_SCHEDULED: 'PIX agendado',
  DIRECT_DEBIT: 'Débito automático',
  MERCADO_PAGO: 'Mercado Pago',
  STRIPE: 'Stripe',
};
```

- [ ] **Step 3: Atualizar `SubscriptionPaymentEntity.createdBy` para nullable**

Em `apps/admin-web/src/types/entities.ts`, troque:

```ts
export interface SubscriptionPaymentEntity {
  id: string;
  tenantId: string;
  subscriptionId: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  reference: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}
```

por:

```ts
export interface SubscriptionPaymentEntity {
  id: string;
  tenantId: string;
  subscriptionId: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  reference: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}
```

- [ ] **Step 4: Adicionar as funções de API self-service**

Em `apps/admin-web/src/lib/api/billing.api.ts`, ao final do arquivo, adicione:

```ts

// [Mercado Pago] Self-service (ADMIN do proprio tenant, area /settings).
export function getMySubscription(signal?: AbortSignal) {
  return api.get<SubscriptionEntity>('/billing/subscriptions/me', undefined, signal);
}

export interface MercadoPagoAuthorization {
  initPoint: string;
}

export function createMercadoPagoAuthorization() {
  return api.post<MercadoPagoAuthorization>('/billing/subscriptions/me/mercado-pago/authorization');
}
```

- [ ] **Step 5: Typecheck e testes existentes (regressão)**

Run: `pnpm --filter admin-web typecheck`
Expected: sem erros.

Run: `pnpm --filter admin-web test -- billing`
Expected: PASS (os testes de create/edit/register-payment-modal continuam passando — não fazem asserção de contagem exata de opções).

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/types apps/admin-web/src/lib
git commit -m "feat(billing): adiciona MERCADO_PAGO aos tipos/labels e cliente de API do admin-web"
```

---

### Task 10: Frontend — UI self-service "Cobrança automática"

**Files:**
- Create: `apps/admin-web/src/features/billing/mercado-pago-authorization-card.tsx`
- Create: `apps/admin-web/src/features/billing/mercado-pago-authorization-card.test.tsx`
- Modify: `apps/admin-web/src/app/(app)/settings/company/page.tsx`

**Interfaces:**
- Consumes: `getMySubscription`, `createMercadoPagoAuthorization` (Task 9); `SUBSCRIPTION_STATUS_LABELS`, `SUBSCRIPTION_STATUS_TONE` (já existentes em `lib/labels.ts`).
- Produces: `<MercadoPagoAuthorizationCard />` — consumido por `company/page.tsx`.

- [ ] **Step 1: Escrever o teste do componente**

Create `apps/admin-web/src/features/billing/mercado-pago-authorization-card.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { MercadoPagoAuthorizationCard } from './mercado-pago-authorization-card';

const getMySubscriptionMock = vi.fn();
const createMercadoPagoAuthorizationMock = vi.fn();

vi.mock('../../lib/api/billing.api', () => ({
  getMySubscription: (...args: unknown[]) => getMySubscriptionMock(...args),
  createMercadoPagoAuthorization: (...args: unknown[]) => createMercadoPagoAuthorizationMock(...args),
}));

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<MercadoPagoAuthorizationCard />, { wrapper: Wrapper });
}

describe('MercadoPagoAuthorizationCard', () => {
  beforeEach(() => {
    getMySubscriptionMock.mockReset();
    createMercadoPagoAuthorizationMock.mockReset();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('nao renderiza nada quando o tenant nao tem assinatura Mercado Pago', async () => {
    getMySubscriptionMock.mockResolvedValue({ paymentMethod: 'PIX_SCHEDULED', status: 'ACTIVE' });
    renderCard();
    await waitFor(() => expect(getMySubscriptionMock).toHaveBeenCalled());
    expect(screen.queryByText('Cobrança automática')).not.toBeInTheDocument();
  });

  it('nao renderiza nada quando o tenant nao tem assinatura cadastrada (404)', async () => {
    getMySubscriptionMock.mockRejectedValue(new Error('not found'));
    renderCard();
    await waitFor(() => expect(getMySubscriptionMock).toHaveBeenCalled());
    expect(screen.queryByText('Cobrança automática')).not.toBeInTheDocument();
  });

  it('mostra o botao de autorizar quando o status e PENDING e redireciona ao clicar', async () => {
    getMySubscriptionMock.mockResolvedValue({
      paymentMethod: 'MERCADO_PAGO',
      status: 'PENDING',
      nextDueDate: '2026-10-01',
    });
    createMercadoPagoAuthorizationMock.mockResolvedValue({ initPoint: 'https://mercadopago.com/checkout/xyz' });
    renderCard();

    const button = await screen.findByRole('button', { name: 'Autorizar no Mercado Pago' });
    await userEvent.click(button);

    await waitFor(() => expect(window.location.href).toBe('https://mercadopago.com/checkout/xyz'));
  });

  it('esconde o botao de autorizar quando o status ja e ACTIVE', async () => {
    getMySubscriptionMock.mockResolvedValue({
      paymentMethod: 'MERCADO_PAGO',
      status: 'ACTIVE',
      nextDueDate: '2026-10-01',
    });
    renderCard();

    await screen.findByText('Cobrança automática');
    expect(screen.queryByRole('button', { name: 'Autorizar no Mercado Pago' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha (componente ainda não existe)**

Run: `pnpm --filter admin-web test -- mercado-pago-authorization-card`
Expected: FAIL com "Cannot find module './mercado-pago-authorization-card'"

- [ ] **Step 3: Implementar o componente**

Create `apps/admin-web/src/features/billing/mercado-pago-authorization-card.tsx`:

```tsx
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { useToast } from '../../components/ui/toast';
import { createMercadoPagoAuthorization, getMySubscription } from '../../lib/api/billing.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONE } from '../../lib/labels';

// [Mercado Pago] Self-service (/settings/company). So renderiza algo quando
// o tenant tem uma assinatura configurada para MERCADO_PAGO -- a maioria dos
// tenants (fluxo manual) nunca ve esta secao. Erros (inclusive 404 quando o
// tenant nao tem assinatura) sao tratados como "nada a mostrar", nunca uma
// caixa de erro ruidosa para uma secao secundaria/opcional.
export function MercadoPagoAuthorizationCard(): JSX.Element | null {
  const toast = useToast();

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscriptions', 'me'],
    queryFn: () => getMySubscription(),
    retry: false,
  });

  const authorizationMutation = useMutation({
    mutationFn: () => createMercadoPagoAuthorization(),
    onSuccess: (data) => {
      window.location.href = data.initPoint;
    },
    onError: (error) => toast.error('Não foi possível iniciar a autorização.', toFriendlyMessage(error)),
  });

  const subscription = subscriptionQuery.data;
  if (!subscription || subscription.paymentMethod !== 'MERCADO_PAGO') {
    return null;
  }

  const canAuthorize = subscription.status !== 'ACTIVE';

  return (
    <Card className="mt-6 max-w-2xl">
      <CardHeader title="Cobrança automática" description="Assinatura cobrada via Mercado Pago." />
      <CardBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Badge tone={SUBSCRIPTION_STATUS_TONE[subscription.status]}>
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </Badge>
            {subscription.status === 'ACTIVE' && (
              <p className="text-sm text-ink-muted">
                Próximo vencimento: {new Date(subscription.nextDueDate).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
          {canAuthorize && (
            <div>
              <Button type="button" loading={authorizationMutation.isPending} onClick={() => authorizationMutation.mutate()}>
                Autorizar no Mercado Pago
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que os testes passam**

Run: `pnpm --filter admin-web test -- mercado-pago-authorization-card`
Expected: PASS (4 testes).

- [ ] **Step 5: Renderizar o card em `/settings/company`**

Em `apps/admin-web/src/app/(app)/settings/company/page.tsx`, adicione o import junto aos demais:

```ts
import { MercadoPagoAuthorizationCard } from '../../../../features/billing/mercado-pago-authorization-card';
```

E, logo após o fechamento do `</Card>` de "Dados gerais" (antes do `</div>` final do componente), adicione:

```tsx
      <MercadoPagoAuthorizationCard />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter admin-web typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src/features/billing/mercado-pago-authorization-card.tsx apps/admin-web/src/features/billing/mercado-pago-authorization-card.test.tsx "apps/admin-web/src/app/(app)/settings/company/page.tsx"
git commit -m "feat(billing): adiciona secao self-service de cobranca automatica (Mercado Pago) em /settings/company"
```

---

### Task 11: Documentação

**Files:**
- Modify: `docs/billing.md`

**Interfaces:**
- Nenhuma (apenas documentação).

- [ ] **Step 1: Adicionar seção sobre a integração Mercado Pago**

Ao final de `docs/billing.md`, antes da seção "## 9. Limitações reais", adicione uma nova seção (renumerando "Limitações reais" se necessário para manter a sequência):

```markdown
## 9. Integração Mercado Pago (cobrança recorrente)

A partir desta fase, `paymentMethod=MERCADO_PAGO` habilita cobrança
recorrente real via Preapproval API do Mercado Pago, convivendo com os
métodos manuais (`PIX_SCHEDULED`/`DIRECT_DEBIT`) sem alterá-los. Uma única
conta Mercado Pago pertence à plataforma — cada tenant é um pagador que
autoriza um cartão, nunca conecta a própria conta MP.

- Tenant ADMIN autoriza em `/settings/company` (`POST
  /billing/subscriptions/me/mercado-pago/authorization`), que cria o
  preapproval e devolve o link de checkout do Mercado Pago.
- `POST /billing/webhooks/mercado-pago` (público, validado por assinatura
  HMAC) processa `preapproval` (atualiza `TenantSubscription.status`) e
  `payment` (cria `SubscriptionPayment` e avança `nextDueDate` — mesma
  lógica transacional de `POST /billing/subscriptions/:id/payments`).
  Idempotente por `SubscriptionPayment.externalPaymentId` (`@unique`
  nullable).
- `BillingLifecycleService.markOverdueSubscriptions()` ignora assinaturas
  `MERCADO_PAGO` — quem decide atraso ali é o próprio Mercado Pago.
- Ver `docs/superpowers/specs/2026-09-15-mercado-pago-billing-design.md`
  para o design completo e limitações desta integração (sem split
  payment/marketplace, sem cobrança de fretes/receivables via MP, sem envio
  automático do link de autorização).
```

- [ ] **Step 2: Commit**

```bash
git add docs/billing.md
git commit -m "docs(billing): documenta a integracao Mercado Pago de cobranca recorrente"
```

---

## Self-Review

**Spec coverage:**
- Modelo comercial (única conta MP, tenant como pagador) → Task 5 (`createMercadoPagoAuthorization`).
- Modelo de dados (enum + campos reservados reaproveitados) → Task 1.
- Arquitetura de módulos (provider isolado, fetch nativo) → Tasks 3-4.
- Fluxo de autorização self-service → Tasks 5, 7, 10.
- Webhook + idempotência → Task 8.
- Convivência com fluxo manual (lifecycle) → Task 6.
- Configuração/env → Task 2.
- Frontend (self-service + labels) → Tasks 9-10.
- Testes (unitários dos providers/utils puros + e2e do fluxo completo) → Tasks 3, 4, 6, 7, 8.
- Documentação → Task 11.
- Fora de escopo (split payment, cobrança de fretes, e-mail automático, suspensão automática) → nenhuma task implementa isso, conforme decidido.

**Placeholder scan:** nenhum "TBD"/"TODO"/"implementar depois" — todos os steps têm código completo.

**Type consistency:** `recordPaymentInTransaction` (Task 5) usado identicamente em `registerPayment` (Task 5) e `MercadoPagoWebhookService.processPayment` (Task 8) — mesma assinatura `(tx, subscription: TenantSubscription, data)`. `MercadoPagoProviderPort`/`MercadoPagoPreapproval`/`MercadoPagoPayment` (Task 3) usados sem alteração de forma em `MercadoPagoService` (Task 4), `SubscriptionsService` (Task 5) e `MercadoPagoWebhookService` (Task 8). `MERCADO_PAGO_PROVIDER` (Task 3) é o mesmo token usado no `overrideProvider` do e2e (Task 7).

Plan complete and saved to `docs/superpowers/plans/2026-09-15-mercado-pago-billing.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispara um subagente novo por task, com revisão entre tasks, iteração rápida.

**2. Inline Execution** — executa as tasks nesta sessão via executing-plans, em lote com checkpoints para revisão.

Qual abordagem você prefere?
