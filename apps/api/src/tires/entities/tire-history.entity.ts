import { ApiProperty } from '@nestjs/swagger';

export enum TireHistoryEventType {
  MOVEMENT = 'MOVEMENT',
  RETREAD = 'RETREAD',
  INSPECTION = 'INSPECTION',
  DISPOSAL = 'DISPOSAL',
}

// GET /tires/:id/history -- linha do tempo consolidada (movimentacoes +
// recapagens + inspecoes + descarte), mais recente primeiro. Cada evento
// mantem seu proprio registro de origem intacto (GET /tires/:id/movements
// etc.) -- esta e apenas uma visao agregada de leitura.
export class TireHistoryEventEntity {
  @ApiProperty({ enum: TireHistoryEventType })
  type!: TireHistoryEventType;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  date!: Date;

  @ApiProperty()
  description!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true })
  userName!: string | null;
}

export class TireHistoryEntity {
  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty({ type: [TireHistoryEventEntity] })
  events!: TireHistoryEventEntity[];
}
