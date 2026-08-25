import { ApiProperty } from '@nestjs/swagger';

// Secao 9 da Fase 83. estimatedStockValue fica null (com reason explicito)
// quando nenhuma peca tem custo unitario conhecido -- nunca um valor
// financeiro inventado (ver PartsService.getDashboard).
export class PartsDashboardEntity {
  @ApiProperty()
  totalParts!: number;

  @ApiProperty()
  activeParts!: number;

  @ApiProperty()
  inactiveParts!: number;

  @ApiProperty({ description: 'currentStock <= minStock (subconjunto de activeParts + inativas, ver Part.isLowStock).' })
  lowStockCount!: number;

  @ApiProperty({ description: 'currentStock <= 0.' })
  zeroStockCount!: number;

  @ApiProperty({ nullable: true, description: 'Soma de currentStock * ultimo unitCost conhecido, so entre pecas com custo conhecido.' })
  estimatedStockValue!: number | null;

  @ApiProperty({ description: 'Quando estimatedStockValue e null: motivo explicito (ex: nenhuma peca com custo unitario registrado).' })
  estimatedStockValueUnavailableReason!: string | null;

  @ApiProperty({ description: 'Quantidade de pecas SEM nenhum custo unitario conhecido, excluidas de estimatedStockValue.' })
  partsWithoutKnownCost!: number;

  @ApiProperty({ description: 'Soma de quantity das movimentacoes IN no periodo (ver PartsDashboardQueryDto).' })
  entriesInPeriod!: number;

  @ApiProperty({ description: 'Soma de quantity das movimentacoes OUT no periodo.' })
  exitsInPeriod!: number;
}
