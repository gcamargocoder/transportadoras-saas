import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceProviderType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// isActive nao faz parte deste DTO de proposito: uma oficina/fornecedor
// sempre nasce ativa (default do schema) -- muda via PATCH /:id/status,
// mesmo padrao ja usado por CreateFuelStationDto/CreateTagProviderDto.
export class CreateMaintenanceProviderDto {
  @ApiProperty({ enum: MaintenanceProviderType, description: 'WORKSHOP (oficina) ou SUPPLIER (fornecedor).' })
  @IsEnum(MaintenanceProviderType, { message: 'type invalido.' })
  type!: MaintenanceProviderType;

  @ApiProperty({ example: 'Oficina Central Diesel' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'Central Diesel' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @ApiPropertyOptional({ example: '12345678000199', description: 'CPF/CNPJ, opcional.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

  @ApiPropertyOptional({ example: '(41) 3222-1100' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'contato@oficinacentral.com.br' })
  @IsOptional()
  @IsEmail({}, { message: 'email invalido.' })
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: 'João Mecânico', description: 'Pessoa de contato.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @ApiPropertyOptional({ example: 'Motor, câmbio, freios', description: 'Especialidades (tipicamente de oficinas).' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  specialties?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
