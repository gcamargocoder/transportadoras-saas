import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// So BOOLEAN e funcionalmente validado ponta a ponta nesta fase (Fase 38,
// secao 7) -- os demais campos existem para nao travar a evolucao futura do
// formulario (TEXT/NUMBER/SELECT), mas o service so exige consistencia
// minima (ver ChecklistExecutionsService.submitAnswers).
export class SubmitChecklistAnswerItemDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4', { message: 'itemId deve ser um UUID valido.' })
  itemId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  textValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  numberValue?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  selectedValue?: string;
}
