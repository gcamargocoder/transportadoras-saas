-- CreateEnum
CREATE TYPE "vehicle_ownership_type" AS ENUM ('OWN', 'AGGREGATED', 'THIRD_PARTY');

-- AlterEnum
ALTER TYPE "vehicle_status" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "ownership_type" "vehicle_ownership_type" NOT NULL DEFAULT 'OWN';

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_ownership_type_idx" ON "vehicles"("tenant_id", "ownership_type");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_status_idx" ON "vehicles"("tenant_id", "status");
