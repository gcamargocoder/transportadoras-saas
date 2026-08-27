-- AlterEnum
ALTER TYPE "trip_delivery_stop_status" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "trip_delivery_stops" ADD COLUMN     "actual_arrival" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT;

-- CreateIndex
CREATE INDEX "trip_delivery_stops_tenant_id_status_idx" ON "trip_delivery_stops"("tenant_id", "status");
