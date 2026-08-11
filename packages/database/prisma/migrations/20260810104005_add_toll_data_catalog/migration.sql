-- CreateEnum
CREATE TYPE "toll_data_provider" AS ENUM ('ANTT', 'ARTESP', 'OTHER');

-- CreateEnum
CREATE TYPE "toll_data_sync_status" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "toll_rate_status" AS ENUM ('VERIFIED', 'PENDING_REVIEW', 'STALE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "toll_plaza_match_confidence" AS ENUM ('LINKED', 'PENDING_REVIEW');

-- AlterTable
ALTER TABLE "toll_rates" ADD COLUMN     "collected_at" TIMESTAMP(3),
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
ADD COLUMN     "effective_until" TIMESTAMP(3),
ADD COLUMN     "source_document" TEXT,
ADD COLUMN     "source_id" UUID,
ADD COLUMN     "source_reference" TEXT,
ADD COLUMN     "status" "toll_rate_status" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "toll_data_sources" (
    "id" UUID NOT NULL,
    "provider" "toll_data_provider" NOT NULL,
    "name" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toll_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_data_sync_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "provider" "toll_data_provider" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" "toll_data_sync_status" NOT NULL DEFAULT 'RUNNING',
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_unchanged" INTEGER NOT NULL DEFAULT 0,
    "records_rejected" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_data_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_plaza_data_source_links" (
    "id" UUID NOT NULL,
    "toll_plaza_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "provider" "toll_data_provider" NOT NULL,
    "source_key" TEXT NOT NULL,
    "match_confidence" "toll_plaza_match_confidence" NOT NULL DEFAULT 'LINKED',
    "raw_snapshot" JSONB,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toll_plaza_data_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "toll_data_sources_provider_key" ON "toll_data_sources"("provider");

-- CreateIndex
CREATE INDEX "toll_data_sync_runs_provider_started_at_idx" ON "toll_data_sync_runs"("provider", "started_at");

-- CreateIndex
CREATE INDEX "toll_data_sync_runs_source_id_idx" ON "toll_data_sync_runs"("source_id");

-- CreateIndex
CREATE INDEX "toll_plaza_data_source_links_toll_plaza_id_idx" ON "toll_plaza_data_source_links"("toll_plaza_id");

-- CreateIndex
CREATE INDEX "toll_plaza_data_source_links_source_id_idx" ON "toll_plaza_data_source_links"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "toll_plaza_data_source_links_provider_source_key_key" ON "toll_plaza_data_source_links"("provider", "source_key");

-- CreateIndex
CREATE INDEX "toll_rates_toll_plaza_id_axle_category_effective_from_idx" ON "toll_rates"("toll_plaza_id", "axle_category", "effective_from");

-- CreateIndex
CREATE INDEX "toll_rates_source_id_idx" ON "toll_rates"("source_id");

-- CreateIndex
CREATE INDEX "toll_rates_status_idx" ON "toll_rates"("status");

-- AddForeignKey
ALTER TABLE "toll_data_sync_runs" ADD CONSTRAINT "toll_data_sync_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "toll_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_plaza_data_source_links" ADD CONSTRAINT "toll_plaza_data_source_links_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_plaza_data_source_links" ADD CONSTRAINT "toll_plaza_data_source_links_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "toll_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_rates" ADD CONSTRAINT "toll_rates_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "toll_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_rates" ADD CONSTRAINT "toll_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

