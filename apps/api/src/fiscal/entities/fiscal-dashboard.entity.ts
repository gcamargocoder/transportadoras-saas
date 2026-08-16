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
}
