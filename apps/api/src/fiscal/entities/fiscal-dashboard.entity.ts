import { ApiProperty } from '@nestjs/swagger';
import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FiscalIssueCode } from '../utils/fiscal-document-validation.util';
import { FiscalDocumentEntity } from './fiscal-document.entity';

// Fase 54 -- contagem de documentos por motivo objetivo de inconsistencia
// estrutural (nunca fiscal/SEFAZ). "XML invalido" nao aparece aqui: nunca e
// persistido (rejeitado com 400 no momento da importacao, ver
// FiscalDocumentsService.importXml) -- nao ha como contar algo que nunca
// chega a existir como FiscalDocument.
export class FiscalIssueCountEntity {
  @ApiProperty({ enum: FiscalIssueCode })
  code!: FiscalIssueCode;

  @ApiProperty()
  count!: number;
}

export class FiscalDocumentTypeCountEntity {
  @ApiProperty({ enum: FiscalDocumentType })
  type!: FiscalDocumentType;

  @ApiProperty()
  count!: number;
}

export class FiscalDocumentStatusCountEntity {
  @ApiProperty({ enum: FiscalDocumentStatus })
  status!: FiscalDocumentStatus;

  @ApiProperty()
  count!: number;
}

// GET /fiscal/documents/dashboard -- nao listado literalmente na secao 7 do
// pedido (que lista so CRUD/upload/import), mas indispensavel para a secao
// 8 (dashboard com indicadores agregados/graficos) funcionar sem carregar
// todos os documentos no cliente -- mesmo padrao de todo dashboard ja
// existente no projeto (1 endpoint de agregacao dedicado por dominio).
export class FiscalDashboardEntity {
  @ApiProperty()
  totalDocuments!: number;

  @ApiProperty()
  cteCount!: number;

  @ApiProperty()
  mdfeCount!: number;

  @ApiProperty()
  nfeCount!: number;

  @ApiProperty()
  ciotCount!: number;

  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  validCount!: number;

  @ApiProperty()
  invalidCount!: number;

  // Fase 54 -- ja existia como status no banco (FiscalDocumentStatus.
  // CANCELLED) mas nunca tinha um KPI proprio no dashboard.
  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty({ description: 'Documentos sem NENHUM vinculo operacional (tripId/vehicleId/driverId/customerId todos nulos).' })
  unlinkedCount!: number;

  // Fase 53 -- "vinculados" = totalDocuments - unlinkedCount (documento com
  // PELO MENOS 1 vinculo, nao necessariamente os 4). Campo derivado, nunca
  // uma segunda contagem paralela.
  @ApiProperty({ description: 'totalDocuments - unlinkedCount (documento com pelo menos 1 vinculo operacional).' })
  linkedCount!: number;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses (por issueDate quando presente, senao createdAt), respeita os demais filtros (tipo/status/vinculo), ignora periodo.' })
  monthlyEvolution!: DashboardChartPointEntity[];

  @ApiProperty({ type: [FiscalDocumentTypeCountEntity], description: 'Ranking por tipo de documento -- ordenado por count desc.' })
  byType!: FiscalDocumentTypeCountEntity[];

  @ApiProperty({ type: [FiscalDocumentStatusCountEntity] })
  byStatus!: FiscalDocumentStatusCountEntity[];

  // Fase 53 -- PENDING/INVALID mais recentes (limite fixo), para o painel
  // "documentos pendentes/problematicos" do dashboard. Reaproveita a mesma
  // FiscalDocumentEntity/include ja usada pela listagem, nunca uma
  // projecao paralela.
  // Fase 54 -- criterio ampliado (secao 2): agora inclui tambem documentos
  // VALID/CANCELLED com 1+ inconsistencia estrutural (chave/tipo/campos/
  // data/duplicidade/vinculo), nao so PENDING/INVALID. Cada item traz
  // `validationIssues` preenchido com o(s) motivo(s) objetivo(s).
  @ApiProperty({ type: [FiscalDocumentEntity], description: 'Documentos que exigem atencao (status pendente/invalido OU 1+ inconsistencia estrutural), mais recentes primeiro, ate 10, no mesmo escopo de filtro do dashboard.' })
  problematicDocuments!: FiscalDocumentEntity[];

  // Fase 54, secao 4 -- alertas fiscais: contagem por motivo objetivo,
  // calculada em memoria sobre o mesmo lote ja carregado para os demais
  // indicadores (nunca uma query por documento, nunca persistido).
  @ApiProperty({ type: [FiscalIssueCountEntity] })
  alerts!: FiscalIssueCountEntity[];

  // Fase 55, secao 5 -- contagem de VIAGENS (nao documentos) por situacao
  // documental (TripDocumentComplianceStatus), calculada agrupando em
  // memoria os mesmos documentos ja carregados para os demais indicadores
  // (groupBy tripId, zero queries adicionais). So conta viagens que tem
  // PELO MENOS 1 documento fiscal no escopo do filtro -- viagens sem
  // nenhum documento nunca aparecem aqui (equivalente a UNAVAILABLE, que
  // nao e contado como problema).
  @ApiProperty({ description: 'Viagens (com pelo menos 1 documento no escopo do filtro) cuja situacao documental e OK.' })
  tripsWithDocumentsOk!: number;

  @ApiProperty({ description: 'Viagens com situacao documental ATTENTION (pendencia sem inconsistencia critica).' })
  tripsWithDocumentsAttention!: number;

