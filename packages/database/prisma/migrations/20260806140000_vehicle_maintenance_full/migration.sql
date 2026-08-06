-- CreateEnum
CREATE TYPE "vehicle_maintenance_type" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "vehicle_maintenance_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "vehicle_maintenance_status" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "vehicle_maintenance_status" ADD VALUE 'WAITING_PARTS';

-- AlterTable
ALTER TABLE "vehicle_maintenances" ADD COLUMN     "labor_cost" DECIMAL(10,2),
ADD COLUMN     "mechanic" TEXT,
ADD COLUMN     "next_review_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "odometer_km" DECIMAL(10,2),
ADD COLUMN     "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "parts_cost" DECIMAL(10,2),
ADD COLUMN     "priority" "vehicle_maintenance_priority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "responsible_user_id" UUID,
ADD COLUMN     "service_order_number" TEXT,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "total_cost" DECIMAL(10,2),
ADD COLUMN     "type" "vehicle_maintenance_type" NOT NULL DEFAULT 'PREVENTIVE',
ADD COLUMN     "warranty_until" TIMESTAMP(3),
ADD COLUMN     "workshop" TEXT;

-- CreateIndex
CREATE INDEX "vehicle_maintenances_tenant_id_status_idx" ON "vehicle_maintenances"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_tenant_id_opened_at_idx" ON "vehicle_maintenances"("tenant_id", "opened_at");

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

