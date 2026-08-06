import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UpdateTenantSettingsDto } from './update-tenant-settings.dto';

// PATCH /tenants/:id (SUPER_ADMIN) -- edicao completa de QUALQUER empresa,
// incluindo campos de identidade (document/slug) que o self-service
// (UpdateTenantDto, PATCH /tenants/me) nao permite alterar.
export class UpdateTenantFullDto {
  @ApiPropertyOptional({ description: 'Razao social.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Nome fantasia.' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional({
    example: '12345678000199',
    description: 'CNPJ, apenas digitos (14 caracteres).',
  })
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'document deve conter exatamente 14 digitos numericos (CNPJ).' })
  document?: string;

  @ApiPropertyOptional({ description: 'Identificador unico/URL-safe.' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug deve conter apenas letras minusculas, numeros e hifen (ex: "minha-empresa").',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'URL do logotipo.' })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl deve ser uma URL valida.' })
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'true = ativa a empresa; false = desativa.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: UpdateTenantSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTenantSettingsDto)
  settings?: UpdateTenantSettingsDto;
}
