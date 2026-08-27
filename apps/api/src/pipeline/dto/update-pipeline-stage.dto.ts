import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreatePipelineStageDto } from './create-pipeline-stage.dto';

// PATCH /pipeline/stages/:id -- renomear/reordenar/reclassificar (isWon/
// isLost) ou ativar/inativar. Nunca ha DELETE: um estagio ja usado por
// oportunidades nao pode ser apagado (onDelete: Restrict) -- inativar e a
// forma de "remover" um estagio da UI sem perder o historico.
export class UpdatePipelineStageDto extends PartialType(CreatePipelineStageDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
