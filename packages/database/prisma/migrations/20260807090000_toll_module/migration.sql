-- CreateEnum
CREATE TYPE "toll_transaction_status" AS ENUM ('NORMAL', 'DIVERGENT', 'EXEMPT');

-- AlterTable: tag_providers ja tem linhas seedadas (Sem Parar, ConectCar,
-- Veloe, Move Mais) -- updated_at precisa de DEFAULT para nao violar
-- NOT NULL nessas linhas existentes.
ALTER TABLE "tag_providers" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "toll_plazas" ADD COLUMN     "city" TEXT,
ADD COLUMN     "km" DECIMAL(10,3),
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "price_per_axle" DECIMAL(10,2),
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "toll_transactions" ADD COLUMN     "axle_count" INTEGER NOT NULL,
ADD COLUMN     "discrepancy_amount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "driver_id" UUID,
ADD COLUMN     "expected_amount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "status" "toll_transaction_status" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "tag_provider_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "vehicle_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_tags" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "toll_transactions_tenant_id_vehicle_id_idx" ON "toll_transactions"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "toll_transactions_tenant_id_driver_id_idx" ON "toll_transactions"("tenant_id", "driver_id");

-- CreateIndex
CREATE INDEX "toll_transactions_tenant_id_status_idx" ON "toll_transactions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "toll_transactions_tenant_id_tag_provider_id_idx" ON "toll_transactions"("tenant_id", "tag_provider_id");

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_tag_provider_id_fkey" FOREIGN KEY ("tag_provider_id") REFERENCES "tag_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

