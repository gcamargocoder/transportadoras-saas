import { ApiProperty } from '@nestjs/swagger';
import { SettlementStatus } from '@prisma/client';

// GET /trips/:id/settlement -- se a viagem nunca foi fechada, id/closedBy/
// closedAt/notes/createdAt/updatedAt vem null e os totais sao calculados ao
// vivo (status OPEN, "preview"). Uma vez fechada, os totais ficam
// congelados no snapshot ate o proximo fechamento (ver TripSettlementsService).
export class TripSettlementEntity {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'null enquanto a viagem nunca foi fechada.',
  })
  id!: string | null;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  totalRevenue!: number;

  @ApiProperty()
  totalExpenses!: number;

  @ApiProperty()
  totalAdvances!: number;

  @ApiProperty({ description: 'totalRevenue - totalExpenses - totalAdvances. Pode ser negativo.' })
  netResult!: number;

  @ApiProperty({ enum: SettlementStatus })
  status!: SettlementStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  closedBy!: string | null;

  @ApiProperty({ nullable: true })
  closedByName!: string | null;

  @ApiProperty({ nullable: true })
  closedAt!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ nullable: true })
  updatedAt!: Date | null;
}
