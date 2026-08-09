-- CreateEnum
CREATE TYPE "import_file_type" AS ENUM ('CSV', 'XLSX', 'XML', 'TXT', 'API_INTEGRATION');

-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL_SUCCESS');

-- CreateEnum
CREATE TYPE "import_row_issue_type" AS ENUM ('VALIDATION_ERROR', 'DUPLICATE');

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "file_type" "import_file_type" NOT NULL,
    "status" "import_job_status" NOT NULL DEFAULT 'PENDING',
    "imported_records" INTEGER NOT NULL DEFAULT 0,
    "ignored_records" INTEGER NOT NULL DEFAULT 0,
    "error_records" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job_errors" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "issue_type" "import_row_issue_type" NOT NULL,
    "message" TEXT NOT NULL,
    "raw_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_job_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_tenant_id_idx" ON "import_jobs"("tenant_id");

-- CreateIndex
CREATE INDEX "import_jobs_tenant_id_status_idx" ON "import_jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "import_jobs_provider_id_idx" ON "import_jobs"("provider_id");

-- CreateIndex
CREATE INDEX "import_job_errors_import_job_id_idx" ON "import_job_errors"("import_job_id");

-- CreateIndex
CREATE INDEX "import_job_errors_tenant_id_idx" ON "import_job_errors"("tenant_id");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "tag_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_errors" ADD CONSTRAINT "import_job_errors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_errors" ADD CONSTRAINT "import_job_errors_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

