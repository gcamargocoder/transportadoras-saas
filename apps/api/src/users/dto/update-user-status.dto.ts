import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa o usuario; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
