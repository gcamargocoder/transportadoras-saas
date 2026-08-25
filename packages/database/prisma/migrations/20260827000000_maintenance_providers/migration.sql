-- CreateEnum
CREATE TYPE "maintenance_provider_type" AS ENUM ('WORKSHOP', 'SUPPLIER');

-- AlterTable
ALTER TABLE "vehicle_maintenances" ADD COLUMN     "supplier_id" UUID,
ADD COLUMN     "workshop_id" UUID;

-- CreateTable
CREATE TABLE "maintenance_providers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "maintenance_provider_type" NOT NULL,
    "name" TEXT NOT NULL,
    "trade_name" TEXT,
    "document" VARCHAR(20),
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "contact_name" TEXT,
    "specialties" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_providers_tenant_id_idx" ON "maintenance_providers"("tenant_id");

-- CreateIndex
CREATE INDEX "maintenance_providers_tenant_id_type_idx" ON "maintenance_providers"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "maintenance_providers_tenant_id_type_is_active_idx" ON "maintenance_providers"("tenant_id", "type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_providers_tenant_id_type_document_key" ON "maintenance_providers"("tenant_id", "type", "document");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_workshop_id_idx" ON "vehicle_maintenances"("workshop_id");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_supplier_id_idx" ON "vehicle_maintenances"("supplier_id");

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_workshop_id_fkey" FOREIGN KEY ("workshop_id") REFERENCES "maintenance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "maintenance_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_providers" ADD CONSTRAINT "maintenance_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_providers" ADD CONSTRAINT "maintenance_providers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
