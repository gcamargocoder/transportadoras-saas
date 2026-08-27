-- CreateEnum
CREATE TYPE "quotation_status" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "quotation_amount_source" AS ENUM ('CALCULATED', 'MANUAL');

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_contact_id" UUID,
    "origin_location_id" UUID NOT NULL,
    "destination_location_id" UUID NOT NULL,
    "cargo_type" TEXT,
    "weight_kg" DECIMAL(10,2),
    "cubage_m3" DECIMAL(10,2),
    "vehicle_type" "vehicle_type",
    "conditions" TEXT,
    "status" "quotation_status" NOT NULL DEFAULT 'DRAFT',
    "valid_until" TIMESTAMP(3) NOT NULL,
    "amount_source" "quotation_amount_source" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "freight_table_id" UUID,
    "freight_rule_id" UUID,
    "base_amount" DECIMAL(10,2),
    "additions_amount" DECIMAL(10,2),
    "toll_amount" DECIMAL(10,2),
    "fees_amount" DECIMAL(10,2),
    "calculated_amount" DECIMAL(10,2),
    "calculation_input" JSONB,
    "converted_trip_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_converted_trip_id_key" ON "quotations"("converted_trip_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_idx" ON "quotations"("tenant_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_customer_id_idx" ON "quotations"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_status_idx" ON "quotations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_created_at_idx" ON "quotations"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_valid_until_idx" ON "quotations"("tenant_id", "valid_until");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_contact_id_fkey" FOREIGN KEY ("customer_contact_id") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_freight_table_id_fkey" FOREIGN KEY ("freight_table_id") REFERENCES "freight_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_freight_rule_id_fkey" FOREIGN KEY ("freight_rule_id") REFERENCES "freight_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_converted_trip_id_fkey" FOREIGN KEY ("converted_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
