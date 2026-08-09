-- CreateEnum
CREATE TYPE "trip_load_status" AS ENUM ('LOADED', 'EMPTY');

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "initial_odometer_km" DECIMAL(10,1),
ADD COLUMN     "load_status" "trip_load_status";

