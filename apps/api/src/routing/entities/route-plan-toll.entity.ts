import { ApiProperty } from '@nestjs/swagger';
import { TollMatchStatus } from '@prisma/client';

export class RoutePlanTollEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tollPlazaId!: string | null;

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  distanceFromOriginMeters!: number;

  @ApiProperty({
    nullable: true,
    description: 'Previsao (TOLL ESTIMATED) -- nunca a cobranca real (ver TollTransaction).',
  })
  estimatedAmount!: number | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ nullable: true })
  axleCountUsed!: number | null;

  @ApiProperty({ enum: TollMatchStatus })
  matchStatus!: TollMatchStatus;

  @ApiProperty({ nullable: true, description: '0..1 -- confianca da correspondencia com a TollPlaza.' })
  matchConfidence!: number | null;

  @ApiProperty()
  source!: string;
}
