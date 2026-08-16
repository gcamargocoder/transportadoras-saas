-- CreateEnum
CREATE TYPE "maintenance_component" AS ENUM ('ENGINE', 'TRANSMISSION', 'DIFFERENTIAL', 'BRAKES', 'SUSPENSION', 'CLUTCH', 'TIRES', 'COOLING', 'ELECTRICAL', 'ARLA', 'FILTERS', 'ENGINE_OIL', 'TRANSMISSION_OIL', 'DIFFERENTIAL_OIL', 'DIESEL_FILTER', 'AIR_FILTER', 'OIL_FILTER', 'BATTERY', 'SPRINGS', 'SHOCK_ABSORBERS', 'SIDER', 'TRAILER', 'OTHER');

-- AlterTable
ALTER TABLE "vehicle_maintenances" ADD COLUMN     "component" "maintenance_component",
ADD COLUMN     "downtime_minutes" INTEGER,
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "maintenance_plan_id" UUID,
ADD COLUMN     "next_odometer_km" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "maintenance_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "component" "maintenance_component" NOT NULL,
    "maintenance_type" "vehicle_maintenance_type" NOT NULL DEFAULT 'PREVENTIVE',
    "interval_km" INTEGER,
    "interval_days" INTEGER,
    "interval_hours" INTEGER,
    "alert_before_km" INTEGER,
    "alert_before_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_parts" (
    "id" UUID NOT NULL,
    "maintenance_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_plans_tenant_id_idx" ON "maintenance_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "maintenance_plans_tenant_id_vehicle_id_idx" ON "maintenance_plans"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "maintenance_plans_tenant_id_active_idx" ON "maintenance_plans"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "maintenance_parts_maintenance_id_idx" ON "maintenance_parts"("maintenance_id");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_tenant_id_component_idx" ON "vehicle_maintenances"("tenant_id", "component");

-- CreateIndex
CREATE INDEX "vehicle_maintenances_maintenance_plan_id_idx" ON "vehicle_maintenances"("maintenance_plan_id");

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_maintenance_plan_id_fkey" FOREIGN KEY ("maintenance_plan_id") REFERENCES "maintenance_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "vehicle_maintenances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

