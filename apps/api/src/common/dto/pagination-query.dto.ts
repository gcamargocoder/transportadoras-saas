import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Base reutilizavel por qualquer listagem paginada (Drivers hoje; Vehicles/
// Trips no futuro estendem esta classe). @Type() explicito porque query
// params sempre chegam como string -- nao depende de metadata implicita de
// design:type (fonte de um bug real na Fase 4 sob ts-jest).
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
