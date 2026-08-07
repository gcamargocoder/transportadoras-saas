-- CreateEnum
CREATE TYPE "fuel_type" AS ENUM ('DIESEL_S10', 'DIESEL_S500', 'GASOLINA', 'ETANOL', 'ARLA32', 'OUTRO');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('CASH', 'PIX', 'CARD', 'INVOICE', 'FLEET_CARD', 'OTHER');

-- CreateTable
CREATE TABLE "fuel_stations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" VARCHAR(20),
    "city" TEXT,
    "state" VARCHAR(2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_supplies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "trip_id" UUID,
    "fuel_station_id" UUID NOT NULL,
    "attachment_id" UUID,
    "fuel_type" "fuel_type" NOT NULL,
    "liters" DECIMAL(10,3) NOT NULL,
    "price_per_liter" DECIMAL(10,4) NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "odometer_km" DECIMAL(10,2) NOT NULL,
    "supply_date" TIMESTAMP(3) NOT NULL,
    "payment_type" "payment_type",
    "invoice_number" TEXT,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_stations_tenant_id_idx" ON "fuel_stations"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_idx" ON "fuel_supplies"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_vehicle_id_idx" ON "fuel_supplies"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_driver_id_idx" ON "fuel_supplies"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_trip_id_idx" ON "fuel_supplies"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_fuel_station_id_idx" ON "fuel_supplies"("tenant_id", "fuel_station_id");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_supply_date_idx" ON "fuel_supplies"("tenant_id", "supply_date");

-- AddForeignKey
ALTER TABLE "fuel_stations" ADD CONSTRAINT "fuel_stations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_fuel_station_id_fkey" FOREIGN KEY ("fuel_station_id") REFERENCES "fuel_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

