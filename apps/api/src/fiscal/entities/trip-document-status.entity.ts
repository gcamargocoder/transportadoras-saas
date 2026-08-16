import { ApiProperty } from '@nestjs/swagger';
import { FiscalDocumentType } from '@prisma/client';

// GET /fiscal/documents/trip/:tripId/status -- visao consolidada da
// situacao documental de UMA viagem (Fase 53, secao 2). "Tipos ausentes"
// e so a diferenca entre o catalogo de FiscalDocumentType e o que esta
// presente -- NUNCA uma lista de "documentos obrigatorios" (essa regra de
// negocio nao existe no projeto, nunca inventada aqui).
export class TripDocumentStatusEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  totalDocuments!: number;

  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  validCount!: number;

  @ApiProperty()
  invalidCount!: number;

  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty({ enum: FiscalDocumentType, isArray: true, description: 'Tipos com pelo menos 1 documento vinculado a esta viagem.' })
  presentTypes!: FiscalDocumentType[];

  @ApiProperty({
    enum: FiscalDocumentType,
    isArray: true,
    description: 'Tipos do catalogo (FiscalDocumentType) sem nenhum documento vinculado -- informativo, nunca uma exigencia de negocio.',
  })
  absentTypes!: FiscalDocumentType[];
}
