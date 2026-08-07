-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "expense_payment_method" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'BANK_TRANSFER', 'COMPANY_ACCOUNT', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "expense_category_new" AS ENUM ('FUEL', 'FOOD', 'HOTEL', 'TOLL_EXTRA', 'MAINTENANCE', 'TIRES', 'PARKING', 'WASH', 'ADVANCE', 'FINE', 'OTHER');
ALTER TABLE "trip_expenses" ALTER COLUMN "category" TYPE "expense_category_new" USING ("category"::text::"expense_category_new");
ALTER TYPE "expense_category" RENAME TO "expense_category_old";
ALTER TYPE "expense_category_new" RENAME TO "expense_category";
DROP TYPE "expense_category_old";
COMMIT;

-- DropIndex
DROP INDEX "trip_expenses_trip_id_category_idx";

-- AlterTable
ALTER TABLE "trip_expenses" DROP COLUMN "actual_amount",
DROP COLUMN "occurred_at",
DROP COLUMN "planned_amount",
ADD COLUMN     "amount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "attachment_id" UUID,
ADD COLUMN     "created_by" UUID NOT NULL,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
ADD COLUMN     "document_number" TEXT,
ADD COLUMN     "driver_id" UUID,
ADD COLUMN     "expense_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "payment_method" "expense_payment_method",
ADD COLUMN     "status" "expense_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_by" UUID,
ADD COLUMN     "vehicle_id" UUID,
ALTER COLUMN "description" SET NOT NULL;

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_trip_id_idx" ON "trip_expenses"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_status_idx" ON "trip_expenses"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_category_idx" ON "trip_expenses"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_driver_id_idx" ON "trip_expenses"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_vehicle_id_idx" ON "trip_expenses"("tenant_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

