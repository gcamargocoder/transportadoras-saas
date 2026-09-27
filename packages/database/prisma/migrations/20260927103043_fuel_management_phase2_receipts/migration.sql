-- AlterTable
ALTER TABLE "fuel_tank_movements" ADD COLUMN     "fuel_station_id" UUID,
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "price_per_liter" DECIMAL(10,4),
ADD COLUMN     "total_amount" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_fuel_station_id_idx" ON "fuel_tank_movements"("tenant_id", "fuel_station_id");

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_fuel_station_id_fkey" FOREIGN KEY ("fuel_station_id") REFERENCES "fuel_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
