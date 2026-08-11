-- CreateEnum
CREATE TYPE "checklist_type" AS ENUM ('PRE_TRIP', 'POST_TRIP', 'MAINTENANCE', 'TRAILER', 'SAFETY', 'ACCIDENT', 'AUDIT');

-- CreateEnum
CREATE TYPE "checklist_template_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "checklist_item_type" AS ENUM ('BOOLEAN', 'TEXT', 'NUMBER', 'PHOTO', 'SIGNATURE', 'ODOMETER', 'SELECT');

-- CreateEnum
CREATE TYPE "checklist_execution_status" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "checklist_evidence_type" AS ENUM ('ODOMETER', 'AXLE_1', 'AXLE_2', 'AXLE_3', 'GENERAL', 'DAMAGE', 'SIGNATURE');

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "checklist_type" NOT NULL,
    "vehicle_type" "vehicle_type",
    "trailer_type" "trailer_type",
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "checklist_template_status" NOT NULL DEFAULT 'DRAFT',
    "previous_version_id" UUID,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_sections" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "checklist_item_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "requires_observation" BOOLEAN NOT NULL DEFAULT false,
    "requires_photo" BOOLEAN NOT NULL DEFAULT false,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_executions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "trip_id" UUID,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "trailer_id" UUID,
    "status" "checklist_execution_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "device_event_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "address" TEXT,
    "odometer_km" DECIMAL(10,1),
    "inspection_location" TEXT,
    "responsible_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_answers" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "boolean_value" BOOLEAN,
    "text_value" TEXT,
    "number_value" DECIMAL(10,2),
    "selected_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_evidence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "answer_id" UUID,
    "type" "checklist_evidence_type" NOT NULL,
    "attachment_id" UUID,
    "description" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_previous_version_id_key" ON "checklist_templates"("previous_version_id");

-- CreateIndex
CREATE INDEX "checklist_templates_tenant_id_type_status_idx" ON "checklist_templates"("tenant_id", "type", "status");

-- CreateIndex
CREATE INDEX "checklist_sections_template_id_idx" ON "checklist_sections"("template_id");

-- CreateIndex
CREATE INDEX "checklist_items_section_id_idx" ON "checklist_items"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_section_id_code_key" ON "checklist_items"("section_id", "code");

-- CreateIndex
CREATE INDEX "checklist_executions_tenant_id_status_idx" ON "checklist_executions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "checklist_executions_trip_id_idx" ON "checklist_executions"("trip_id");

-- CreateIndex
CREATE INDEX "checklist_executions_driver_id_idx" ON "checklist_executions"("driver_id");

-- CreateIndex
CREATE INDEX "checklist_executions_vehicle_id_idx" ON "checklist_executions"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_executions_tenant_id_device_event_id_key" ON "checklist_executions"("tenant_id", "device_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_answers_execution_id_item_id_key" ON "checklist_answers"("execution_id", "item_id");

-- CreateIndex
CREATE INDEX "checklist_evidence_execution_id_idx" ON "checklist_evidence"("execution_id");

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_sections" ADD CONSTRAINT "checklist_sections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "checklist_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "trailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "checklist_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_evidence" ADD CONSTRAINT "checklist_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_evidence" ADD CONSTRAINT "checklist_evidence_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "checklist_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_evidence" ADD CONSTRAINT "checklist_evidence_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "checklist_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_evidence" ADD CONSTRAINT "checklist_evidence_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

