import { ApiProperty } from '@nestjs/swagger';

export class ChecklistAnswersSubmitResultEntity {
  @ApiProperty({ description: 'Respostas novas gravadas neste lote.' })
  created!: number;

  @ApiProperty({ description: 'Respostas ja existentes atualizadas (ou reenviadas de forma idempotente, mesmo valor) neste lote.' })
  updated!: number;
}
