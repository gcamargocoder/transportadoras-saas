import { ApiProperty } from '@nestjs/swagger';
import { RoutePlanEntity } from './route-plan.entity';

export class RouteComparisonEntity {
  @ApiProperty()
  distanceMetersDiff!: number;

  @ApiProperty()
  durationSecondsDiff!: number;

  @ApiProperty()
  tollCountDiff!: number;

  @ApiProperty({ nullable: true })
  totalTollAmountDiff!: number | null;
}

// Resposta de POST /trips/:id/route-plan/recalculate -- "ROTA ORIGINAL / NOVA
// ROTA / Diferenca" (Fase 26, secao Recalculo). previous e null quando a
// viagem nunca teve uma RoutePlan antes (primeiro calculo, nao um recalculo
// de fato).
export class RoutePlanComparisonEntity {
  @ApiProperty({ type: RoutePlanEntity, nullable: true })
  previous!: RoutePlanEntity | null;

  @ApiProperty({ type: RoutePlanEntity })
  next!: RoutePlanEntity;

  @ApiProperty({ type: RouteComparisonEntity, nullable: true })
  difference!: RouteComparisonEntity | null;
}
