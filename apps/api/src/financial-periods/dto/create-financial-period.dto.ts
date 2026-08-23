import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

// POST /finance/periods -- secao 4 do pedido: nasce sempre OPEN, bloqueado
// se ja existir um periodo para o mesmo year+month (constraint unica
// tenantId+year+month).
export class CreateFinancialPeriodDto {
  @ApiProperty({ example: 2026, minimum: 2000, maximum: 2100 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 8, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}
