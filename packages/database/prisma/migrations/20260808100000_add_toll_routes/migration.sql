-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "toll_route_id" UUID;

-- CreateTable
CREATE TABLE "toll_routes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "origin_label" TEXT NOT NULL,
    "destination_label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toll_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_route_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "toll_route_id" UUID NOT NULL,
    "toll_plaza_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "toll_route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "toll_routes_tenant_id_idx" ON "toll_routes"("tenant_id");

-- CreateIndex
CREATE INDEX "toll_routes_tenant_id_is_active_idx" ON "toll_routes"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "toll_route_stops_tenant_id_idx" ON "toll_route_stops"("tenant_id");

-- CreateIndex
CREATE INDEX "toll_route_stops_toll_plaza_id_idx" ON "toll_route_stops"("toll_plaza_id");

-- CreateIndex
CREATE UNIQUE INDEX "toll_route_stops_toll_route_id_sequence_key" ON "toll_route_stops"("toll_route_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "toll_route_stops_toll_route_id_toll_plaza_id_key" ON "toll_route_stops"("toll_route_id", "toll_plaza_id");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_toll_route_id_fkey" FOREIGN KEY ("toll_route_id") REFERENCES "toll_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_routes" ADD CONSTRAINT "toll_routes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_route_stops" ADD CONSTRAINT "toll_route_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_route_stops" ADD CONSTRAINT "toll_route_stops_toll_route_id_fkey" FOREIGN KEY ("toll_route_id") REFERENCES "toll_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_route_stops" ADD CONSTRAINT "toll_route_stops_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
