import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class BillingDashboardQueryDto {
  @ApiPropertyOptional({ description: 'Inicio do periodo para "recebido no periodo" (ISO 8601). Default: inicio do mes atual.' })
  @IsOptional()
  @IsDateString({}, { message: 'from deve ser uma data valida (ISO 8601).' })
  from?: string;

  @ApiPropertyOptional({ description: 'Fim do periodo para "recebido no periodo" (ISO 8601). Default: agora.' })
  @IsOptional()
  @IsDateString({}, { message: 'to deve ser uma data valida (ISO 8601).' })
  to?: string;
}
