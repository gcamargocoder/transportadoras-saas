-- Fase 69 -- Centro de Alertas, Notificacoes e Acoes Operacionais.
-- Migration aditiva: ativa o model Notification (orfao ate aqui, zero uso
-- em codigo -- confirmado por auditoria) como centro interno de
-- notificacoes lidas/nao-lidas. alertId/channel/status/sentAt viram
-- opcionais (preservados para uma fase futura de entrega por canal
-- externo, nunca removidos/reaproveitados com outro significado).

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('CRITICAL_OCCURRENCE', 'VEHICLE_UNAVAILABLE', 'VEHICLE_MAINTENANCE', 'TIRE_NEAR_REPLACEMENT', 'FUEL_ODOMETER_REGRESSION', 'FISCAL_DOCUMENT_PROBLEM', 'TRIP_DELAYED', 'DRIVER_SUSPENDED', 'DRIVER_INACTIVE', 'BILLING_PENDING');

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_alert_id_fkey";

-- DropIndex
DROP INDEX "notifications_recipient_id_status_idx";

-- AlterTable (Notification orfao/vazio ate esta fase -- NOT NULL sem
-- default e seguro, nao ha linha existente para violar a restricao)
ALTER TABLE "notifications" ADD COLUMN     "entity_id" UUID NOT NULL,
ADD COLUMN     "entity_type" TEXT NOT NULL,
ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "severity" "alert_severity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "notification_type" NOT NULL,
ALTER COLUMN "alert_id" DROP NOT NULL,
ALTER COLUMN "channel" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex (deduplicacao -- mesmo alerta nunca gera 2 notificacoes
-- logicas para o mesmo destinatario)
CREATE UNIQUE INDEX "notifications_tenant_id_recipient_id_type_entity_type_entit_key" ON "notifications"("tenant_id", "recipient_id", "type", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
