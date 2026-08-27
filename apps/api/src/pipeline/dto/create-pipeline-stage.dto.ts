import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

// Fase 96 -- estagio do pipeline, configuravel por tenant. `order` opcional:
// quando omitido, o service posiciona o novo estagio apos o ultimo
// existente (nunca exige o cliente calcular a proxima posicao).
export class CreatePipelineStageDto {
  @ApiProperty({ example: 'Negociação avançada' })
  @IsString()
  @MinLength(1, { message: 'name e obrigatorio.' })
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Posicao no Kanban. Omitido: apos o ultimo estagio existente.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ default: false, description: 'Marca este estagio como um fechamento GANHO (terminal).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isWon?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Marca este estagio como um fechamento PERDIDO (terminal).' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isLost?: boolean;
}
