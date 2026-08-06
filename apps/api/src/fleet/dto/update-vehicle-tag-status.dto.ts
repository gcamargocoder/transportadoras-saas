import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateVehicleTagStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa a tag; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
