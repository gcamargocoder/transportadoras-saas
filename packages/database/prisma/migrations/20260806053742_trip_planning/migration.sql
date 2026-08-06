-- CreateEnum
CREATE TYPE "trip_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "planned_arrival" TIMESTAMP(3),
ADD COLUMN     "priority" "trip_priority" NOT NULL DEFAULT 'NORMAL';

