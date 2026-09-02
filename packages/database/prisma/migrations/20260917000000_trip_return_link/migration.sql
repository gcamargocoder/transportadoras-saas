-- Fase D -- vinculo EXPLICITO ida -> retorno + INTENCAO de carga no
-- planejamento. Migration ESTRITAMENTE ADITIVA:
--   * 2 colunas nullable em "trips" ("previous_trip_id", "planned_load_status")
--   * 1 indice composto ("tenant_id", "previous_trip_id")
--   * 1 FK self-referential ("previous_trip_id" -> "trips"."id") ON DELETE SET NULL
--
-- NAO altera/remove nenhuma coluna, tabela, enum ou dado existente. Nenhum
-- backfill. Viagens existentes permanecem validas (ambas as colunas ficam
-- NULL). "load_status" (valor REAL informado pelo motorista na largada,
-- Fase 27) fica INTOCADO -- "planned_load_status" e apenas intencao de
-- planejamento e nunca deriva/altera "load_status".
--
-- Reaproveita o enum "trip_load_status" ja existente (LOADED | EMPTY) --
-- nenhum enum novo.

-- AlterTable
ALTER TABLE "trips" ADD COLUMN "previous_trip_id" UUID;
ALTER TABLE "trips" ADD COLUMN "planned_load_status" "trip_load_status";

-- CreateIndex
CREATE INDEX "trips_tenant_id_previous_trip_id_idx" ON "trips"("tenant_id", "previous_trip_id");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_previous_trip_id_fkey" FOREIGN KEY ("previous_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
