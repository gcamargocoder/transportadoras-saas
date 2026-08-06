-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "document_type" ADD VALUE 'MEDICAL_EXAM';
ALTER TYPE "document_type" ADD VALUE 'MOPP';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "admission_date" TIMESTAMP(3),
ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnh_expires_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "cpf" VARCHAR(11) NOT NULL,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rg" VARCHAR(20),
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "termination_date" TIMESTAMP(3),
ADD COLUMN     "zip_code" VARCHAR(9);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_tenant_id_cpf_key" ON "drivers"("tenant_id", "cpf");

