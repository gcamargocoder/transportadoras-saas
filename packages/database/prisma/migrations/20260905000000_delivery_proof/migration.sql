-- AlterTable
ALTER TABLE "fiscal_documents" ADD COLUMN     "trip_delivery_stop_id" UUID;

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_trip_delivery_stop_id_idx" ON "fiscal_documents"("tenant_id", "trip_delivery_stop_id");

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_trip_delivery_stop_id_fkey" FOREIGN KEY ("trip_delivery_stop_id") REFERENCES "trip_delivery_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
