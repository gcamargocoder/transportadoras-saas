-- AlterEnum
ALTER TYPE "fiscal_document_type" ADD VALUE 'OCCURRENCE_EVIDENCE';

-- AlterTable
ALTER TABLE "fiscal_documents" ADD COLUMN     "trip_occurrence_id" UUID;

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_trip_occurrence_id_idx" ON "fiscal_documents"("tenant_id", "trip_occurrence_id");

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_trip_occurrence_id_fkey" FOREIGN KEY ("trip_occurrence_id") REFERENCES "trip_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
