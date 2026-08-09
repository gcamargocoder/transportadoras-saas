import { ApiProperty } from '@nestjs/swagger';

export class TrackingPointEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty({ nullable: true })
  speedKmh!: number | null;

  @ApiProperty({ nullable: true })
  headingDeg!: number | null;

  @ApiProperty()
  recordedAt!: Date;
}

export class TrackingPointsSyncResultEntity {
  @ApiProperty({ description: 'Quantidade de pontos recebidos no lote.' })
  received!: number;

  @ApiProperty({ description: 'Quantidade de pontos novos efetivamente gravados.' })
  created!: number;

  @ApiProperty({ description: 'Quantidade de pontos ignorados por ja terem sido sincronizados antes (mesmo deviceEventId).' })
  duplicates!: number;
}
