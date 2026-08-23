import { ApiProperty } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';

export type DriverShiftStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export const DRIVER_SHIFT_STATUSES: DriverShiftStatus[] = ['OPEN', 'CLOSED', 'CANCELLED'];

// Fase 67 -- pausa dentro de uma jornada. type reaproveita TripStopType
// (ja possui REST/MEAL/FUEL/MAINTENANCE/OTHER, ver schema.prisma).
// durationMinutes e SEMPRE derivado (endedAt - startedAt), nulo enquanto a
// pausa estiver em curso.
export class ShiftBreakEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverShiftId!: string;

  @ApiProperty({ enum: TripStopType })
  type!: TripStopType;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

// Fase 67 -- jornada de trabalho do motorista. status e SEMPRE derivado de
// endedAt/cancelledAt (mesmo padrao de TripStop/TripOccurrence), nunca uma
// coluna redundante. durationMinutes/workedMinutes sao calculos MINIMOS
// (duracao total e duracao total menos pausas) -- nunca uma apuracao de
// jornada legal (sem eSocial, sem intervalos obrigatorios, sem hora extra).
export class DriverShiftEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({
    enum: DRIVER_SHIFT_STATUSES,
    description: 'Sempre computado a partir de endedAt/cancelledAt -- nunca uma coluna redundante.',
  })
  status!: DriverShiftStatus;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'endedAt - startedAt. Nulo enquanto a jornada estiver aberta.' })
  durationMinutes!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'durationMinutes menos a soma das pausas encerradas. Calculo minimo, sem valor legal/trabalhista.',
  })
  workedMinutes!: number | null;

  @ApiProperty({ type: [ShiftBreakEntity] })
  breaks!: ShiftBreakEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
