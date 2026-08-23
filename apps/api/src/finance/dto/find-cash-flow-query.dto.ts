import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// GET /finance/cash-flow -- from/to governam SOMENTE a serie mensal
// (secao 3 do pedido); os KPIs de resumo (secao 2) e os rankings (secao
// 4/5) reaproveitam ReceivablesDashboardService/PayablesDashboardService
// tal como ja expostos em /receivables/dashboard e /payables/dashboard
// (estado atual, sem filtro de periodo -- mesmo comportamento ja usado
// pelas paginas existentes). Sem from/to, a serie mensal usa os ultimos
// 12 meses (mesma janela padrao de aggregateMonthlySeries/Fase 19).
export class FindCashFlowQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inicio da serie mensal. Default: 11 meses antes de "to".' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fim da serie mensal. Default: hoje.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
