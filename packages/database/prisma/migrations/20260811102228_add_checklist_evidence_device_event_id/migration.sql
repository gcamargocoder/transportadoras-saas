-- AlterTable
ALTER TABLE "checklist_evidence" ADD COLUMN     "device_event_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "checklist_evidence_execution_id_device_event_id_key" ON "checklist_evidence"("execution_id", "device_event_id");

