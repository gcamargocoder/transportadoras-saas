import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTagProviderStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa a operadora; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
