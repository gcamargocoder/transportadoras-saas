-- Fase 56 -- idempotencia de submissao offline de comprovante de entrega
-- (Driver App) por deviceEventId, mesmo padrao ja usado por
-- ChecklistExecution/TripStop/FuelSupply/AxleEvent.
ALTER TABLE "fiscal_documents" ADD COLUMN "device_event_id" TEXT;

CREATE UNIQUE INDEX "fiscal_documents_device_event_id_key" ON "fiscal_documents"("device_event_id");
