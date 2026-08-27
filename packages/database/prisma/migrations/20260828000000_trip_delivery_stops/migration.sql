-- CreateEnum
CREATE TYPE "trip_delivery_stop_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "trip_delivery_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "customer_id" UUID,
    "location_id" UUID NOT NULL,
    "status" "trip_delivery_stop_status" NOT NULL DEFAULT 'PENDING',
    "planned_arrival" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_delivery_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_delivery_stops_tenant_id_idx" ON "trip_delivery_stops"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_delivery_stops_tenant_id_trip_id_idx" ON "trip_delivery_stops"("tenant_id", "trip_id");

-- CreateIndex
CREATE INDEX "trip_delivery_stops_tenant_id_customer_id_idx" ON "trip_delivery_stops"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "trip_delivery_stops_tenant_id_location_id_idx" ON "trip_delivery_stops"("tenant_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_delivery_stops_trip_id_sequence_key" ON "trip_delivery_stops"("trip_id", "sequence");

-- AddForeignKey
ALTER TABLE "trip_delivery_stops" ADD CONSTRAINT "trip_delivery_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_delivery_stops" ADD CONSTRAINT "trip_delivery_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_delivery_stops" ADD CONSTRAINT "trip_delivery_stops_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_delivery_stops" ADD CONSTRAINT "trip_delivery_stops_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
