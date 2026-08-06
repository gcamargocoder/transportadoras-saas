import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateFleetStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa a frota; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
