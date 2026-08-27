import { ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// documentType/accessKey/source/attachment sao identidade do documento --
// nunca editaveis por aqui (evita reabrir a checagem de duplicidade sobre
// um registro ja existente). O que pode ser corrigido/completado depois:
// metadados manuais e vinculo operacional (secao 2 do pedido -- "documento
// deve poder ser vinculado a operacao existente", nao necessariamente no
// momento da criacao).
export class UpdateFiscalDocumentDto {
  @ApiPropertyOptional({ enum: FiscalDocumentStatus })
  @IsOptional()
  @IsEnum(FiscalDocumentStatus, { message: 'status invalido.' })
  status?: FiscalDocumentStatus;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentNumber?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @ApiPropertyOptional({ example: '2026-08-16' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  senderDocument?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientDocument?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Envie null para desvincular.', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string | null;

  // Fase 100 -- vinculo direto com a parada/entrega especifica (Fase 88).
  // Envie null para desvincular. Quando setado para um valor nao-nulo, exige
  // a parada COMPLETED e pertencente a tripId (o informado neste mesmo PATCH,
  // ou o ja gravado no documento quando tripId nao muda).
  @ApiPropertyOptional({ format: 'uuid', description: 'Envie null para desvincular. Exige a parada COMPLETED.', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'tripDeliveryStopId deve ser um UUID valido.' })
  tripDeliveryStopId?: string | null;

  // Fase 102 -- vinculo direto com a ocorrencia especifica (TripOccurrence).
  // Envie null para desvincular. Nenhuma exigencia de status da ocorrencia.
  @ApiPropertyOptional({ format: 'uuid', description: 'Envie null para desvincular.', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'tripOccurrenceId deve ser um UUID valido.' })
  tripOccurrenceId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string | null;
}
