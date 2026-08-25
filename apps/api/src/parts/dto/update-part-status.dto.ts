import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePartStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa, false = inativa.' })
  @IsBoolean()
  isActive!: boolean;
}
