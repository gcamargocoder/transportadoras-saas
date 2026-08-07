import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseTripSettlementDto {
  @ApiPropertyOptional({ example: 'Fechamento conferido com o financeiro.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
