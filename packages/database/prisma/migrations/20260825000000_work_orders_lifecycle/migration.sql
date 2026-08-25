-- AlterEnum
ALTER TYPE "vehicle_maintenance_status" ADD VALUE 'DIAGNOSING';
ALTER TYPE "vehicle_maintenance_status" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "vehicle_maintenance_status" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "vehicle_maintenances" ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "completion_odometer_km" DECIMAL(10,2);
