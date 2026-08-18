import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DriverType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsCnhCategory } from '../validators/is-cnh-category.validator';
import { IsCpf } from '../validators/is-cpf.validator';

export class CreateDriverDto {
  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  @MaxLength(150, { message: 'name deve ter no maximo 150 caracteres.' })
  name!: string;

  @ApiProperty({ example: '529.982.247-25', description: 'CPF (com ou sem formatacao).' })
  @IsCpf({ message: 'cpf invalido.' })
  cpf!: string;

  @ApiPropertyOptional({ example: 'MG-12.345.678' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'rg deve ter no maximo 20 caracteres.' })
  rg?: string;

  @ApiProperty({ example: '12345678900', description: 'Numero de registro da CNH.' })
  @IsString()
  @MinLength(5, { message: 'cnhNumber deve ter no minimo 5 caracteres.' })
  @MaxLength(20, { message: 'cnhNumber deve ter no maximo 20 caracteres.' })
  cnhNumber!: string;

  @ApiProperty({
    example: 'AE',
    description: 'Categoria da CNH (A, B, C, D, E ou combinacoes AB/AC/AD/AE).',
  })
  @IsCnhCategory()
  cnhCategory!: string;

  @ApiProperty({ example: '2027-06-30', description: 'Data de validade da CNH (ISO 8601).' })
  @IsDateString(
    {},
    { message: 'cnhExpiresAt deve ser uma data valida (ISO 8601, ex: "2027-06-30").' },
  )
  cnhExpiresAt!: string;

  @ApiPropertyOptional({ example: '1990-04-12' })
  @IsOptional()
  @IsDateString({}, { message: 'birthDate deve ser uma data valida (ISO 8601).' })
  birthDate?: string;

  @ApiPropertyOptional({ example: '11987654321' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'phone deve ter no minimo 8 caracteres.' })
  @MaxLength(20, { message: 'phone deve ter no maximo 20 caracteres.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'joao.motorista@empresa.com.br' })
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email?: string;

  @ApiPropertyOptional({ example: 'Rua das Flores, 123' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({ example: 'Belo Horizonte' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'MG', minLength: 2, maxLength: 2 })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'state deve ser a UF com 2 letras (ex: MG).' })
  state?: string;

  @ApiPropertyOptional({ example: '30130000', description: 'CEP, 8 digitos numericos.' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'zipCode deve conter exatamente 8 digitos numericos (CEP).' })
  zipCode?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'notes deve ter no maximo 1000 caracteres.' })
  notes?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'admissionDate deve ser uma data valida (ISO 8601).' })
  admissionDate?: string;

  @ApiPropertyOptional({
    enum: DriverType,
    default: DriverType.OWN,
    description: 'Classificacao operacional: OWN (proprio), AGGREGATED (agregado) ou THIRD_PARTY (terceiro).',
  })
  @IsOptional()
  @IsEnum(DriverType, { message: 'type invalido.' })
  type?: DriverType;

  @ApiPropertyOptional({ default: true, description: 'Disponibilidade operacional (nunca inferida automaticamente).' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
