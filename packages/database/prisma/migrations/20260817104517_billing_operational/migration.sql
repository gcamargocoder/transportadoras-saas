-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "trip_billing_status" AS ENUM ('DRAFT', 'READY', 'PARTIALLY_INVOICED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "trip_billings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "status" "trip_billing_status" NOT NULL DEFAULT 'READY',
    "billable_amount" DECIMAL(10,2),
    "invoiced_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_billing_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_billing_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "revenue_id" UUID NOT NULL,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_billing_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_billings_trip_id_key" ON "trip_billings"("trip_id");

-- CreateIndex
CREATE INDEX "trip_billings_tenant_id_idx" ON "trip_billings"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_billings_tenant_id_status_idx" ON "trip_billings"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_billing_entries_revenue_id_key" ON "trip_billing_entries"("revenue_id");

-- CreateIndex
CREATE INDEX "trip_billing_entries_tenant_id_idx" ON "trip_billing_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_billing_entries_tenant_id_trip_billing_id_idx" ON "trip_billing_entries"("tenant_id", "trip_billing_id");

-- AddForeignKey
ALTER TABLE "trip_billings" ADD CONSTRAINT "trip_billings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billings" ADD CONSTRAINT "trip_billings_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billings" ADD CONSTRAINT "trip_billings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billings" ADD CONSTRAINT "trip_billings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billings" ADD CONSTRAINT "trip_billings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billing_entries" ADD CONSTRAINT "trip_billing_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billing_entries" ADD CONSTRAINT "trip_billing_entries_trip_billing_id_fkey" FOREIGN KEY ("trip_billing_id") REFERENCES "trip_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billing_entries" ADD CONSTRAINT "trip_billing_entries_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "trip_revenues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_billing_entries" ADD CONSTRAINT "trip_billing_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

