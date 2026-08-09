import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'BRL', minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'currency deve ter exatamente 3 caracteres (ISO 4217, ex: BRL).' })
  currency?: string;

  @ApiPropertyOptional({ example: 'pt-BR' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Intervalo de ping de GPS, em segundos.', example: 30 })
  @IsOptional()
  @IsInt()
  @Min(5, { message: 'gpsPingIntervalSeconds deve ser no minimo 5 segundos.' })
  gpsPingIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Limite de desvio de rota tolerado, em metros.',
    example: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDeviationMeters?: number;

  @ApiPropertyOptional({
    description: 'Tempo de atraso, em minutos, para disparar alerta.',
    example: 15,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  alertDelayThresholdMin?: number;

  @ApiPropertyOptional({
    description:
      'Minutos consecutivos fora da rota planejada (Fase 26) para confirmar um desvio sustentado.',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  routeDeviationMinutes?: number;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Preferencias adicionais em formato livre (JSON), para uso de futuras funcionalidades.',
  })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, unknown>;
}
