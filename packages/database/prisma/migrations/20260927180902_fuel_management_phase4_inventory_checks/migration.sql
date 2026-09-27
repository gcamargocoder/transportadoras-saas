-- CreateTable
CREATE TABLE "fuel_tank_inventory_checks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tank_id" UUID NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "theoretical_stock_liters" DECIMAL(10,3) NOT NULL,
    "measured_stock_liters" DECIMAL(10,3) NOT NULL,
    "divergence_liters" DECIMAL(10,3) NOT NULL,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "adjustment_movement_id" UUID,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuel_tank_inventory_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_tank_inventory_checks_adjustment_movement_id_key" ON "fuel_tank_inventory_checks"("adjustment_movement_id");

-- CreateIndex
CREATE INDEX "fuel_tank_inventory_checks_tenant_id_idx" ON "fuel_tank_inventory_checks"("tenant_id");

-- CreateIndex
CREATE INDEX "fuel_tank_inventory_checks_tenant_id_tank_id_idx" ON "fuel_tank_inventory_checks"("tenant_id", "tank_id");

-- CreateIndex
CREATE INDEX "fuel_tank_inventory_checks_tenant_id_checked_at_idx" ON "fuel_tank_inventory_checks"("tenant_id", "checked_at");

-- AddForeignKey
ALTER TABLE "fuel_tank_inventory_checks" ADD CONSTRAINT "fuel_tank_inventory_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_inventory_checks" ADD CONSTRAINT "fuel_tank_inventory_checks_tank_id_fkey" FOREIGN KEY ("tank_id") REFERENCES "fuel_tanks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_inventory_checks" ADD CONSTRAINT "fuel_tank_inventory_checks_adjustment_movement_id_fkey" FOREIGN KEY ("adjustment_movement_id") REFERENCES "fuel_tank_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_tank_inventory_checks" ADD CONSTRAINT "fuel_tank_inventory_checks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
