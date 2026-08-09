-- CreateEnum
CREATE TYPE "trip_stop_type" AS ENUM ('UNKNOWN', 'FUEL', 'REST', 'MEAL', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "axle_event_source" AS ENUM ('DRIVER_INPUT', 'TIMEOUT_DEFAULT');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "fuel_supplies" ADD COLUMN     "device_event_id" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "sync_status" "sync_status" NOT NULL DEFAULT 'SYNCED',
ADD COLUMN     "synced_at" TIMESTAMP(3),
ALTER COLUMN "fuel_station_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "stop_detection_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "stop_radius_meters" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "toll_proximity_radius_meters" INTEGER NOT NULL DEFAULT 3000;

-- AlterTable
ALTER TABLE "tracking_points" ADD COLUMN     "device_event_id" TEXT,
ADD COLUMN     "sync_status" "sync_status" NOT NULL DEFAULT 'SYNCED',
ADD COLUMN     "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "type" "trip_stop_type" NOT NULL DEFAULT 'UNKNOWN',
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "location_label" TEXT,
    "device_event_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_status" "sync_status" NOT NULL DEFAULT 'SYNCED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axle_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "trip_composition_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "toll_plaza_id" UUID,
    "default_axles" INTEGER NOT NULL,
    "declared_axles" INTEGER NOT NULL,
    "suspended_axles" INTEGER NOT NULL,
    "source" "axle_event_source" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "device_event_id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_status" "sync_status" NOT NULL DEFAULT 'SYNCED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "axle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_stops_device_event_id_key" ON "trip_stops"("device_event_id");

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_idx" ON "trip_stops"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_stops_tenant_id_trip_id_idx" ON "trip_stops"("tenant_id", "trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "axle_events_device_event_id_key" ON "axle_events"("device_event_id");

-- CreateIndex
CREATE INDEX "axle_events_tenant_id_idx" ON "axle_events"("tenant_id");

-- CreateIndex
CREATE INDEX "axle_events_tenant_id_trip_id_idx" ON "axle_events"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "axle_events_toll_plaza_id_idx" ON "axle_events"("toll_plaza_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_supplies_device_event_id_key" ON "fuel_supplies"("device_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_points_device_event_id_key" ON "tracking_points"("device_event_id");

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_trip_composition_id_fkey" FOREIGN KEY ("trip_composition_id") REFERENCES "trip_compositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_events" ADD CONSTRAINT "axle_events_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

