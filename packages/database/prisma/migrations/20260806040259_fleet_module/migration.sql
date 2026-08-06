-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('TRACTOR_UNIT', 'TRUCK', 'VAN', 'PICKUP', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "trailer_type" ADD VALUE 'FULL_TRAILER';
ALTER TYPE "trailer_type" ADD VALUE 'SEMI_TRAILER';
ALTER TYPE "trailer_type" ADD VALUE 'DOLLY';

-- AlterTable
ALTER TABLE "axle_configurations" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "fleets" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "trailers" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "trip_compositions" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "trip_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_tags" ADD COLUMN     "activated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "chassis_number" VARCHAR(30),
ADD COLUMN     "color" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "manufacture_year" INTEGER,
ADD COLUMN     "model_year" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "renavam" VARCHAR(20),
ADD COLUMN     "type" "vehicle_type" NOT NULL DEFAULT 'TRACTOR_UNIT';

-- CreateIndex
CREATE INDEX "vehicles_fleet_id_idx" ON "vehicles"("fleet_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_renavam_key" ON "vehicles"("tenant_id", "renavam");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_chassis_number_key" ON "vehicles"("tenant_id", "chassis_number");

