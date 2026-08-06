-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "user_role" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "user_role" ADD VALUE 'MANAGER';
ALTER TYPE "user_role" ADD VALUE 'AUDITOR';
ALTER TYPE "user_role" ADD VALUE 'DRIVER';

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'pt-BR';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "trade_name" TEXT;

-- AlterTable
ALTER TABLE "user_accounts" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

