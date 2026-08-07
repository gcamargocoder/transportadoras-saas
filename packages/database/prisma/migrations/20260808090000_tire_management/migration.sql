-- CreateEnum
CREATE TYPE "tire_status" AS ENUM ('NEW', 'IN_USE', 'STOCK', 'RETREADED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "tire_location_type" AS ENUM ('STOCK', 'VEHICLE', 'TRAILER');

-- CreateTable
CREATE TABLE "tires" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fire_number" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "dot" TEXT,
    "serial_number" TEXT,
    "purchase_date" TIMESTAMP(3),
    "purchase_price" DECIMAL(10,2),
    "expected_lifespan_km" DECIMAL(10,2),
    "initial_tread_depth_mm" DECIMAL(5,2),
    "current_tread_depth_mm" DECIMAL(5,2),
    "status" "tire_status" NOT NULL DEFAULT 'STOCK',
    "location_type" "tire_location_type" NOT NULL DEFAULT 'STOCK',
    "vehicle_id" UUID,
    "trailer_id" UUID,
    "position" TEXT,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tire_id" UUID NOT NULL,
    "movement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previous_location_type" "tire_location_type",
    "previous_vehicle_id" UUID,
    "previous_trailer_id" UUID,
    "previous_position" TEXT,
    "new_location_type" "tire_location_type" NOT NULL,
    "new_vehicle_id" UUID,
    "new_trailer_id" UUID,
    "new_position" TEXT,
    "odometer_km" DECIMAL(10,2),
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_retreads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tire_id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "retread_date" TIMESTAMP(3) NOT NULL,
    "warranty" TEXT,
    "mileage_km" DECIMAL(10,2),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_retreads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_inspections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tire_id" UUID NOT NULL,
    "inspection_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tread_depth_mm" DECIMAL(5,2) NOT NULL,
    "pressure_psi" DECIMAL(6,2),
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_disposals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tire_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "disposal_date" TIMESTAMP(3) NOT NULL,
    "odometer_km" DECIMAL(10,2),
    "residual_value" DECIMAL(10,2),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tires_tenant_id_idx" ON "tires"("tenant_id");

-- CreateIndex
CREATE INDEX "tires_tenant_id_status_idx" ON "tires"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tires_tenant_id_vehicle_id_idx" ON "tires"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "tires_tenant_id_trailer_id_idx" ON "tires"("tenant_id", "trailer_id");

-- CreateIndex
CREATE UNIQUE INDEX "tires_tenant_id_fire_number_key" ON "tires"("tenant_id", "fire_number");

-- CreateIndex
CREATE INDEX "tire_movements_tenant_id_idx" ON "tire_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "tire_movements_tenant_id_tire_id_idx" ON "tire_movements"("tenant_id", "tire_id");

-- CreateIndex
CREATE INDEX "tire_retreads_tenant_id_idx" ON "tire_retreads"("tenant_id");

-- CreateIndex
CREATE INDEX "tire_retreads_tenant_id_tire_id_idx" ON "tire_retreads"("tenant_id", "tire_id");

-- CreateIndex
CREATE INDEX "tire_inspections_tenant_id_idx" ON "tire_inspections"("tenant_id");

-- CreateIndex
CREATE INDEX "tire_inspections_tenant_id_tire_id_idx" ON "tire_inspections"("tenant_id", "tire_id");

-- CreateIndex
CREATE UNIQUE INDEX "tire_disposals_tire_id_key" ON "tire_disposals"("tire_id");

-- CreateIndex
CREATE INDEX "tire_disposals_tenant_id_idx" ON "tire_disposals"("tenant_id");

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tires" ADD CONSTRAINT "tires_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_previous_vehicle_id_fkey" FOREIGN KEY ("previous_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_new_vehicle_id_fkey" FOREIGN KEY ("new_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_previous_trailer_id_fkey" FOREIGN KEY ("previous_trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_new_trailer_id_fkey" FOREIGN KEY ("new_trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_retreads" ADD CONSTRAINT "tire_retreads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_retreads" ADD CONSTRAINT "tire_retreads_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_retreads" ADD CONSTRAINT "tire_retreads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_inspections" ADD CONSTRAINT "tire_inspections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_inspections" ADD CONSTRAINT "tire_inspections_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_inspections" ADD CONSTRAINT "tire_inspections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_disposals" ADD CONSTRAINT "tire_disposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_disposals" ADD CONSTRAINT "tire_disposals_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_disposals" ADD CONSTRAINT "tire_disposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

