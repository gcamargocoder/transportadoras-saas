-- Fase 109 -- vinculo opcional entre TireMovement e VehicleMaintenance (OS),
-- mesmo padrao ja usado por PartStockMovement.maintenanceId (Fase 83).
-- Exclusivamente aditivo: coluna nullable + indice + FK ON DELETE SET NULL.

-- AlterTable
ALTER TABLE "tire_movements" ADD COLUMN "maintenance_id" UUID;

-- CreateIndex
CREATE INDEX "tire_movements_maintenance_id_idx" ON "tire_movements"("maintenance_id");

-- AddForeignKey
ALTER TABLE "tire_movements" ADD CONSTRAINT "tire_movements_maintenance_id_fkey" FOREIGN KEY ("maintenance_id") REFERENCES "vehicle_maintenances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
