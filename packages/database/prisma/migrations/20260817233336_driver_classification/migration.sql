-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "driver_type" AS ENUM ('OWN', 'AGGREGATED', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "driver_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "status" "driver_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" "driver_type" NOT NULL DEFAULT 'OWN';

-- DataMigration: preserva o status real dos motoristas ja cadastrados --
-- is_active=false (desativado antes desta fase) vira INACTIVE em vez do
-- default ACTIVE. Nenhum motorista existente e reclassificado para
-- SUSPENDED automaticamente (nao ha como inferir "suspensao" retroativa).
UPDATE "drivers" SET "status" = 'INACTIVE' WHERE "is_active" = false;

-- CreateTable
CREATE TABLE "driver_vehicle_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_tenant_id_idx" ON "driver_vehicle_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_tenant_id_driver_id_idx" ON "driver_vehicle_assignments"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_tenant_id_vehicle_id_idx" ON "driver_vehicle_assignments"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "driver_vehicle_assignments_tenant_id_driver_id_ended_at_idx" ON "driver_vehicle_assignments"("tenant_id", "driver_id", "ended_at");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_type_idx" ON "drivers"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_status_idx" ON "drivers"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_vehicle_assignments" ADD CONSTRAINT "driver_vehicle_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

