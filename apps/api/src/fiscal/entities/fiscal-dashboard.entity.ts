import { ApiProperty } from '@nestjs/swagger';
import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FiscalDocumentEntity } from './fiscal-document.entity';

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
  @ApiProperty({ type: [FiscalDocumentEntity], description: 'Documentos PENDING/INVALID mais recentes (ate 10), no mesmo escopo de filtro do dashboard.' })
  problematicDocuments!: FiscalDocumentEntity[];
}
