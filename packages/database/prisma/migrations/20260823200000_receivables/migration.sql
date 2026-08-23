-- CreateEnum
CREATE TYPE "receivable_payment_method" AS ENUM ('PIX', 'BANK_TRANSFER', 'BOLETO', 'CASH', 'CHECK', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "trip_id" UUID NOT NULL,
    "billing_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "received_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receivable_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" "receivable_payment_method" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receivables_billing_id_key" ON "receivables"("billing_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_idx" ON "receivables"("tenant_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_customer_id_idx" ON "receivables"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_trip_id_idx" ON "receivables"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "receivables_tenant_id_due_date_idx" ON "receivables"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "receivable_payments_tenant_id_idx" ON "receivable_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "receivable_payments_tenant_id_receivable_id_idx" ON "receivable_payments"("tenant_id", "receivable_id");

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_billing_id_fkey" FOREIGN KEY ("billing_id") REFERENCES "trip_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
