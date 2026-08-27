-- AlterEnum
ALTER TYPE "trip_occurrence_severity" ADD VALUE 'LOW';
ALTER TYPE "trip_occurrence_severity" ADD VALUE 'MEDIUM';
ALTER TYPE "trip_occurrence_severity" ADD VALUE 'HIGH';

-- AlterEnum
ALTER TYPE "trip_occurrence_type" ADD VALUE 'RECIPIENT_ABSENT';
ALTER TYPE "trip_occurrence_type" ADD VALUE 'WRONG_ADDRESS';
ALTER TYPE "trip_occurrence_type" ADD VALUE 'DELIVERY_REFUSED';
ALTER TYPE "trip_occurrence_type" ADD VALUE 'CARGO_DAMAGE';

-- AlterTable
ALTER TABLE "trip_occurrences" ADD COLUMN     "in_progress_at" TIMESTAMP(3),
ADD COLUMN     "trip_delivery_stop_id" UUID;

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_trip_delivery_stop_id_idx" ON "trip_occurrences"("tenant_id", "trip_delivery_stop_id");

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_trip_delivery_stop_id_fkey" FOREIGN KEY ("trip_delivery_stop_id") REFERENCES "trip_delivery_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
