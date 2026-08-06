-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'OPERATOR', 'DISPATCHER');

-- CreateEnum
CREATE TYPE "fleet_type" AS ENUM ('OWN', 'AGGREGATED', 'OUTSOURCED');

-- CreateEnum
CREATE TYPE "trailer_type" AS ENUM ('SIMPLE', 'BITREM', 'RODOTREM', 'VANDERLEIA', 'OTHER');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "route_version_reason" AS ENUM ('INITIAL', 'DEVIATION', 'ACCIDENT', 'ROADWORK', 'INTERDICTION', 'DESTINATION_CHANGE');

-- CreateEnum
CREATE TYPE "route_event_type" AS ENUM ('DEVIATION', 'ACCIDENT', 'ROADWORK', 'INTERDICTION', 'DESTINATION_CHANGE');

-- CreateEnum
CREATE TYPE "alert_type" AS ENUM ('ROUTE_DEVIATION', 'TOLL_DISCREPANCY', 'DELAY', 'ROUTE_EVENT', 'DOCUMENT_EXPIRING', 'OTHER');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('PUSH', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "toll_transaction_source" AS ENUM ('INTEGRATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "toll_audit_status" AS ENUM ('OK', 'DISCREPANCY', 'PENDING');

-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('TOLL', 'FUEL', 'MAINTENANCE', 'MEALS', 'PARKING', 'LODGING', 'PER_DIEM', 'OTHER');

-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('FACTORY', 'DISTRIBUTION_CENTER', 'PORT', 'TERMINAL', 'CUSTOMER_SITE', 'BRANCH', 'OTHER');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('CRLV', 'ANTT', 'CNH', 'LICENSING', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "document_owner_type" AS ENUM ('VEHICLE', 'TRAILER', 'DRIVER', 'TENANT');

-- CreateEnum
CREATE TYPE "attachment_type" AS ENUM ('PHOTO_VEHICLE', 'PHOTO_CARGO', 'PHOTO_INVOICE', 'PHOTO_TOLL', 'RECEIPT', 'OTHER');

-- CreateEnum
CREATE TYPE "external_system" AS ENUM ('TMS', 'ERP', 'TELEMETRY_PROVIDER', 'TOLL_OPERATOR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "max_deviation_meters" INTEGER NOT NULL DEFAULT 500,
    "gps_ping_interval_seconds" INTEGER NOT NULL DEFAULT 30,
    "alert_delay_threshold_min" INTEGER NOT NULL DEFAULT 15,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "preferences" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(45),
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "fleet_type" NOT NULL DEFAULT 'OWN',
    "location_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fleet_id" UUID,
    "plate" VARCHAR(10) NOT NULL,
    "model" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trailers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plate" VARCHAR(10) NOT NULL,
    "type" "trailer_type" NOT NULL DEFAULT 'SIMPLE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_tags" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "tag_provider_id" UUID NOT NULL,
    "tag_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_account_id" UUID,
    "name" TEXT NOT NULL,
    "cnh_number" VARCHAR(20) NOT NULL,
    "cnh_category" VARCHAR(5) NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "trip_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" UUID NOT NULL,
    "driver_shift_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "location_type" NOT NULL DEFAULT 'OTHER',
    "address" TEXT,
    "geo_point" geometry(Point, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_compositions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_composition_trailers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_composition_id" UUID NOT NULL,
    "trailer_id" UUID NOT NULL,
    "position_order" INTEGER NOT NULL,

    CONSTRAINT "trip_composition_trailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "axle_configurations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_composition_id" UUID NOT NULL,
    "total_axles" INTEGER NOT NULL,
    "raised_axles" INTEGER NOT NULL DEFAULT 0,
    "lowered_axles" INTEGER NOT NULL DEFAULT 0,
    "suspended_axles" INTEGER NOT NULL DEFAULT 0,
    "steering_axles" INTEGER NOT NULL DEFAULT 0,
    "traction_axles" INTEGER NOT NULL DEFAULT 0,
    "billable_category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "axle_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "driver_id" UUID,
    "origin_location_id" UUID NOT NULL,
    "destination_location_id" UUID NOT NULL,
    "status" "trip_status" NOT NULL DEFAULT 'PLANNED',
    "planned_departure" TIMESTAMP(3),
    "actual_departure" TIMESTAMP(3),
    "actual_arrival" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "reason" "route_version_reason" NOT NULL DEFAULT 'INITIAL',
    "geometry" geometry(LineString, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "type" "route_event_type" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resulting_route_version_id" UUID,

    CONSTRAINT "route_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_points" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "speed_kmh" DECIMAL(5,2),
    "heading_deg" DECIMAL(5,2),
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID,
    "route_event_id" UUID,
    "type" "alert_type" NOT NULL,
    "severity" "alert_severity" NOT NULL DEFAULT 'MEDIUM',
    "message" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID,
    "vehicle_id" UUID NOT NULL,
    "ignition_on" BOOLEAN,
    "battery_level" DECIMAL(5,2),
    "fuel_level" DECIMAL(5,2),
    "temperature_c" DECIMAL(5,2),
    "rpm" INTEGER,
    "odometer_km" DECIMAL(10,2),
    "can_speed_kmh" DECIMAL(5,2),
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_plazas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "highway" TEXT,
    "geo_point" geometry(Point, 4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_plazas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_rates" (
    "id" UUID NOT NULL,
    "toll_plaza_id" UUID NOT NULL,
    "axle_category" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_predictions" (
    "id" UUID NOT NULL,
    "route_version_id" UUID NOT NULL,
    "toll_plaza_id" UUID NOT NULL,
    "predicted_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "toll_plaza_id" UUID NOT NULL,
    "charged_amount" DECIMAL(10,2) NOT NULL,
    "charged_at" TIMESTAMP(3) NOT NULL,
    "source" "toll_transaction_source" NOT NULL DEFAULT 'INTEGRATION',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toll_audits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "toll_transaction_id" UUID NOT NULL,
    "toll_prediction_id" UUID,
    "discrepancy_amount" DECIMAL(10,2),
    "status" "toll_audit_status" NOT NULL DEFAULT 'PENDING',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toll_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "category" "expense_category" NOT NULL,
    "description" TEXT,
    "planned_amount" DECIMAL(10,2),
    "actual_amount" DECIMAL(10,2),
    "occurred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_metrics" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "planned_distance_km" DECIMAL(10,2),
    "planned_duration_min" INTEGER,
    "planned_fuel_liters" DECIMAL(10,2),
    "planned_toll_amount" DECIMAL(10,2),
    "planned_total_cost" DECIMAL(10,2),
    "actual_distance_km" DECIMAL(10,2),
    "actual_duration_min" INTEGER,
    "actual_fuel_liters" DECIMAL(10,2),
    "actual_toll_amount" DECIMAL(10,2),
    "actual_total_cost" DECIMAL(10,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "document_type" NOT NULL,
    "owner_type" "document_owner_type" NOT NULL,
    "owner_id" UUID NOT NULL,
    "number" TEXT,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "document_id" UUID,
    "entity_name" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "type" "attachment_type" NOT NULL DEFAULT 'OTHER',
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_references" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "external_system" "external_system" NOT NULL,
    "external_id" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_document_key" ON "tenants"("document");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key" ON "tenant_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "user_accounts_tenant_id_idx" ON "user_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_tenant_id_email_key" ON "user_accounts"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_name_entity_id_idx" ON "audit_logs"("tenant_id", "entity_name", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "fleets_tenant_id_idx" ON "fleets"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_idx" ON "vehicles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_plate_key" ON "vehicles"("tenant_id", "plate");

-- CreateIndex
CREATE INDEX "trailers_tenant_id_idx" ON "trailers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trailers_tenant_id_plate_key" ON "trailers"("tenant_id", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "tag_providers_name_key" ON "tag_providers"("name");

-- CreateIndex
CREATE INDEX "vehicle_tags_tenant_id_idx" ON "vehicle_tags"("tenant_id");

-- CreateIndex
CREATE INDEX "vehicle_tags_vehicle_id_idx" ON "vehicle_tags"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_tags_tag_provider_id_tag_number_key" ON "vehicle_tags"("tag_provider_id", "tag_number");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_account_id_key" ON "drivers"("user_account_id");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_idx" ON "drivers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_tenant_id_cnh_number_key" ON "drivers"("tenant_id", "cnh_number");

-- CreateIndex
CREATE INDEX "driver_shifts_tenant_id_idx" ON "driver_shifts"("tenant_id");

-- CreateIndex
CREATE INDEX "driver_shifts_driver_id_idx" ON "driver_shifts"("driver_id");

-- CreateIndex
CREATE INDEX "driver_shifts_trip_id_idx" ON "driver_shifts"("trip_id");

-- CreateIndex
CREATE INDEX "shift_breaks_driver_shift_id_idx" ON "shift_breaks"("driver_shift_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_compositions_trip_id_key" ON "trip_compositions"("trip_id");

-- CreateIndex
CREATE INDEX "trip_compositions_tenant_id_idx" ON "trip_compositions"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_compositions_vehicle_id_idx" ON "trip_compositions"("vehicle_id");

-- CreateIndex
CREATE INDEX "trip_composition_trailers_tenant_id_idx" ON "trip_composition_trailers"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_composition_trailers_trailer_id_idx" ON "trip_composition_trailers"("trailer_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_composition_trailers_trip_composition_id_position_orde_key" ON "trip_composition_trailers"("trip_composition_id", "position_order");

-- CreateIndex
CREATE UNIQUE INDEX "axle_configurations_trip_composition_id_key" ON "axle_configurations"("trip_composition_id");

-- CreateIndex
CREATE INDEX "axle_configurations_tenant_id_idx" ON "axle_configurations"("tenant_id");

-- CreateIndex
CREATE INDEX "trips_tenant_id_status_idx" ON "trips"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "trips_tenant_id_created_at_idx" ON "trips"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "route_versions_tenant_id_idx" ON "route_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_versions_trip_id_version_number_key" ON "route_versions"("trip_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "route_events_resulting_route_version_id_key" ON "route_events"("resulting_route_version_id");

-- CreateIndex
CREATE INDEX "route_events_tenant_id_idx" ON "route_events"("tenant_id");

-- CreateIndex
CREATE INDEX "route_events_trip_id_idx" ON "route_events"("trip_id");

-- CreateIndex
CREATE INDEX "tracking_points_tenant_id_idx" ON "tracking_points"("tenant_id");

-- CreateIndex
CREATE INDEX "tracking_points_trip_id_recorded_at_idx" ON "tracking_points"("trip_id", "recorded_at");

-- CreateIndex
CREATE INDEX "alerts_tenant_id_idx" ON "alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "alerts_trip_id_idx" ON "alerts"("trip_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_alert_id_idx" ON "notifications"("alert_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_status_idx" ON "notifications"("recipient_id", "status");

-- CreateIndex
CREATE INDEX "telemetry_tenant_id_idx" ON "telemetry"("tenant_id");

-- CreateIndex
CREATE INDEX "telemetry_vehicle_id_recorded_at_idx" ON "telemetry"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE INDEX "telemetry_trip_id_idx" ON "telemetry"("trip_id");

-- CreateIndex
CREATE INDEX "toll_rates_toll_plaza_id_idx" ON "toll_rates"("toll_plaza_id");

-- CreateIndex
CREATE UNIQUE INDEX "toll_rates_toll_plaza_id_axle_category_effective_from_key" ON "toll_rates"("toll_plaza_id", "axle_category", "effective_from");

-- CreateIndex
CREATE INDEX "toll_predictions_route_version_id_idx" ON "toll_predictions"("route_version_id");

-- CreateIndex
CREATE INDEX "toll_predictions_toll_plaza_id_idx" ON "toll_predictions"("toll_plaza_id");

-- CreateIndex
CREATE INDEX "toll_transactions_tenant_id_idx" ON "toll_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "toll_transactions_trip_id_idx" ON "toll_transactions"("trip_id");

-- CreateIndex
CREATE INDEX "toll_transactions_toll_plaza_id_charged_at_idx" ON "toll_transactions"("toll_plaza_id", "charged_at");

-- CreateIndex
CREATE UNIQUE INDEX "toll_audits_toll_transaction_id_key" ON "toll_audits"("toll_transaction_id");

-- CreateIndex
CREATE INDEX "toll_audits_tenant_id_status_idx" ON "toll_audits"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "trip_expenses_tenant_id_idx" ON "trip_expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "trip_expenses_trip_id_category_idx" ON "trip_expenses"("trip_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "trip_metrics_trip_id_key" ON "trip_metrics"("trip_id");

-- CreateIndex
CREATE INDEX "trip_metrics_tenant_id_idx" ON "trip_metrics"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_owner_type_owner_id_idx" ON "documents"("tenant_id", "owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "documents_expires_at_idx" ON "documents"("expires_at");

-- CreateIndex
CREATE INDEX "attachments_tenant_id_entity_name_entity_id_idx" ON "attachments"("tenant_id", "entity_name", "entity_id");

-- CreateIndex
CREATE INDEX "external_references_tenant_id_entity_name_entity_id_idx" ON "external_references"("tenant_id", "entity_name", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_external_system_external_id_key" ON "external_references"("external_system", "external_id");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tags" ADD CONSTRAINT "vehicle_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tags" ADD CONSTRAINT "vehicle_tags_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_tags" ADD CONSTRAINT "vehicle_tags_tag_provider_id_fkey" FOREIGN KEY ("tag_provider_id") REFERENCES "tag_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_shifts" ADD CONSTRAINT "driver_shifts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_driver_shift_id_fkey" FOREIGN KEY ("driver_shift_id") REFERENCES "driver_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_compositions" ADD CONSTRAINT "trip_compositions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_compositions" ADD CONSTRAINT "trip_compositions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_compositions" ADD CONSTRAINT "trip_compositions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_composition_trailers" ADD CONSTRAINT "trip_composition_trailers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_composition_trailers" ADD CONSTRAINT "trip_composition_trailers_trip_composition_id_fkey" FOREIGN KEY ("trip_composition_id") REFERENCES "trip_compositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_composition_trailers" ADD CONSTRAINT "trip_composition_trailers_trailer_id_fkey" FOREIGN KEY ("trailer_id") REFERENCES "trailers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_configurations" ADD CONSTRAINT "axle_configurations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "axle_configurations" ADD CONSTRAINT "axle_configurations_trip_composition_id_fkey" FOREIGN KEY ("trip_composition_id") REFERENCES "trip_compositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_origin_location_id_fkey" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_versions" ADD CONSTRAINT "route_versions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_events" ADD CONSTRAINT "route_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_events" ADD CONSTRAINT "route_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_events" ADD CONSTRAINT "route_events_resulting_route_version_id_fkey" FOREIGN KEY ("resulting_route_version_id") REFERENCES "route_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_points" ADD CONSTRAINT "tracking_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_points" ADD CONSTRAINT "tracking_points_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_route_event_id_fkey" FOREIGN KEY ("route_event_id") REFERENCES "route_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_rates" ADD CONSTRAINT "toll_rates_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_predictions" ADD CONSTRAINT "toll_predictions_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "route_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_predictions" ADD CONSTRAINT "toll_predictions_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_transactions" ADD CONSTRAINT "toll_transactions_toll_plaza_id_fkey" FOREIGN KEY ("toll_plaza_id") REFERENCES "toll_plazas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_audits" ADD CONSTRAINT "toll_audits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_audits" ADD CONSTRAINT "toll_audits_toll_transaction_id_fkey" FOREIGN KEY ("toll_transaction_id") REFERENCES "toll_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toll_audits" ADD CONSTRAINT "toll_audits_toll_prediction_id_fkey" FOREIGN KEY ("toll_prediction_id") REFERENCES "toll_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_metrics" ADD CONSTRAINT "trip_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_metrics" ADD CONSTRAINT "trip_metrics_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
