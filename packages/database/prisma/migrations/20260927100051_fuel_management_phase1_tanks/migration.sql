-- CreateEnum
CREATE TYPE "fuel_tank_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "fuel_tank_movement_type" AS ENUM ('INITIAL_BALANCE', 'RECEIPT', 'INTERNAL_FUELING', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "driver_shifts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fuel_supplies" ADD COLUMN     "fuel_tank_id" UUID;

-- AlterTable
ALTER TABLE "tag_providers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "toll_rates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "fuel_tanks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fuel_type" "fuel_type" NOT NULL DEFAULT 'DIESEL_S10',
    "capacity_liters" DECIMAL(10,3) NOT NULL,
    "initial_stock_liters" DECIMAL(10,3) NOT NULL,
    "current_stock_liters" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "min_stock_liters" DECIMAL(10,3),
    "is_low_stock" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "status" "fuel_tank_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_tanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_tank_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tank_id" UUID NOT NULL,
    "type" "fuel_tank_movement_type" NOT NULL,
    "quantity_liters" DECIMAL(10,3) NOT NULL,
    "previous_balance_liters" DECIMAL(10,3) NOT NULL,
    "new_balance_liters" DECIMAL(10,3) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "fuel_supply_id" UUID,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "trip_id" UUID,
    "device_event_id" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_tank_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fuel_tanks_tenant_id_idx" ON "fuel_tanks"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_tanks_tenant_id_status_idx" ON "fuel_tanks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "fuel_tanks_tenant_id_is_low_stock_idx" ON "fuel_tanks"("tenant_id", "is_low_stock");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_tank_movements_fuel_supply_id_key" ON "fuel_tank_movements"("fuel_supply_id");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_tank_movements_device_event_id_key" ON "fuel_tank_movements"("device_event_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_idx" ON "fuel_tank_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_tank_id_idx" ON "fuel_tank_movements"("tenant_id", "tank_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_vehicle_id_idx" ON "fuel_tank_movements"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_driver_id_idx" ON "fuel_tank_movements"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_trip_id_idx" ON "fuel_tank_movements"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "fuel_tank_movements_tenant_id_effective_date_idx" ON "fuel_tank_movements"("tenant_id", "effective_date");

-- CreateIndex
CREATE INDEX "fuel_supplies_tenant_id_fuel_tank_id_idx" ON "fuel_supplies"("tenant_id", "fuel_tank_id");

-- AddForeignKey
ALTER TABLE "fuel_supplies" ADD CONSTRAINT "fuel_supplies_fuel_tank_id_fkey" FOREIGN KEY ("fuel_tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tanks" ADD CONSTRAINT "fuel_tanks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_fuel_supply_id_fkey" FOREIGN KEY ("fuel_supply_id") REFERENCES "fuel_supplies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_movements" ADD CONSTRAINT "fuel_tank_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "financial_bank_transactions_tenant_id_financial_account_id_exte" RENAME TO "financial_bank_transactions_tenant_id_financial_account_id__key";
