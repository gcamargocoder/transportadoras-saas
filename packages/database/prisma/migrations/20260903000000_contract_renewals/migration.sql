-- CreateEnum
CREATE TYPE "contract_renewal_status" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'CONTRACT_EXPIRING';

-- CreateTable
CREATE TABLE "contract_renewals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "previous_contract_id" UUID NOT NULL,
    "new_contract_id" UUID,
    "status" "contract_renewal_status" NOT NULL DEFAULT 'PENDING',
    "previous_end_date" TIMESTAMP(3),
    "new_start_date" TIMESTAMP(3),
    "new_end_date" TIMESTAMP(3),
    "notes" TEXT,
    "initiated_by" UUID NOT NULL,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_renewals_new_contract_id_key" ON "contract_renewals"("new_contract_id");

-- CreateIndex
CREATE INDEX "contract_renewals_tenant_id_idx" ON "contract_renewals"("tenant_id");

-- CreateIndex
CREATE INDEX "contract_renewals_tenant_id_previous_contract_id_idx" ON "contract_renewals"("tenant_id", "previous_contract_id");

-- CreateIndex
CREATE INDEX "contract_renewals_tenant_id_status_idx" ON "contract_renewals"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_previous_contract_id_fkey" FOREIGN KEY ("previous_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_new_contract_id_fkey" FOREIGN KEY ("new_contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
