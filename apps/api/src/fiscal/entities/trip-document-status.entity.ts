import { ApiProperty } from '@nestjs/swagger';
import { FiscalDocumentType } from '@prisma/client';
import { DeliveryProofStatus, TripDocumentComplianceStatus } from '../utils/trip-compliance.util';
import { FiscalDocumentEntity } from './fiscal-document.entity';

// Fase 55, secao 1 -- 1 linha por tipo do catalogo FiscalDocumentType
// (mesmo com totalCount=0 -- "ausente" nunca vira erro, so contagem zerada).
export class TripDocumentMatrixRowEntity {
  @ApiProperty({ enum: FiscalDocumentType })
  documentType!: FiscalDocumentType;

  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  present!: boolean;

  @ApiProperty()
  structurallyValidCount!: number;

  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  invalidCount!: number;

  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty()
  problematicCount!: number;

  @ApiProperty()
  duplicateCandidateCount!: number;

  @ApiProperty({ description: 'Documentos com 1+ inconsistencia estrutural, independente do status (distinto de problematicCount, que tambem conta PENDING sem nenhum problema).' })
  withIssuesCount!: number;

  @ApiProperty({ description: 'Documentos deste tipo, sem nenhum vinculo, mas com evidencia objetiva (veiculo/motorista/cliente) em comum com esta viagem -- ver unlinkedCandidates.' })
  unlinkedRelatedCount!: number;

  // Fase 58 -- MDF-e <-> CT-e/NF-e, derivado exclusivamente de chNFe/chCTe
  // ja declarados no XML (metadata.manifestedAccessKeys). Documentos de
  // outros tipos (CIOT/DACTE/DAMDFE/comprovante de entrega/outros) sempre 0.
  @ApiProperty({ description: 'Documentos deste tipo com 1+ relacionamento manifesto (MDF-e <-> CT-e/NF-e, via chNFe/chCTe do XML) com outro documento desta viagem.' })
  relatedCount!: number;
}

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

  // Fase 55, secao 4 -- indicador de situacao documental da viagem. NUNCA
  // "conformidade SEFAZ": classificacao interna sobre a coerencia/estrutura
  // dos dados ja existentes (ver TripDocumentComplianceStatus).
  @ApiProperty({
    enum: TripDocumentComplianceStatus,
    description:
      'OK (sem problemas), ATTENTION (pendencia sem inconsistencia critica), PROBLEMATIC (invalido/cancelado com contexto/divergencia operacional) ou ' +
      'UNAVAILABLE (sem documentos para avaliar). NUNCA representa autorizacao/validacao fiscal perante a SEFAZ.',
  })
  complianceStatus!: TripDocumentComplianceStatus;

  // Fase 55, secao 1 -- matriz operacional por tipo documental.
  @ApiProperty({ type: [TripDocumentMatrixRowEntity] })
  matrix!: TripDocumentMatrixRowEntity[];

  // Fase 55, secao 7 -- documentos SEM vinculo a nenhuma viagem, mas com
  // evidencia objetiva (veiculo/motorista/cliente identico ao desta viagem)
  // -- nunca matching agressivo/heuristico. Vazio quando a viagem nao tem
  // veiculo/motorista/cliente definidos o suficiente para comparar, ou
  // quando nenhum documento bate.
  @ApiProperty({ type: [FiscalDocumentEntity], description: 'Ate 10 documentos sem vinculo com evidencia objetiva em comum com esta viagem.' })
  unlinkedCandidates!: FiscalDocumentEntity[];

  // Fase 56, secao 3 -- status do comprovante de entrega, sempre derivado da
  // linha DELIVERY_PROOF de `matrix` (nunca uma maquina de estados nova).
  @ApiProperty({
    enum: DeliveryProofStatus,
    description: 'MISSING (sem comprovante), PENDING (comprovante aguardando revisao), AVAILABLE (comprovante estruturalmente valido) ou PROBLEMATIC (invalido/cancelado/inconsistente).',
  })
  deliveryProofStatus!: DeliveryProofStatus;
}
