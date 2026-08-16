import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentSource, FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';

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

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
