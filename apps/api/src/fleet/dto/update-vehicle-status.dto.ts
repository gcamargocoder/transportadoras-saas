import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateVehicleStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa o veiculo; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
