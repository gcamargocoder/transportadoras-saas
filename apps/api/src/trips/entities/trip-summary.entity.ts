import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

// GET /trips/:id/summary -- visao consolidada, reaproveitando dados ja
// existentes em Trip + TripMetrics + TollTransaction (nenhum dado novo
// persistido, apenas agregado para leitura).
export class TripSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty()
  originName!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Duracao em minutos (executada, senao prevista).' })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true, description: 'Distancia em km (executada, senao prevista).' })
  distanceKm!: number | null;

  @ApiProperty({ description: 'Quantidade de transacoes de pedagio registradas na viagem.' })
  tollTransactionsCount!: number;

  @ApiProperty({ description: 'Soma dos valores de pedagio cobrados na viagem.' })
  tollTransactionsTotal!: number;

  @ApiProperty({ nullable: true })
  plannedTotalCost!: number | null;

  @ApiProperty({ nullable: true })
  actualTotalCost!: number | null;
}
