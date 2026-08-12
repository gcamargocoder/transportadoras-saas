-- CreateEnum
CREATE TYPE "trip_stop_source" AS ENUM ('MANUAL', 'DRIVER_APP', 'GPS', 'SYSTEM', 'IMPORT', 'ADMIN');

-- AlterEnum
-- Fase 43 -- catalogo ampliado de tipos de parada, todos aditivos (nenhum
-- valor existente removido/renomeado).
ALTER TYPE "trip_stop_type" ADD VALUE 'LOADING';
ALTER TYPE "trip_stop_type" ADD VALUE 'UNLOADING';
ALTER TYPE "trip_stop_type" ADD VALUE 'WAITING_LOADING';
ALTER TYPE "trip_stop_type" ADD VALUE 'WAITING_UNLOADING';
ALTER TYPE "trip_stop_type" ADD VALUE 'YARD';
ALTER TYPE "trip_stop_type" ADD VALUE 'CUSTOMER';
ALTER TYPE "trip_stop_type" ADD VALUE 'GARAGE';
ALTER TYPE "trip_stop_type" ADD VALUE 'BREAKDOWN';
ALTER TYPE "trip_stop_type" ADD VALUE 'TIRE';
ALTER TYPE "trip_stop_type" ADD VALUE 'CONGESTION';
ALTER TYPE "trip_stop_type" ADD VALUE 'ACCIDENT';
ALTER TYPE "trip_stop_type" ADD VALUE 'ROAD_CLOSURE';
ALTER TYPE "trip_stop_type" ADD VALUE 'INSPECTION';
ALTER TYPE "trip_stop_type" ADD VALUE 'PERSONAL_NEED';
ALTER TYPE "trip_stop_type" ADD VALUE 'DOCUMENTATION';
ALTER TYPE "trip_stop_type" ADD VALUE 'WAITING_AUTHORIZATION';

-- DropForeignKey
ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_trip_id_fkey";

-- AlterTable
-- Fase 43 -- tripId/driverId/latitude/longitude passam a ser opcionais
-- (paradas administrativas sem viagem/motorista associado); novas colunas
-- aditivas (source/notes/cancelled_at).
ALTER TABLE "trip_stops" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" "trip_stop_source" NOT NULL DEFAULT 'DRIVER_APP',
ALTER COLUMN "trip_id" DROP NOT NULL,
ALTER COLUMN "driver_id" DROP NOT NULL,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_vehicle_id_idx" ON "trip_stops"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_started_at_idx" ON "trip_stops"("tenant_id", "started_at");

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
