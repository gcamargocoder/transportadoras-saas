import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Industria Exemplo Ltda.' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '12345678000199', description: 'CNPJ ou CPF, apenas digitos.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

  // Fase 93 -- informacoes comerciais basicas (CRM). Mesmo padrao de
  // validacao ja usado por Driver/MaintenanceProvider/FuelStation.
  @ApiPropertyOptional({ example: '1131234567' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'phone deve ter no minimo 8 caracteres.' })
  @MaxLength(20, { message: 'phone deve ter no maximo 20 caracteres.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'contato@industriaexemplo.com.br' })
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email?: string;

  @ApiPropertyOptional({ example: 'Av. Industrial, 1000 - São Paulo/SP' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}
