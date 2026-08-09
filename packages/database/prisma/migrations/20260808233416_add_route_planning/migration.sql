-- CreateEnum
CREATE TYPE "route_toll_estimate_source" AS ENUM ('MATCHED_PLAZAS', 'PROVIDER_AGGREGATE', 'NONE');

-- CreateEnum
CREATE TYPE "toll_match_status" AS ENUM ('MATCHED', 'UNMATCHED');

-- AlterTable
ALTER TABLE "route_events" ADD COLUMN     "resulting_route_plan_id" UUID;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "route_deviation_minutes" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "route_plan_id" UUID;

-- CreateTable
CREATE TABLE "route_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "origin_latitude" DECIMAL(10,7) NOT NULL,
    "origin_longitude" DECIMAL(10,7) NOT NULL,
    "destination_latitude" DECIMAL(10,7) NOT NULL,
    "destination_longitude" DECIMAL(10,7) NOT NULL,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "encoded_polyline" TEXT NOT NULL,
    "total_toll_amount" DECIMAL(10,2),
    "toll_estimate_source" "route_toll_estimate_source" NOT NULL DEFAULT 'NONE',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "axle_count_used" INTEGER,
    "reason" "route_version_reason" NOT NULL DEFAULT 'INITIAL',
    "provider" TEXT NOT NULL,
    "provider_route_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_plan_tolls" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "route_plan_id" UUID NOT NULL,
    "toll_plaza_id" UUID,
    "sequence" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "name" TEXT NOT NULL,
    "distance_from_origin_meters" INTEGER NOT NULL,
    "estimated_amount" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "axle_count_used" INTEGER,
    "match_status" "toll_match_status" NOT NULL DEFAULT 'UNMATCHED',
    "match_confidence" DECIMAL(4,3),
    "source" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_plan_tolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "route_plans_tenant_id_idx" ON "route_plans"("tenant_id");

-- CreateIndex
CREATE INDEX "route_plans_trip_id_idx" ON "route_plans"("trip_id");

-- CreateIndex
CREATE INDEX "route_plan_tolls_tenant_id_idx" ON "route_plan_tolls"("tenant_id");

-- CreateIndex
CREATE INDEX "route_plan_tolls_route_plan_id_idx" ON "route_plan_tolls"("route_plan_id");

-- CreateIndex
CREATE INDEX "route_plan_tolls_toll_plaza_id_idx" ON "route_plan_tolls"("toll_plaza_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_plan_tolls_route_plan_id_sequence_key" ON "route_plan_tolls"("route_plan_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "route_events_resulting_route_plan_id_key" ON "route_events"("resulting_route_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_route_plan_id_key" ON "trips"("route_plan_id");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_plan_id_fkey" FOREIGN KEY ("route_plan_id") REFERENCES "route_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_events" ADD CONSTRAINT "route_events_resulting_route_plan_id_fkey" FOREIGN KEY ("resulting_route_plan_id") REFERENCES "route_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plan_tolls" ADD CONSTRAINT "route_plan_tolls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plan_tolls" ADD CONSTRAINT "route_plan_tolls_route_plan_id_fkey" FOREIGN KEY ("route_plan_id") REFERENCES "route_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_plan_tolls" ADD CONSTRAINT "route_plan_tolls_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

