import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AssignDriverVehicleDto {
  @ApiProperty({ format: 'uuid', description: 'Veiculo a vincular ao motorista.' })
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
