import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDriverStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa o motorista; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
