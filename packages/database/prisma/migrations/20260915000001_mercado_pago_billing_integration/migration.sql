-- Fase Mercado Pago (Task 1): adiciona enum MERCADO_PAGO, torna externalPaymentId e externalSubscriptionId unicos, e faz createdBy nullable.

-- AlterEnum
ALTER TYPE "SubscriptionPaymentMethod" ADD VALUE 'MERCADO_PAGO';

-- AlterTable subscription_payments: adiciona unique constraint a externalPaymentId e torna createdBy nullable
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_external_payment_id_key" UNIQUE ("external_payment_id");
ALTER TABLE "subscription_payments" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable tenant_subscriptions: adiciona unique constraint a externalSubscriptionId
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_external_subscription_id_key" UNIQUE ("external_subscription_id");
