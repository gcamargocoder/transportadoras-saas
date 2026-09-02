-- Fase B -- periodo OCIOSO PERSISTIDO entre operacoes (veiculo parado entre
-- a chegada de uma viagem e a partida da seguinte). Migration ESTRITAMENTE
-- ADITIVA: cria 2 enums + 1 tabela + indices + FKs + 1 indice unico PARCIAL
-- (1 periodo aberto por veiculo). Nao altera/remove nenhuma coluna, tabela
-- ou dado existente. Nao toca Trip.actualArrival/actualDeparture nem
-- VehicleMaintenance.
--
-- (Statements de "drift" nao relacionados que o `prisma migrate diff`
-- sugeriu -- DROP DEFAULT em updated_at de driver_shifts/tag_providers/
-- toll_rates e RENAME de um indice de financial_bank_transactions -- foram
-- deliberadamente REMOVIDOS desta migration: sao divergencias pre-existentes
-- entre migrations antigas e a geracao atual do Prisma, fora do escopo da
-- Fase B, e a regra desta fase e "migration aditiva, nunca alterar o que ja
-- existe".)

-- CreateEnum
CREATE TYPE "vehicle_idle_reason" AS ENUM ('AGUARDANDO_CARGA', 'AGUARDANDO_ORDEM', 'MANUTENCAO', 'DOCUMENTACAO', 'DESCANSO', 'PATIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "vehicle_idle_period_source" AS ENUM ('AUTO', 'MANUAL_ADMIN', 'DRIVER_APP');

-- CreateTable
CREATE TABLE "vehicle_idle_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "reason" "vehicle_idle_reason" NOT NULL DEFAULT 'AGUARDANDO_ORDEM',
    "source" "vehicle_idle_period_source" NOT NULL,
    "trip_before_id" UUID,
    "trip_after_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_idle_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_idle_periods_tenant_id_idx" ON "vehicle_idle_periods"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicle_idle_periods_tenant_id_vehicle_id_idx" ON "vehicle_idle_periods"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_idle_periods_tenant_id_started_at_idx" ON "vehicle_idle_periods"("tenant_id", "started_at");

-- CreateIndex
CREATE INDEX "vehicle_idle_periods_tenant_id_ended_at_idx" ON "vehicle_idle_periods"("tenant_id", "ended_at");

-- CreateIndex
-- Concorrencia (secao 5): garante NO PROPRIO BANCO que um veiculo nunca tem
-- 2 periodos ABERTOS simultaneos -- protege contra 2 conclusoes, contra o
-- inicio de viagem colidir com uma conclusao e contra multiplas instancias
-- da API. Indice PARCIAL (so cobre linhas com ended_at IS NULL): periodos
-- ja fechados podem se repetir por veiculo normalmente (sao o historico).
-- Mesmo padrao de toll_data_sync_runs_one_running_per_provider. Nao esta no
-- schema.prisma (Prisma nao suporta indice parcial), mas qualquer violacao
-- vira PrismaClientKnownRequestError(P2002) automaticamente.
CREATE UNIQUE INDEX "vehicle_idle_periods_one_open_per_vehicle"
ON "vehicle_idle_periods" ("tenant_id", "vehicle_id")
WHERE "ended_at" IS NULL;

-- AddForeignKey
ALTER TABLE "vehicle_idle_periods" ADD CONSTRAINT "vehicle_idle_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_idle_periods" ADD CONSTRAINT "vehicle_idle_periods_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_idle_periods" ADD CONSTRAINT "vehicle_idle_periods_trip_before_id_fkey" FOREIGN KEY ("trip_before_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_idle_periods" ADD CONSTRAINT "vehicle_idle_periods_trip_after_id_fkey" FOREIGN KEY ("trip_after_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
