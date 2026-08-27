import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentSource, FiscalDocumentStatus, FiscalDocumentType, TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { FiscalIssueCode } from '../utils/fiscal-document-validation.util';

// Fase 56 -- QUEM criou o documento, nunca uma coluna nova: derivado em
// tempo de leitura de creator.role (ja incluido em toda query via
// FISCAL_DOCUMENT_INCLUDE) -- DRIVER = enviado pelo Driver App (comprovante
// de entrega em campo), ADMIN = qualquer outro papel (fluxo administrativo).
export type FiscalDocumentOrigin = 'DRIVER' | 'ADMIN';

// Fase 55, secao 3 -- projecao leve de um documento RELACIONADO (nunca a
// entity completa, para nao recursar/inflar o payload). So aparece quando a
// relacao e DERIVAVEL de dados ja existentes (chNFe/chCTe manifestados no
// XML do MDF-e) -- nunca um vinculo inventado nem alteracao no banco.
export class RelatedFiscalDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FiscalDocumentType })
  documentType!: FiscalDocumentType;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty({ nullable: true })
  accessKey!: string | null;

  @ApiProperty({ enum: FiscalDocumentStatus })
  status!: FiscalDocumentStatus;

  @ApiProperty({ nullable: true })
  fileName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;
}

// status=VALID significa apenas "estrutura/conteudo basico reconhecido pelo
// sistema" (parser XML ou revisao manual) -- NUNCA validacao fiscal oficial
// perante a SEFAZ (ver docs/fiscal-documents.md).
export class FiscalDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ enum: FiscalDocumentType })
  documentType!: FiscalDocumentType;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty({ nullable: true })
  accessKey!: string | null;

  @ApiProperty({ nullable: true })
  series!: string | null;

  @ApiProperty({ nullable: true })
  issueDate!: Date | null;

  @ApiProperty({ nullable: true })
  senderName!: string | null;

  @ApiProperty({ nullable: true })
  senderDocument!: string | null;

  @ApiProperty({ nullable: true })
  recipientName!: string | null;

  @ApiProperty({ nullable: true })
  recipientDocument!: string | null;

  @ApiProperty({ enum: FiscalDocumentStatus })
  status!: FiscalDocumentStatus;

  @ApiProperty({ enum: FiscalDocumentSource })
  source!: FiscalDocumentSource;

  @ApiProperty({ format: 'uuid', nullable: true })
  attachmentId!: string | null;

  @ApiProperty({ nullable: true })
  fileName!: string | null;

  @ApiProperty({ nullable: true })
  mimeType!: string | null;

  @ApiProperty({ nullable: true })
  sizeBytes!: number | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Campos adicionais reconhecidos pelo parser XML sem coluna propria (ex: amount).',
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ nullable: true, example: 'São Paulo/SP → Curitiba/PR' })
  tripLabel!: string | null;

  // Fase 100 -- vinculo direto com a parada/entrega especifica (Fase 88).
  @ApiProperty({ format: 'uuid', nullable: true })
  tripDeliveryStopId!: string | null;

  @ApiProperty({ nullable: true, description: 'Sequencia (#N) da parada, quando vinculada.' })
  tripDeliveryStopSequence!: number | null;

  // Fase 102 -- vinculo direto com a ocorrencia especifica (Fase 67/101).
  @ApiProperty({ format: 'uuid', nullable: true })
  tripOccurrenceId!: string | null;

  @ApiProperty({ enum: TripOccurrenceType, nullable: true, description: 'Tipo da ocorrencia vinculada, quando houver.' })
  tripOccurrenceType!: TripOccurrenceType | null;

  @ApiProperty({ enum: TripOccurrenceSeverity, nullable: true, description: 'Severidade da ocorrencia vinculada, quando houver.' })
  tripOccurrenceSeverity!: TripOccurrenceSeverity | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  // Fase 56 -- ver FiscalDocumentOrigin acima.
  @ApiProperty({ enum: ['DRIVER', 'ADMIN'] })
  origin!: FiscalDocumentOrigin;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  // Fase 54 -- motivos OBJETIVOS de inconsistencia estrutural (nunca fiscal/
  // SEFAZ), calculados sob demanda pelo service (classifyFiscalDocumentIssues)
  // -- nunca persistido. Lista vazia = nenhum problema estrutural identificado.
  @ApiProperty({ enum: FiscalIssueCode, isArray: true })
  validationIssues!: FiscalIssueCode[];

  // Fase 55, secao 3 -- so calculado em GET /fiscal/documents/:id (nunca em
  // listagem/dashboard, para nao introduzir N+1). relatedDocumentsAvailable
  // = false quando o tipo nao participa de manifesto (CIOT/DELIVERY_PROOF/
  // OTHER/etc.) OU quando os dados disponiveis nao permitem derivar a
  // relacao (ex: MDF-e sem chNFe/chCTe no XML) -- nunca um vinculo inventado.
  @ApiProperty({ type: [RelatedFiscalDocumentEntity] })
  relatedDocuments!: RelatedFiscalDocumentEntity[];

  @ApiProperty({ description: 'false quando nao ha dados suficientes (chave/manifesto) para derivar relacionamento -- ver relatedDocuments.' })
  relatedDocumentsAvailable!: boolean;
}
