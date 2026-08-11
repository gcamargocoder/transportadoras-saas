import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { SubmitChecklistAnswerItemDto } from './submit-checklist-answer-item.dto';

// POST /driver/checklists/:id/answers -- batch, mesmo espirito do batch de
// tracking-points (Fase 26): reenviar o mesmo lote apos reconexao e
// idempotente (upsert por executionId+itemId, ver ChecklistExecutionsService.
// submitAnswers), nunca duplica.
export class SubmitChecklistAnswersDto {
  @ApiProperty({ type: [SubmitChecklistAnswerItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200, { message: 'no maximo 200 respostas por lote.' })
  @ValidateNested({ each: true })
  @Type(() => SubmitChecklistAnswerItemDto)
  answers!: SubmitChecklistAnswerItemDto[];
}
