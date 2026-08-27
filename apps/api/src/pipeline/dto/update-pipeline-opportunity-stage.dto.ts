import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdatePipelineOpportunityStageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'stageId deve ser um UUID valido.' })
  stageId!: string;

  @ApiPropertyOptional({ description: 'Obrigatorio quando o estagio de destino e isLost=true.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
