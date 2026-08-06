-- CreateEnum
CREATE TYPE "vehicle_status" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SOLD');

-- CreateEnum
CREATE TYPE "vehicle_fuel_type" AS ENUM ('DIESEL', 'DIESEL_S10', 'GASOLINE', 'ETHANOL', 'FLEX', 'ELECTRIC', 'HYBRID', 'GNV', 'OTHER');

-- CreateEnum
CREATE TYPE "vehicle_maintenance_status" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- AlterTable: novos campos + coluna "status" (substitui "is_active" por uma
-- situacao de 4 estados). Adicionada com DEFAULT para nao quebrar linhas
-- existentes, backfill a partir de is_active, so entao is_active e removida
-- -- nenhum registro fica sem um status valido em nenhum momento.
ALTER TABLE "vehicles" ADD COLUMN     "average_consumption_km_l" DECIMAL(10,2),
ADD COLUMN     "axle_count" INTEGER,
ADD COLUMN     "cargo_capacity_kg" DECIMAL(10,2),
ADD COLUMN     "fuel_type" "vehicle_fuel_type",
ADD COLUMN     "gross_weight_kg" DECIMAL(10,2),
ADD COLUMN     "net_weight_kg" DECIMAL(10,2),
ADD COLUMN     "odometer_km" DECIMAL(10,2),
ADD COLUMN     "status" "vehicle_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tank_capacity_liters" DECIMAL(10,2);

UPDATE "vehicles" SET "status" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END::"vehicle_status";

ALTER TABLE "vehicles" DROP COLUMN "is_active";

-- CreateTable
CREATE TABLE "vehicle_maintenances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "status" "vehicle_maintenance_status" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_maintenances_tenant_id_idx" ON "vehicle_maintenances"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_vehicle_id_status_idx" ON "vehicle_maintenances"("vehicle_id", "status");

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
