import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateVehicleTagDto {
  @ApiProperty({ format: 'uuid', description: 'Operadora da tag (ver GET /tag-providers).' })
  @IsUUID('4', { message: 'tagProviderId deve ser um UUID valido.' })
  tagProviderId!: string;

  @ApiProperty({ example: '1234567890123456' })
  @IsString()
  @MinLength(4, { message: 'tagNumber deve ter no minimo 4 caracteres.' })
  @MaxLength(30)
  tagNumber!: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Data de ativacao da tag (se ja ativa).',
  })
  @IsOptional()
  @IsDateString({}, { message: 'activatedAt deve ser uma data valida (ISO 8601).' })
  activatedAt?: string;
}
