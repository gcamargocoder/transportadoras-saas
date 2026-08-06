import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTrailerStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa o implemento; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
