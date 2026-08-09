import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class LastLocationEntity {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  recordedAt!: Date;
}

// Resumo minimo da viagem que precisa da atencao do motorista agora (Fase
// 25, secao 2) -- so o que o mockup pede: destino, veiculo, ultima posicao,
// ultima atualizacao. `status` diz ao app se e caso de mostrar "Iniciar"
// (PLANNED/WAITING_*) ou "Continuar/Encerrar" (IN_PROGRESS/PAUSED). Detalhe
// completo fica em GET /driver/trips/:id.
export class DriverActiveTripEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ type: LastLocationEntity, nullable: true })
  lastLocation!: LastLocationEntity | null;

  @ApiProperty()
  updatedAt!: Date;
}
