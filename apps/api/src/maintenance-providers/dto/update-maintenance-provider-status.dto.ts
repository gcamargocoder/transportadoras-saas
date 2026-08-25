import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateMaintenanceProviderStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa, false = inativa.' })
  @IsBoolean()
  isActive!: boolean;
}
