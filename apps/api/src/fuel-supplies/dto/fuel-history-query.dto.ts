import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class FuelHistoryQueryDto {
  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Quantidade de abastecimentos recentes retornados.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
