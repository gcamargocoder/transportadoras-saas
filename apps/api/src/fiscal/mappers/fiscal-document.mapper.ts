import { Customer, Driver, FiscalDocument, Location, Trip, UserAccount, Vehicle } from '@prisma/client';
import { FiscalDocumentEntity } from '../entities/fiscal-document.entity';

export type FiscalDocumentWithRelations = FiscalDocument & {
  // Fase 54 -- composition.vehicleId adicionado para permitir conferir
  // consistencia de vinculo (INCONSISTENT_LINK), ver fiscal-document-
  // validation.util.ts. Nunca usado pelo mapper em si, so repassado ao
  // classificador no service.
  trip: (Trip & { origin: Location; destination: Location; composition: { vehicleId: string } | null }) | null;
  vehicle: Vehicle | null;
  driver: Driver | null;
  customer: Customer | null;
  creator: UserAccount;
  updater: UserAccount | null;
};

export function toFiscalDocumentEntity(document: FiscalDocumentWithRelations): FiscalDocumentEntity {
  const entity = new FiscalDocumentEntity();
  entity.id = document.id;
  entity.tenantId = document.tenantId;
  entity.documentType = document.documentType;
  entity.documentNumber = document.documentNumber;
  entity.accessKey = document.accessKey;
  entity.series = document.series;
  entity.issueDate = document.issueDate;
  entity.senderName = document.senderName;
  entity.senderDocument = document.senderDocument;
  entity.recipientName = document.recipientName;
  entity.recipientDocument = document.recipientDocument;
  entity.status = document.status;
  entity.source = document.source;
  entity.attachmentId = document.attachmentId;
  entity.fileName = document.fileName;
  entity.mimeType = document.mimeType;
  entity.sizeBytes = document.sizeBytes;
  entity.metadata = (document.metadata as Record<string, unknown> | null) ?? null;
  entity.tripId = document.tripId;
  entity.tripLabel = document.trip ? `${document.trip.origin.name} → ${document.trip.destination.name}` : null;
  entity.vehicleId = document.vehicleId;
  entity.vehiclePlate = document.vehicle?.plate ?? null;
  entity.driverId = document.driverId;
  entity.driverName = document.driver?.name ?? null;
  entity.customerId = document.customerId;
  entity.customerName = document.customer?.name ?? null;
  entity.createdBy = document.createdBy;
  entity.creatorName = document.creator.name;
  // Fase 56 -- ver FiscalDocumentOrigin (nunca coluna nova, so o role do
  // criador ja incluido).
  entity.origin = document.creator.role === 'DRIVER' ? 'DRIVER' : 'ADMIN';
  entity.updatedBy = document.updatedBy;
  entity.updaterName = document.updater?.name ?? null;
  entity.createdAt = document.createdAt;
  entity.updatedAt = document.updatedAt;
  // Fase 54 -- default seguro (nunca undefined); quem precisa da
  // classificacao real chama classifyFiscalDocumentIssues() no service e
  // sobrescreve este campo (a duplicidade exige contexto em lote que o
  // mapper, deliberadamente burro/sem acesso a outras linhas, nao tem).
  entity.validationIssues = [];
  // Fase 55 -- default seguro: so GET /fiscal/documents/:id calcula a
  // relacao de verdade (1 query bounded); demais chamadores deixam
  // indisponivel em vez de fingir que verificaram (ver FiscalDocumentEntity).
  entity.relatedDocuments = [];
  entity.relatedDocumentsAvailable = false;
  return entity;
}
