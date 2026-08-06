import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTenantAdminDto } from './create-tenant-admin.dto';

export class CreateTenantDto {
  @ApiProperty({ example: 'Transportadora Exemplo Ltda.', description: 'Razao social.' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  name!: string;

  @ApiPropertyOptional({ example: 'Exemplo Transportes', description: 'Nome fantasia.' })
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiProperty({ example: '12345678000199', description: 'CNPJ, apenas digitos (14 caracteres).' })
  @Matches(/^\d{14}$/, { message: 'document deve conter exatamente 14 digitos numericos (CNPJ).' })
  document!: string;

  @ApiPropertyOptional({
    example: 'transportadora-exemplo',
    description:
      'Identificador unico/URL-safe da empresa (preparado para uso futuro em subdominio). Gerado a partir de "name" se omitido.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug deve conter apenas letras minusculas, numeros e hifen (ex: "minha-empresa").',
  })
  slug?: string;

  @ApiProperty({
    type: CreateTenantAdminDto,
    description: 'Primeiro usuario administrador da empresa.',
  })
  @ValidateNested()
  @Type(() => CreateTenantAdminDto)
  admin!: CreateTenantAdminDto;
}
