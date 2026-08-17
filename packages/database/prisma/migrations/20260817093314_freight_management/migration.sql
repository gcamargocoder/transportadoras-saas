-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "freight_table_status" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "freight_rule_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "tenant_plans" ALTER COLUMN "enabled_modules" SET DEFAULT ARRAY['TRIPS', 'TOLLS', 'FUEL', 'MAINTENANCE', 'TIRES', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS', 'FREIGHT']::"TenantModule"[];

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "contract_status" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "notes" TEXT,
    "commercial_terms" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_tables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "contract_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "freight_table_status" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "freight_table_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "freight_rule_status" NOT NULL DEFAULT 'ACTIVE',
    "previous_version_id" UUID,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "origin_location_id" UUID,
    "destination_location_id" UUID,
    "origin_region" TEXT,
    "destination_region" TEXT,
    "cargo_type" TEXT,
    "vehicle_type" "vehicle_type",
    "min_weight_kg" DECIMAL(10,2),
    "max_weight_kg" DECIMAL(10,2),
    "min_cubage_m3" DECIMAL(10,2),
    "max_cubage_m3" DECIMAL(10,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(10,2),
    "per_km_amount" DECIMAL(10,2),
    "per_ton_amount" DECIMAL(10,2),
    "minimum_amount" DECIMAL(10,2),
    "toll_amount" DECIMAL(10,2),
    "risk_additional_amount" DECIMAL(10,2),
    "night_additional_amount" DECIMAL(10,2),
    "daily_rate_amount" DECIMAL(10,2),
    "demurrage_amount" DECIMAL(10,2),
    "other_fees" JSONB,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_freights" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "contract_id" UUID,
    "freight_table_id" UUID,
    "freight_rule_id" UUID,
    "calculation_input" JSONB NOT NULL,
    "base_amount" DECIMAL(10,2),
    "additions_amount" DECIMAL(10,2),
    "toll_amount" DECIMAL(10,2),
    "fees_amount" DECIMAL(10,2),
    "estimated_amount" DECIMAL(10,2),
    "contracted_amount" DECIMAL(10,2),
    "final_amount" DECIMAL(10,2),
    "revenue_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_freights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_customer_id_idx" ON "contracts"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_status_idx" ON "contracts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_end_date_idx" ON "contracts"("tenant_id", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenant_id_code_key" ON "contracts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "freight_tables_tenant_id_idx" ON "freight_tables"("tenant_id");

-- CreateIndex
CREATE INDEX "freight_tables_tenant_id_customer_id_idx" ON "freight_tables"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "freight_tables_tenant_id_contract_id_idx" ON "freight_tables"("tenant_id", "contract_id");

-- CreateIndex
CREATE INDEX "freight_tables_tenant_id_status_idx" ON "freight_tables"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "freight_tables_tenant_id_code_key" ON "freight_tables"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "freight_rules_previous_version_id_key" ON "freight_rules"("previous_version_id");

-- CreateIndex
CREATE INDEX "freight_rules_tenant_id_idx" ON "freight_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "freight_rules_tenant_id_freight_table_id_idx" ON "freight_rules"("tenant_id", "freight_table_id");

-- CreateIndex
CREATE INDEX "freight_rules_tenant_id_status_idx" ON "freight_rules"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "freight_rules_tenant_id_freight_table_id_status_effective_f_idx" ON "freight_rules"("tenant_id", "freight_table_id", "status", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "trip_freights_trip_id_key" ON "trip_freights"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_freights_revenue_id_key" ON "trip_freights"("revenue_id");

-- CreateIndex
CREATE INDEX "trip_freights_tenant_id_idx" ON "trip_freights"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_freights_tenant_id_contract_id_idx" ON "trip_freights"("tenant_id", "contract_id");

-- CreateIndex
CREATE INDEX "trip_freights_tenant_id_freight_table_id_idx" ON "trip_freights"("tenant_id", "freight_table_id");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_tables" ADD CONSTRAINT "freight_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_tables" ADD CONSTRAINT "freight_tables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_tables" ADD CONSTRAINT "freight_tables_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_tables" ADD CONSTRAINT "freight_tables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_tables" ADD CONSTRAINT "freight_tables_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_freight_table_id_fkey" FOREIGN KEY ("freight_table_id") REFERENCES "freight_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "freight_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_freight_table_id_fkey" FOREIGN KEY ("freight_table_id") REFERENCES "freight_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_freight_rule_id_fkey" FOREIGN KEY ("freight_rule_id") REFERENCES "freight_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "trip_revenues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_freights" ADD CONSTRAINT "trip_freights_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
