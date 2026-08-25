-- CreateEnum
CREATE TYPE "part_stock_movement_type" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "maintenance_parts" ADD COLUMN     "part_id" UUID;

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "manufacturer" TEXT,
    "oem_code" TEXT,
    "min_stock" DECIMAL(10,2),
    "current_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_low_stock" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "type" "part_stock_movement_type" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "movement_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "maintenance_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parts_tenant_id_idx" ON "parts"("tenant_id");

-- CreateIndex
CREATE INDEX "parts_tenant_id_is_active_idx" ON "parts"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "parts_tenant_id_category_idx" ON "parts"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "parts_tenant_id_is_low_stock_idx" ON "parts"("tenant_id", "is_low_stock");

-- CreateIndex
CREATE UNIQUE INDEX "parts_tenant_id_sku_key" ON "parts"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "part_stock_movements_tenant_id_idx" ON "part_stock_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "part_stock_movements_tenant_id_part_id_idx" ON "part_stock_movements"("tenant_id", "part_id");

-- CreateIndex
CREATE INDEX "part_stock_movements_tenant_id_maintenance_id_idx" ON "part_stock_movements"("tenant_id", "maintenance_id");

-- CreateIndex
CREATE INDEX "part_stock_movements_tenant_id_movement_date_idx" ON "part_stock_movements"("tenant_id", "movement_date");

-- CreateIndex
CREATE INDEX "maintenance_parts_part_id_idx" ON "maintenance_parts"("part_id");

-- AddForeignKey
ALTER TABLE "maintenance_parts" ADD CONSTRAINT "maintenance_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stock_movements" ADD CONSTRAINT "part_stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stock_movements" ADD CONSTRAINT "part_stock_movements_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stock_movements" ADD CONSTRAINT "part_stock_movements_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "vehicle_maintenances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stock_movements" ADD CONSTRAINT "part_stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
