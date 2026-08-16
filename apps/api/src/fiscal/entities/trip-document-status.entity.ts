import { ApiProperty } from '@nestjs/swagger';
import { FiscalDocumentType } from '@prisma/client';
import { FiscalDocumentEntity } from './fiscal-document.entity';

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

  // Fase 54, secao 3 -- expansao da conformidade documental da viagem.
  @ApiProperty({ description: 'status = VALID e nenhuma inconsistencia estrutural identificada (classifyFiscalDocumentIssues retornou []).' })
  structurallyValidCount!: number;

  @ApiProperty({ description: 'status PENDING/INVALID OU 1+ inconsistencia estrutural (mesmo criterio do dashboard, secao 2).' })
  problematicCount!: number;

  @ApiProperty({ type: [FiscalDocumentEntity], description: 'Documentos desta viagem que exigem atencao, com validationIssues preenchido.' })
  problematicDocuments!: FiscalDocumentEntity[];

  // Nunca inventa percentual: nao existe, em nenhum lugar do projeto, uma
  // regra que defina QUAIS tipos de documento uma viagem deveria ter. Sem
  // esse "conjunto aplicavel" claramente definido, retornar um numero seria
  // inventar dado -- por isso este campo e SEMPRE null nesta fase (secao 3
  // do pedido: "retornar disponibilidade/indisponibilidade em vez de
  // inventar percentual"). completenessAvailable=false documenta o motivo
  // de forma explicita para o consumidor da API, em vez de um null mudo.
  @ApiProperty({ nullable: true, description: 'Sempre null nesta fase -- nao ha conjunto de tipos obrigatorios definido para calcular completude (ver completenessAvailable).' })
  completenessPercent!: number | null;

  @ApiProperty({ description: 'Sempre false nesta fase -- indica que completenessPercent e indisponivel por falta de regra de negocio definida, nunca um percentual inventado.' })
  completenessAvailable!: boolean;
}
