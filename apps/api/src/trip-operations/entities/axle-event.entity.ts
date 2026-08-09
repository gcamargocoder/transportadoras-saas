import { ApiProperty } from '@nestjs/swagger';
import { AxleEventSource, SyncStatus } from '@prisma/client';

export class AxleEventEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tollPlazaId!: string | null;

  @ApiProperty({ nullable: true })
  tollPlazaName!: string | null;

  @ApiProperty()
  defaultAxles!: number;

  @ApiProperty()
  declaredAxles!: number;

  @ApiProperty()
  suspendedAxles!: number;

  @ApiProperty({ enum: AxleEventSource })
  source!: AxleEventSource;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty()
  createdAt!: Date;
}
