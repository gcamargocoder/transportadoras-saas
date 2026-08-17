import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class InvoiceTripBillingDto {
  @ApiPropertyOptional({
    description: 'Valor a faturar. Omitido = fatura o saldo inteiro (faturamento total).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'amount deve ser maior que zero quando informado.' })
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