  @ApiProperty({ description: 'Viagens com situacao documental PROBLEMATIC (invalido/cancelado com contexto ou divergencia operacional).' })
  tripsWithDocumentsProblematic!: number;

  // Fase 55, secao 2/5 -- documentos com FiscalIssueCode.INCONSISTENT_LINK
  // (veiculo/motorista/cliente do documento diverge do real da viagem) --
  // extraido diretamente de "alerts" (nunca uma segunda contagem paralela).
  @ApiProperty({ description: 'Documentos com divergencia operacional (veiculo/motorista/cliente diferente do real da viagem vinculada) -- mesmo dado de alerts[INCONSISTENT_LINK].' })
  operationalDivergenceCount!: number;

  // Fase 55, secao 5 -- evolucao mensal de documentos PROBLEMATICOS (mesmo
  // criterio de problematicDocuments), nao de todos os documentos --
  // distinto de monthlyEvolution (Fase 53, todos os documentos).
  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses de documentos problematicos (mesmo criterio de problematicDocuments), no mesmo escopo de filtro.' })
  problemsMonthlyEvolution!: DashboardChartPointEntity[];

  // Fase 56, secao 5 -- comprovante de entrega (DELIVERY_PROOF). Mesmo
  // agrupamento por viagem ja usado por tripsWithDocuments* (reaproveitado,
  // zero queries novas): universo = viagens com pelo menos 1 documento
  // fiscal no escopo do filtro atual (o mesmo ja usado acima) -- NUNCA
  // todas as viagens do tenant (esse dado nao esta disponivel aqui sem uma
  // query nova ao modulo Trips, fora do escopo desta agregacao).
  @ApiProperty({ description: 'Viagens (do mesmo universo de tripsWithDocuments*) com pelo menos 1 comprovante de entrega vinculado.' })
  tripsWithDeliveryProof!: number;

  @ApiProperty({ description: 'Viagens (do mesmo universo) sem nenhum comprovante de entrega vinculado.' })
  tripsWithoutDeliveryProof!: number;

  @ApiProperty({
    nullable: true,
    description:
      'tripsWithDeliveryProof / (tripsWithDeliveryProof + tripsWithoutDeliveryProof) * 100, arredondado. Null quando o denominador e 0 (ver deliveryProofCoverageAvailable) -- nunca um percentual inventado.',
  })
  deliveryProofCoveragePercent!: number | null;

  @ApiProperty({ description: 'false quando nao ha nenhuma viagem com documento fiscal no escopo do filtro (denominador 0) -- ver deliveryProofCoveragePercent.' })
  deliveryProofCoverageAvailable!: boolean;

  @ApiProperty({ description: 'Comprovantes de entrega (documentos, nao viagens) com status PENDING.' })
  deliveryProofPendingCount!: number;

  @ApiProperty({ description: 'Comprovantes de entrega com status INVALID/CANCELLED ou 1+ inconsistencia estrutural.' })
  deliveryProofProblematicCount!: number;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, so documentos DELIVERY_PROOF, no mesmo escopo de filtro.' })
  deliveryProofMonthlyEvolution!: DashboardChartPointEntity[];

  // Fase 57 -- CIOT (ja contado em ciotCount/byType desde a Fase 53).
  // Indicadores especificos por DOCUMENTO (mesma semantica de linkedCount/
  // unlinkedCount acima, so filtrada por tipo) -- calculados em memoria
  // sobre o mesmo lote/mapa de issues ja carregado para os demais
  // indicadores (zero queries novas).
  @ApiProperty({ description: 'Documentos CIOT com pelo menos 1 vinculo operacional (tripId/vehicleId/driverId/customerId).' })
  ciotLinkedCount!: number;

  @ApiProperty({ description: 'Documentos CIOT sem NENHUM vinculo operacional.' })
  ciotUnlinkedCount!: number;

  @ApiProperty({ description: 'Documentos CIOT com status PENDING.' })
  ciotPendingCount!: number;

  @ApiProperty({ description: 'Documentos CIOT com status INVALID.' })
  ciotInvalidCount!: number;

  @ApiProperty({ description: 'Documentos CIOT com status PENDING/INVALID OU 1+ inconsistencia estrutural (mesmo criterio de problematicDocuments).' })
  ciotProblematicCount!: number;

  @ApiProperty({ description: 'Documentos CIOT com FiscalIssueCode.INCONSISTENT_LINK (veiculo/motorista/cliente diferente do real da viagem vinculada).' })
  ciotOperationalDivergenceCount!: number;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, so documentos CIOT, no mesmo escopo de filtro.' })
  ciotMonthlyEvolution!: DashboardChartPointEntity[];

  // Fase 58 -- MDF-e <-> CT-e/NF-e, derivado exclusivamente de chNFe/chCTe
  // ja declarados no XML (metadata.manifestedAccessKeys), calculado em
  // memoria sobre o MESMO lote de classificationRows ja carregado (zero
  // queries novas). Conta cada documento (MDF-e e o CT-e/NF-e que ele
  // manifesta) UMA vez quando ambas as pontas estao no escopo do filtro
  // atual -- nunca por aproximacao de numero/data/valor.
  @ApiProperty({ description: 'Documentos (NF-e/CT-e/MDF-e) com 1+ relacionamento manifesto com outro documento no mesmo escopo de filtro.' })
  relatedDocumentsCount!: number;
}
