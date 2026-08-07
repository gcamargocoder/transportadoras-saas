import { ApiProperty } from '@nestjs/swagger';
import { TireStatus } from '@prisma/client';

export class TireDashboardStatusCountEntity {
  @ApiProperty({ enum: TireStatus })
  status!: TireStatus;

  @ApiProperty()
  count!: number;
}

// stockCount/inUseCount/scrappedCount sao um espelho conveniente de
// countByStatus (status STOCK/IN_USE/SCRAPPED); retreadedTiresCount e
// DISTINTO de countByStatus[RETREADED] -- conta pneus com pelo menos uma
// recapagem no HISTORICO (ainda que hoje estejam IN_USE de novo), nao
// apenas os que estao com status = RETREADED agora. nearReplacementCount
// usa um limiar fixo documentado no service (ver TiresService.getDashboard).
export class TireDashboardEntity {
  @ApiProperty({ type: [TireDashboardStatusCountEntity] })
  countByStatus!: TireDashboardStatusCountEntity[];

  @ApiProperty()
  stockCount!: number;

  @ApiProperty()
  inUseCount!: number;

  @ApiProperty()
  scrappedCount!: number;

  @ApiProperty({ description: 'Pneus com pelo menos uma recapagem registrada no historico.' })
  retreadedTiresCount!: number;

  @ApiProperty({ description: 'Soma de Tire.purchasePrice.' })
  investedValue!: number;

  @ApiProperty({ description: 'Soma de TireRetread.cost.' })
  retreadValue!: number;

  @ApiProperty({
    description: 'Media de Tire.expectedLifespanKm (entre os pneus que tem o campo preenchido).',
  })
  averageLifespanKm!: number;

  @ApiProperty({
    description:
      'Media do odometro da movimentacao mais recente de cada pneu (aproximacao de quilometragem atual).',
  })
  averageMileageKm!: number;

  @ApiProperty({
    description: 'Pneus IN_USE com currentTreadDepthMm <= 3mm (limiar de seguranca).',
  })
  nearReplacementCount!: number;
}
