-- CreateEnum
CREATE TYPE "receivable_status" AS ENUM ('OPEN', 'PARTIALLY_RECEIVED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "status" "receivable_status" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "receivables_tenant_id_status_idx" ON "receivables"("tenant_id", "status");
