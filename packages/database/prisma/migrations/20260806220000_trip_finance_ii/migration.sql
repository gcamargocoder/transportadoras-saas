-- CreateEnum
CREATE TYPE "revenue_category" AS ENUM ('FREIGHT', 'BONUS', 'EXTRA_SERVICE', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "settlement_status" AS ENUM ('OPEN', 'CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "trip_revenues" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" "revenue_category" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "invoice_number" TEXT,
    "customer_id" UUID,
    "attachment_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_advances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" "expense_payment_method",
    "paid_at" TIMESTAMP(3) NOT NULL,
    "attachment_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_settlements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_expenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_advances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_result" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "settlement_status" NOT NULL DEFAULT 'OPEN',
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_revenues_tenant_id_idx" ON "trip_revenues"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_revenues_tenant_id_trip_id_idx" ON "trip_revenues"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_revenues_tenant_id_category_idx" ON "trip_revenues"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "trip_revenues_tenant_id_customer_id_idx" ON "trip_revenues"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "trip_advances_tenant_id_idx" ON "trip_advances"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_advances_tenant_id_trip_id_idx" ON "trip_advances"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_advances_tenant_id_driver_id_idx" ON "trip_advances"("tenant_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_settlements_trip_id_key" ON "trip_settlements"("trip_id");

-- CreateIndex
CREATE INDEX "trip_settlements_tenant_id_idx" ON "trip_settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_settlements_tenant_id_status_idx" ON "trip_settlements"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_advances" ADD CONSTRAINT "trip_advances_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_settlements" ADD CONSTRAINT "trip_settlements_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

