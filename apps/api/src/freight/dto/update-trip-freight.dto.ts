import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateTripFreightDto {
  @ApiPropertyOptional({ description: 'Valor efetivamente negociado/contratado com o cliente.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  contractedAmount?: number;

  @ApiPropertyOptional({ description: 'Valor final de fechamento (opcional, distinto da receita registrada).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  finalAmount?: number;
}
