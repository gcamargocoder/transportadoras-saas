import { ApiProperty } from '@nestjs/swagger';
import { RouteTollEstimateSource, RouteVersionReason } from '@prisma/client';
import { RoutePlanTollEntity } from './route-plan-toll.entity';

export class RoutePlanEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  originLabel!: string;

  @ApiProperty()
  destinationLabel!: string;

  @ApiProperty()
  originLatitude!: number;

  @ApiProperty()
  originLongitude!: number;

  @ApiProperty()
  destinationLatitude!: number;

  @ApiProperty()
  destinationLongitude!: number;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty({
    nullable: true,
    description: 'Previsao (TOLL ESTIMATED) -- nunca confundir com custo realizado (TollTransaction).',
  })
  totalTollAmount!: number | null;

  @ApiProperty({ enum: RouteTollEstimateSource })
  tollEstimateSource!: RouteTollEstimateSource;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ nullable: true })
  axleCountUsed!: number | null;

  @ApiProperty({ enum: RouteVersionReason })
  reason!: RouteVersionReason;

  @ApiProperty()
  provider!: string;

  @ApiProperty({ nullable: true })
  providerRouteId!: string | null;

  @ApiProperty({ description: 'Se esta e a RoutePlan atualmente selecionada da viagem (Trip.routePlanId).' })
  isCurrent!: boolean;

  @ApiProperty({ type: RoutePlanTollEntity, isArray: true })
  tolls!: RoutePlanTollEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
