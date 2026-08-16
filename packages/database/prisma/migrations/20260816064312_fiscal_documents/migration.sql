-- CreateEnum
CREATE TYPE "fiscal_document_type" AS ENUM ('CTE', 'MDFE', 'NFE', 'CIOT', 'DACTE', 'DAMDFE', 'DELIVERY_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "fiscal_document_status" AS ENUM ('PENDING', 'VALID', 'INVALID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "fiscal_document_source" AS ENUM ('UPLOAD', 'XML_IMPORT');

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_type" "fiscal_document_type" NOT NULL,
    "document_number" TEXT,
    "access_key" TEXT,
    "series" TEXT,
    "issue_date" TIMESTAMP(3),
    "sender_name" TEXT,
    "sender_document" TEXT,
    "recipient_name" TEXT,
    "recipient_document" TEXT,
    "amount" DECIMAL(14,2),
    "status" "fiscal_document_status" NOT NULL DEFAULT 'PENDING',
    "source" "fiscal_document_source" NOT NULL,
    "attachment_id" UUID,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "metadata" JSONB DEFAULT '{}',
    "trip_id" UUID,
    "vehicle_id" UUID,
    "driver_id" UUID,
    "customer_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_document_type_idx" ON "fiscal_documents"("tenant_id", "document_type");

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_status_idx" ON "fiscal_documents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_trip_id_idx" ON "fiscal_documents"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_vehicle_id_idx" ON "fiscal_documents"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_driver_id_idx" ON "fiscal_documents"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_tenant_id_issue_date_idx" ON "fiscal_documents"("tenant_id", "issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_tenant_id_access_key_key" ON "fiscal_documents"("tenant_id", "access_key");

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

