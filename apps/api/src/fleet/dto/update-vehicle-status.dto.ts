import { ApiProperty } from '@nestjs/swagger';
import { VehicleStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateVehicleStatusDto {
  @ApiProperty({
    enum: VehicleStatus,
    example: VehicleStatus.MAINTENANCE,
    description: 'Situacao do veiculo: ACTIVE, INACTIVE, MAINTENANCE ou SOLD.',
  })
  @IsEnum(VehicleStatus, { message: 'status invalido.' })
  status!: VehicleStatus;
}
