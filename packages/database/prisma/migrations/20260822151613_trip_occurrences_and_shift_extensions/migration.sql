-- Fase 67 -- Timeline Operacional, Ocorrencias e Jornada da Viagem
-- Migration aditiva: nova tabela trip_occurrences + extensao de
-- driver_shifts/shift_breaks (status/tipo permanecem derivados no
-- aplicativo, nunca colunas redundantes -- ver comentarios no schema).

-- CreateEnum
CREATE TYPE "trip_occurrence_type" AS ENUM ('ACCIDENT', 'BREAKDOWN', 'DELAY', 'ROUTE_DEVIATION', 'DELIVERY_PROBLEM', 'DOCUMENT_PROBLEM', 'VEHICLE_PROBLEM', 'FUEL_PROBLEM', 'TIRE_PROBLEM', 'OTHER');

-- CreateEnum
CREATE TYPE "trip_occurrence_severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "trip_occurrence_status" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- AlterTable (driver_shifts orfa/sem uso ate a Fase 67 -- DEFAULT
-- CURRENT_TIMESTAMP evita falha de NOT NULL em linhas preexistentes)
ALTER TABLE "driver_shifts" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable (shift_breaks: type reaproveita o enum trip_stop_type ja existente)
ALTER TABLE "shift_breaks" ADD COLUMN     "type" "trip_stop_type" NOT NULL DEFAULT 'REST';

-- CreateTable
CREATE TABLE "trip_occurrences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "driver_shift_id" UUID,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "type" "trip_occurrence_type" NOT NULL,
    "severity" "trip_occurrence_severity" NOT NULL DEFAULT 'INFO',
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "location_label" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "attachment_id" UUID,
    "metadata" JSONB DEFAULT '{}',
    "device_event_id" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_occurrences_device_event_id_key" ON "trip_occurrences"("device_event_id");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_idx" ON "trip_occurrences"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_trip_id_idx" ON "trip_occurrences"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_severity_idx" ON "trip_occurrences"("tenant_id", "severity");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_occurred_at_idx" ON "trip_occurrences"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_driver_id_idx" ON "trip_occurrences"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "trip_occurrences_tenant_id_vehicle_id_idx" ON "trip_occurrences"("tenant_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_driver_shift_id_fkey" FOREIGN KEY ("driver_shift_id") REFERENCES "driver_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_occurrences" ADD CONSTRAINT "trip_occurrences_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
