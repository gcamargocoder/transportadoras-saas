import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTenantStatusDto {
  @ApiProperty({ example: false, description: 'true = ativa a empresa; false = desativa.' })
  @IsBoolean()
  isActive!: boolean;
}
