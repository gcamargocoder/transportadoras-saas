-- CreateEnum
CREATE TYPE "payable_status" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "supplier_name" TEXT,
    "category" "expense_category" NOT NULL,
    "description" TEXT NOT NULL,
    "original_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "payable_status" NOT NULL DEFAULT 'OPEN',
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payable_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" "expense_payment_method" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payables_expense_id_key" ON "payables"("expense_id");

-- CreateIndex
CREATE INDEX "payables_tenant_id_idx" ON "payables"("tenant_id");

-- CreateIndex
CREATE INDEX "payables_tenant_id_trip_id_idx" ON "payables"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "payables_tenant_id_due_date_idx" ON "payables"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "payables_tenant_id_status_idx" ON "payables"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payables_tenant_id_category_idx" ON "payables"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "payable_payments_tenant_id_idx" ON "payable_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payable_payments_tenant_id_payable_id_idx" ON "payable_payments"("tenant_id", "payable_id");

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "trip_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
