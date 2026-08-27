import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripDeliveryStopStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTripDeliveryStopStatusDto {
  @ApiProperty({ enum: TripDeliveryStopStatus, example: TripDeliveryStopStatus.IN_PROGRESS })
  @IsEnum(TripDeliveryStopStatus, { message: 'status invalido.' })
  status!: TripDeliveryStopStatus;

  // Fase 99 -- obrigatorio somente quando status=FAILED (validado no
  // service, mesmo padrao de UpdatePipelineOpportunityStageDto.reason).
  @ApiPropertyOptional({ description: 'Motivo da falha -- obrigatorio quando status=FAILED.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
