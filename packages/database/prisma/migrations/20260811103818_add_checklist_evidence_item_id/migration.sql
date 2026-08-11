-- AlterTable
ALTER TABLE "checklist_evidence" ADD COLUMN     "item_id" UUID;

-- CreateIndex
CREATE INDEX "checklist_evidence_item_id_idx" ON "checklist_evidence"("item_id");

-- AddForeignKey
ALTER TABLE "checklist_evidence" ADD CONSTRAINT "checklist_evidence_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

