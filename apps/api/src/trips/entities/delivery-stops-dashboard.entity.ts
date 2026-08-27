import { ApiProperty } from '@nestjs/swagger';

// Fase 99 -- resumo operacional das entregas (mesmos filtros de
// FindDeliveryStopsQueryDto exceto status/late, que nao fazem sentido aqui:
// este endpoint PRODUZ a contagem por status).
export class DeliveryStopsDashboardEntity {
  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  inProgressCount!: number;

  @ApiProperty()
  completedCount!: number;

  @ApiProperty({ description: 'Entregas tentadas sem sucesso (status=FAILED).' })
  failedCount!: number;

  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty({ description: 'PENDING/IN_PROGRESS com plannedArrival no passado -- ainda aberta e atrasada.' })
  lateCount!: number;

  @ApiProperty()
  totalCount!: number;
}
