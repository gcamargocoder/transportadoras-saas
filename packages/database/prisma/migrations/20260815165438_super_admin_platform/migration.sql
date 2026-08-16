-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TenantPlanTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TenantModule" AS ENUM ('TRIPS', 'TOLLS', 'FUEL', 'MAINTENANCE', 'TIRES', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "tenant_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tier" "TenantPlanTier" NOT NULL DEFAULT 'STARTER',
    "trial_ends_at" TIMESTAMP(3),
    "max_users" INTEGER,
    "max_vehicles" INTEGER,
    "max_drivers" INTEGER,
    "max_storage_mb" INTEGER,
    "enabled_modules" "TenantModule"[] DEFAULT ARRAY['TRIPS', 'TOLLS', 'FUEL', 'MAINTENANCE', 'TIRES', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS']::"TenantModule"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_plans_tenant_id_key" ON "tenant_plans"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cria um TenantPlan padrao (STARTER, todos os modulos
-- habilitados, sem limites) para toda transportadora ja existente -- nunca
-- deixa um tenant sem plano apos esta migration (mesmo principio do
-- DEFAULT em "status").
INSERT INTO "tenant_plans" ("id", "tenant_id", "tier", "enabled_modules", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'STARTER', ARRAY['TRIPS', 'TOLLS', 'FUEL', 'MAINTENANCE', 'TIRES', 'CHECKLIST', 'STOPS', 'DASHBOARDS', 'REPORTS']::"TenantModule"[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants"
WHERE NOT EXISTS (SELECT 1 FROM "tenant_plans" WHERE "tenant_plans"."tenant_id" = "tenants"."id");
