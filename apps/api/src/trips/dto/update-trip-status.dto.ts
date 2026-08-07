import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateTripStatusDto {
  @ApiProperty({ enum: TripStatus, example: TripStatus.IN_PROGRESS })
  @IsEnum(TripStatus, { message: 'status invalido.' })
  status!: TripStatus;

  @ApiPropertyOptional({
    example: 128500,
    description:
      'Quilometragem final do veiculo (odometro). Informada apenas ao concluir a viagem ' +
      '(status COMPLETED) -- atualiza automaticamente Vehicle.odometerKm.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'finalOdometerKm deve ser maior ou igual a zero.' })
  finalOdometerKm?: number;
}
