-- AlterTable
ALTER TABLE "vehicle_maintenances" ADD COLUMN     "checklist_execution_id" UUID;

-- CreateIndex
CREATE INDEX "vehicle_maintenances_checklist_execution_id_idx" ON "vehicle_maintenances"("checklist_execution_id");

-- AddForeignKey
ALTER TABLE "vehicle_maintenances" ADD CONSTRAINT "vehicle_maintenances_checklist_execution_id_fkey" FOREIGN KEY ("checklist_execution_id") REFERENCES "checklist_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
