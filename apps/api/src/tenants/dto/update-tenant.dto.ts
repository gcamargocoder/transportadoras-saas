import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { UpdateTenantSettingsDto } from './update-tenant-settings.dto';

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Razao social.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Nome fantasia.' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({ type: UpdateTenantSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTenantSettingsDto)
  settings?: UpdateTenantSettingsDto;
}
